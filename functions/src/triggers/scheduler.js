const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { getFunctions } = require("firebase-admin/functions");
const {
  DISCORD_REGION,
  DISCORD_BOT_TOKEN,
  DISCORD_SCHEDULER_TASK_QUEUE,
  APP_URL,
} = require("../discord/config");
const { createChannelMessage, editChannelMessage } = require("../discord/discord-client");
const { buildPollCard, buildPollStatusCard } = require("../discord/poll-card");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function getVoteStats(schedulerRef, scheduler) {
  const votesSnap = await schedulerRef.collection("votes").get();
  const voteCount = votesSnap.size;

  const participants = new Set((scheduler.participants || []).map((e) => String(e).toLowerCase()));

  if (scheduler.questingGroupId) {
    const groupSnap = await db.collection("questingGroups").doc(scheduler.questingGroupId).get();
    if (groupSnap.exists) {
      const groupMembers = groupSnap.data()?.members || [];
      groupMembers.forEach((email) => participants.add(String(email).toLowerCase()));
    }
  }

  return { voteCount, totalParticipants: participants.size };
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

  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
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

    const groupMembers = (group.members || []).map((e) => String(e).toLowerCase());
    const participants = new Set((scheduler.participants || []).map((e) => String(e).toLowerCase()));
    groupMembers.forEach((email) => participants.add(email));
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

      const messageUrl = `https://discord.com/channels/${discordLink.guildId}/${discordLink.channelId}/${messageId}`;
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
              const messageUrl = `https://discord.com/channels/${nextGroupDiscord.guildId}/${nextGroupDiscord.channelId}/${messageId}`;
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

      const queueName =
        DISCORD_REGION === "us-central1"
          ? DISCORD_SCHEDULER_TASK_QUEUE
          : `locations/${DISCORD_REGION}/functions/${DISCORD_SCHEDULER_TASK_QUEUE}`;
      const queue = getFunctions().taskQueue(queueName);
      await queue.enqueue(
        { schedulerId },
        {
          scheduleDelaySeconds: 5,
        }
      );
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
      const { voteCount, totalParticipants } = await getVoteStats(schedulerRef, scheduler);
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

      let finalizedNotifiedAt = null;
      let reopenedNotifiedAt = null;
      if (scheduler.status === "FINALIZED" && !scheduler.discord?.finalizedNotifiedAt) {
        const groupRef = scheduler.questingGroupId
          ? db.collection("questingGroups").doc(scheduler.questingGroupId)
          : null;
        const groupSnap = groupRef ? await groupRef.get() : null;
        const groupDiscord = groupSnap?.exists ? groupSnap.data()?.discord || {} : {};
        const notifyRoleId = groupDiscord?.notifyRoleId || "everyone";
        const { mention, allowedMentions } = buildFinalizationMention(notifyRoleId);
        const winningSlot = slots.find((slot) => slot.id === scheduler.winningSlotId);
        const winningUnix = unixSeconds(winningSlot?.start);
        const winningText = winningUnix ? `<t:${winningUnix}:F>` : "a winning time";
        const pollTitle = scheduler.title || "Quest Session";
        const pollUrl = `${APP_URL}/scheduler/${schedulerId}`;

        await createChannelMessage({
          channelId: scheduler.discord.channelId,
          body: {
            content: `${mention}Poll finalized for **${pollTitle}**. Winning time: ${winningText}. View: ${pollUrl}`,
            allowed_mentions: allowedMentions,
          },
        });
        finalizedNotifiedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      if (scheduler.status === "OPEN" && scheduler.discord?.lastStatus === "FINALIZED") {
        const groupRef = scheduler.questingGroupId
          ? db.collection("questingGroups").doc(scheduler.questingGroupId)
          : null;
        const groupSnap = groupRef ? await groupRef.get() : null;
        const groupDiscord = groupSnap?.exists ? groupSnap.data()?.discord || {} : {};
        const notifyRoleId = groupDiscord?.notifyRoleId || "everyone";
        const { mention, allowedMentions } = buildFinalizationMention(notifyRoleId);
        const pollTitle = scheduler.title || "Quest Session";
        const pollUrl = `${APP_URL}/scheduler/${schedulerId}`;

        await createChannelMessage({
          channelId: scheduler.discord.channelId,
          body: {
            content: `${mention}Poll re-opened for **${pollTitle}**. The previously finalized time may no longer apply. Please vote again: ${pollUrl}`,
            allowed_mentions: allowedMentions,
          },
        });
        reopenedNotifiedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      const discordUpdates = {
        ...scheduler.discord,
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastStatus: scheduler.status || "OPEN",
        lastSyncedHash: syncHash,
        pendingSync: admin.firestore.FieldValue.delete(),
        pendingSyncAt: admin.firestore.FieldValue.delete(),
        pendingSyncError: admin.firestore.FieldValue.delete(),
      };

      if (scheduler.status === "FINALIZED") {
        if (finalizedNotifiedAt) {
          discordUpdates.finalizedNotifiedAt = finalizedNotifiedAt;
        }
        discordUpdates.reopenedNotifiedAt = admin.firestore.FieldValue.delete();
      } else {
        discordUpdates.finalizedNotifiedAt = admin.firestore.FieldValue.delete();
        if (reopenedNotifiedAt) {
          discordUpdates.reopenedNotifiedAt = reopenedNotifiedAt;
        } else {
          discordUpdates.reopenedNotifiedAt = admin.firestore.FieldValue.delete();
        }
      }

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
  },
  async (event) => {
    const schedulerId = event.params.schedulerId;

    const schedulerSnap = await db.collection("schedulers").doc(schedulerId).get();
    if (!schedulerSnap.exists) {
      return;
    }
    const scheduler = schedulerSnap.data() || {};
    if (!scheduler.discord?.messageId) {
      return;
    }

    try {
      const queueName =
        DISCORD_REGION === "us-central1"
          ? DISCORD_SCHEDULER_TASK_QUEUE
          : `locations/${DISCORD_REGION}/functions/${DISCORD_SCHEDULER_TASK_QUEUE}`;
      const queue = getFunctions().taskQueue(queueName);
      await queue.enqueue(
        { schedulerId },
        {
          scheduleDelaySeconds: 2,
        }
      );
      logger.info("Enqueued Discord poll update on vote change", { schedulerId });
    } catch (err) {
      logger.error("Failed to enqueue Discord poll update on vote change", {
        schedulerId,
        error: err?.message,
      });
    }
  }
);
