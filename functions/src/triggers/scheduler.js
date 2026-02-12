const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const {
  DISCORD_REGION,
  DISCORD_BOT_TOKEN,
  DISCORD_SCHEDULER_TASK_QUEUE,
  DISCORD_NOTIFICATION_DEFAULTS,
} = require("../discord/config");
const {
  buildDiscordMessageUrl,
  createSyncHash,
  enqueueSyncTask,
} = require("../discord/sync-core");
const { createChannelMessage, editChannelMessage } = require("../discord/discord-client");
const { buildPollCard, buildPollStatusCard } = require("../discord/poll-card");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function getVoteStats(schedulerRef, scheduler) {
  const votesSnap = await schedulerRef.collection("votes").get();
  const voteDocs = votesSnap.docs || [];
  const voteCount = votesSnap.size;
  const attendingCount = voteDocs.filter((doc) => {
    const data = doc.data?.() || {};
    if (data.noTimesWork) {
      return false;
    }
    const votes = data.votes || {};
    return Object.keys(votes).length > 0;
  }).length;

  const participants = new Set(scheduler.participantIds || []);

  if (scheduler.questingGroupId) {
    const groupSnap = await db.collection("questingGroups").doc(scheduler.questingGroupId).get();
    if (groupSnap.exists) {
      const groupMembers = groupSnap.data()?.memberIds || [];
      groupMembers.forEach((memberId) => participants.add(String(memberId)));
    }
  }

  return { voteCount, totalParticipants: participants.size, attendingCount };
}

function hasNonDiscordChanges(beforeData, afterData) {
  const beforeCopy = { ...(beforeData || {}) };
  const afterCopy = { ...(afterData || {}) };
  delete beforeCopy.discord;
  delete afterCopy.discord;
  return JSON.stringify(beforeCopy) !== JSON.stringify(afterCopy);
}

function unixSeconds(iso) {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) return null;
  return Math.floor(value / 1000);
}

function computeSchedulerSyncHash(scheduler, slots, voteCount, totalParticipants) {
  const normalizedSlots = slots
    .filter((slot) => slot.start && slot.end)
    .map((slot) => ({
      id: slot.id,
      start: slot.start,
      end: slot.end,
    }))
    .sort((a, b) => {
      const startDiff = new Date(a.start) - new Date(b.start);
      if (startDiff !== 0) return startDiff;
      const endDiff = new Date(a.end) - new Date(b.end);
      if (endDiff !== 0) return endDiff;
      return String(a.id).localeCompare(String(b.id));
    });

  const payload = {
    title: scheduler?.title || "",
    status: scheduler?.status || "OPEN",
    slots: normalizedSlots,
    voteCount: voteCount ?? null,
    totalParticipants: totalParticipants ?? null,
  };

  return createSyncHash(payload);
}

function getDiscordNotificationSettings(groupDiscord = {}) {
  const notifications = groupDiscord?.notifications || {};
  return {
    ...DISCORD_NOTIFICATION_DEFAULTS,
    ...notifications,
  };
}

async function updateDiscordStatusMessage({ discord, title, status, description }) {
  if (!discord?.channelId || !discord?.messageId) return;
  const body = buildPollStatusCard({
    title,
    status,
    description,
  });
  await editChannelMessage({
    channelId: discord.channelId,
    messageId: discord.messageId,
    body,
  });
}

function buildFinalizationMention(notifyRoleId) {
  if (!notifyRoleId || notifyRoleId === "none") {
    return { mention: "", allowedMentions: { parse: [] } };
  }
  if (notifyRoleId === "everyone") {
    return { mention: "@everyone ", allowedMentions: { parse: ["everyone"] } };
  }
  return {
    mention: `<@&${notifyRoleId}> `,
    allowedMentions: { roles: [notifyRoleId] },
  };
}

function buildSlotSnapshot(slots = []) {
  return slots
    .filter((slot) => slot.start && slot.end)
    .map((slot) => ({
      id: slot.id,
      start: slot.start,
      end: slot.end,
    }))
    .sort((a, b) => {
      const startDiff = new Date(a.start) - new Date(b.start);
      if (startDiff !== 0) return startDiff;
      const endDiff = new Date(a.end) - new Date(b.end);
      if (endDiff !== 0) return endDiff;
      return String(a.id).localeCompare(String(b.id));
    });
}

function computeSlotSetHash(slots = []) {
  const snapshot = buildSlotSnapshot(slots);
  const hash = createSyncHash(snapshot);
  return { hash, snapshot };
}

function formatSlotLine(slot) {
  const startUnix = unixSeconds(slot?.start);
  const endUnix = unixSeconds(slot?.end);
  if (startUnix && endUnix) {
    return `<t:${startUnix}:F> → <t:${endUnix}:t>`;
  }
  if (slot?.start) {
    return slot.start;
  }
  return "Unknown time";
}

exports.postDiscordPollCard = onDocumentCreated(
  {
    document: "schedulers/{schedulerId}",
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (event) => {
    const schedulerId = event.params.schedulerId;
    const scheduler = event.data?.data();
    if (!scheduler || !scheduler.questingGroupId) {
      return;
    }

    const groupSnap = await db.collection("questingGroups").doc(scheduler.questingGroupId).get();
    if (!groupSnap.exists) {
      return;
    }

    const group = groupSnap.data() || {};
    const discordLink = group.discord;
    if (!discordLink?.channelId || !discordLink?.guildId) {
      return;
    }

    const schedulerRef = db.collection("schedulers").doc(schedulerId);
    const slotsSnap = await schedulerRef.collection("slots").get();
    const slots = slotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const groupMembers = (group.memberIds || []).map((id) => String(id));
    const participants = new Set((scheduler.participantIds || []).map((id) => String(id)));
    groupMembers.forEach((id) => participants.add(id));
    const totalParticipants = participants.size;

    const messageBody = buildPollCard({
      schedulerId,
      scheduler,
      slots,
      voteCount: 0,
      totalParticipants,
    });

    try {
      const message = await createChannelMessage({
        channelId: discordLink.channelId,
        body: messageBody,
      });
      const messageId = message?.id;
      if (!messageId) {
        return;
      }

      const messageUrl = buildDiscordMessageUrl(
        discordLink.guildId,
        discordLink.channelId,
        messageId
      );
      await db.collection("schedulers").doc(schedulerId).set(
        {
          discord: {
            messageId,
            channelId: discordLink.channelId,
            guildId: discordLink.guildId,
            lastPostedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastStatus: scheduler.status || "OPEN",
            messageUrl,
          },
        },
        { merge: true }
      );
    } catch (err) {
      await db.collection("schedulers").doc(schedulerId).set(
        {
          discord: {
            pendingSync: true,
            pendingSyncAt: admin.firestore.FieldValue.serverTimestamp(),
            pendingSyncError: err?.message || "unknown",
          },
        },
        { merge: true }
      );
      logger.error("Failed to post Discord poll card", {
        schedulerId,
        error: err?.message,
      });
    }
  }
);

exports.updateDiscordPollCard = onDocumentUpdated(
  {
    document: "schedulers/{schedulerId}",
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (event) => {
    const schedulerId = event.params.schedulerId;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    if (!beforeData || !afterData) {
      return;
    }

    try {
      const groupChanged = beforeData.questingGroupId !== afterData.questingGroupId;
      if (groupChanged) {
        const previousDiscord = beforeData.discord || null;
        let nextGroupDiscord = null;
        if (afterData.questingGroupId) {
          const groupSnap = await db
            .collection("questingGroups")
            .doc(afterData.questingGroupId)
            .get();
          if (groupSnap.exists) {
            nextGroupDiscord = groupSnap.data()?.discord || null;
          }
        }

        const hasNextLink = Boolean(
          nextGroupDiscord?.channelId && nextGroupDiscord?.guildId
        );
        const sameChannel =
          previousDiscord?.channelId &&
          nextGroupDiscord?.channelId &&
          previousDiscord.channelId === nextGroupDiscord.channelId &&
          previousDiscord.guildId === nextGroupDiscord.guildId;

        if (!sameChannel) {
          if (previousDiscord?.messageId) {
            const status = hasNextLink ? "MOVED" : "UNLINKED";
            const description = hasNextLink
              ? "This poll moved to a different Discord channel."
              : "This poll is no longer linked to this channel.";
            await updateDiscordStatusMessage({
              discord: previousDiscord,
              title: beforeData.title || "Quest Session",
              status,
              description,
            });
          }

          if (hasNextLink) {
            const schedulerRef = db.collection("schedulers").doc(schedulerId);
            const slotsSnap = await schedulerRef.collection("slots").get();
            const slots = slotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            const { voteCount, totalParticipants } = await getVoteStats(schedulerRef, afterData);
            const messageBody = buildPollCard({
              schedulerId,
              scheduler: afterData,
              slots,
              voteCount,
              totalParticipants,
            });
            const message = await createChannelMessage({
              channelId: nextGroupDiscord.channelId,
              body: messageBody,
            });
            const messageId = message?.id;
            if (messageId) {
              const messageUrl = buildDiscordMessageUrl(
                nextGroupDiscord.guildId,
                nextGroupDiscord.channelId,
                messageId
              );
              await db.collection("schedulers").doc(schedulerId).set(
                {
                  discord: {
                    messageId,
                    channelId: nextGroupDiscord.channelId,
                    guildId: nextGroupDiscord.guildId,
                    lastPostedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastStatus: afterData.status || "OPEN",
                    messageUrl,
                    notifyRoleId: nextGroupDiscord.notifyRoleId || "everyone",
                  },
                },
                { merge: true }
              );
            }
          } else {
            await db.collection("schedulers").doc(schedulerId).set(
              {
                discord: admin.firestore.FieldValue.delete(),
              },
              { merge: true }
            );
          }
          return;
        }
      }

      if (!afterData.discord?.messageId) {
        return;
      }

      if (!hasNonDiscordChanges(beforeData, afterData)) {
        return;
      }

      await enqueueSyncTask({
        region: DISCORD_REGION,
        queueName: DISCORD_SCHEDULER_TASK_QUEUE,
        payload: { schedulerId },
        scheduleDelaySeconds: 5,
      });
    } catch (err) {
      logger.error("Failed to enqueue Discord poll card update", {
        schedulerId,
        error: err?.message,
      });
    }
  }
);

exports.processDiscordSchedulerUpdate = onTaskDispatched(
  {
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (request) => {
    const schedulerId = request.data?.schedulerId;
    if (!schedulerId) {
      logger.warn("Missing schedulerId for Discord poll update task");
      return;
    }

    const schedulerRef = db.collection("schedulers").doc(schedulerId);
    const schedulerSnap = await schedulerRef.get();
    if (!schedulerSnap.exists) {
      return;
    }
    const scheduler = schedulerSnap.data() || {};
    if (!scheduler.discord?.messageId || !scheduler.discord?.channelId) {
      return;
    }

    try {
      const slotsSnap = await schedulerRef.collection("slots").get();
      const slots = slotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const { voteCount, totalParticipants, attendingCount } = await getVoteStats(schedulerRef, scheduler);
      const syncHash = computeSchedulerSyncHash(scheduler, slots, voteCount, totalParticipants);

      if (scheduler.discord?.lastSyncedHash === syncHash) {
        logger.info("Skipping Discord poll update; hash unchanged", {
          schedulerId,
        });
        return;
      }

      const messageBody = buildPollCard({
        schedulerId,
        scheduler,
        slots,
        voteCount,
        totalParticipants,
      });

      await editChannelMessage({
        channelId: scheduler.discord.channelId,
        messageId: scheduler.discord.messageId,
        body: messageBody,
      });

      const discordUpdates = {
        ...scheduler.discord,
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastStatus: scheduler.status || "OPEN",
        lastSyncedHash: syncHash,
        pendingSync: admin.firestore.FieldValue.delete(),
        pendingSyncAt: admin.firestore.FieldValue.delete(),
        pendingSyncError: admin.firestore.FieldValue.delete(),
      };

      await schedulerRef.set(
        {
          discord: {
            ...discordUpdates,
          },
        },
        { merge: true }
      );
    } catch (err) {
      await schedulerRef.set(
        {
          discord: {
            ...scheduler.discord,
            pendingSync: true,
            pendingSyncAt: admin.firestore.FieldValue.serverTimestamp(),
            pendingSyncError: err?.message || "unknown",
          },
        },
        { merge: true }
      );
      logger.error("Failed to update Discord poll card", {
        schedulerId,
        error: err?.message,
      });
      throw err;
    }
  }
);

exports.handleDiscordPollDelete = onDocumentDeleted(
  {
    document: "schedulers/{schedulerId}",
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (event) => {
    const schedulerId = event.params.schedulerId;
    const data = event.data?.data();
    if (!data?.discord?.messageId || !data?.discord?.channelId) {
      return;
    }

    try {
      const description = `This poll was deleted in Quest Scheduler.`;
      await updateDiscordStatusMessage({
        discord: data.discord,
        title: data.title || "Quest Session",
        status: "DELETED",
        description,
      });

      if (data.questingGroupId) {
        const groupSnap = await db.collection("questingGroups").doc(String(data.questingGroupId)).get();
        const groupDiscord = groupSnap.exists ? groupSnap.data()?.discord || {} : {};
        const settings = getDiscordNotificationSettings(groupDiscord);
        if (settings.finalizationEvents) {
          const { mention, allowedMentions } = buildFinalizationMention(
            groupDiscord?.notifyRoleId || "everyone"
          );
          await createChannelMessage({
            channelId: data.discord.channelId,
            body: {
              content: `${mention}Poll deleted for **${data.title || "Session Poll"}**.`,
              allowed_mentions: allowedMentions,
            },
          });
        }
      }
      logger.info("Updated Discord poll card for deleted scheduler", { schedulerId });
    } catch (err) {
      logger.error("Failed to update Discord poll card on delete", {
        schedulerId,
        error: err?.message,
      });
    }
  }
);

exports.updateDiscordPollOnVote = onDocumentWritten(
  {
    document: "schedulers/{schedulerId}/votes/{voteId}",
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (event) => {
    const schedulerId = event.params.schedulerId;
    const voteId = event.params.voteId;
    const afterVote = event.data?.after?.data?.() || null;

    if (!afterVote) {
      return;
    }

    const schedulerSnap = await db.collection("schedulers").doc(schedulerId).get();
    if (!schedulerSnap.exists) {
      return;
    }
    const scheduler = schedulerSnap.data() || {};
    const hasDiscordLink = Boolean(
      scheduler.discord?.messageId && scheduler.discord?.channelId
    );

    try {
      await enqueueSyncTask({
        region: DISCORD_REGION,
        queueName: DISCORD_SCHEDULER_TASK_QUEUE,
        payload: { schedulerId },
        scheduleDelaySeconds: 2,
      });
      logger.info("Enqueued Discord poll update on vote change", { schedulerId });

    } catch (err) {
      logger.error("Failed to enqueue Discord poll update on vote change", {
        schedulerId,
        error: err?.message,
      });
    }
  }
);

exports.notifyDiscordSlotChanges = onDocumentWritten(
  {
    document: "schedulers/{schedulerId}/slots/{slotId}",
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (event) => {
    const schedulerId = event.params.schedulerId;
    const beforeSlot = event.data?.before?.data?.() || null;
    const afterSlot = event.data?.after?.data?.() || null;

    if (!beforeSlot && !afterSlot) {
      return;
    }

    const slotTimeChanged =
      !beforeSlot ||
      !afterSlot ||
      beforeSlot.start !== afterSlot.start ||
      beforeSlot.end !== afterSlot.end;
    if (!slotTimeChanged) {
      return;
    }

    const schedulerRef = db.collection("schedulers").doc(schedulerId);
    const schedulerSnap = await schedulerRef.get();
    if (!schedulerSnap.exists) {
      return;
    }
    const scheduler = schedulerSnap.data() || {};
    if (!scheduler.discord?.channelId || !scheduler.discord?.messageId) {
      return;
    }
    if (!scheduler.questingGroupId) {
      return;
    }
    if (scheduler.status && scheduler.status !== "OPEN") {
      return;
    }

    const slotsSnap = await schedulerRef.collection("slots").get();
    const slots = slotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const { hash, snapshot } = computeSlotSetHash(slots);
    const previousSnapshot = scheduler.discord?.slotSnapshot || null;

    if (!previousSnapshot) {
      await schedulerRef.set(
        {
          discord: {
            ...scheduler.discord,
            slotSetHash: hash,
            slotSnapshot: snapshot,
            slotSetUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
      return;
    }

    if (scheduler.discord?.slotSetHash === hash) {
      return;
    }

    await schedulerRef.set(
      {
        discord: {
          ...scheduler.discord,
          slotSetHash: hash,
          slotSnapshot: snapshot,
          slotSetUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
  }
);

exports.__test__ = {
  getVoteStats,
  hasNonDiscordChanges,
  computeSchedulerSyncHash,
  updateDiscordStatusMessage,
  buildFinalizationMention,
  computeSlotSetHash,
  buildSlotSnapshot,
  formatSlotLine,
  getDiscordNotificationSettings,
};
