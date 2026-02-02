const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { DISCORD_REGION, DISCORD_BOT_TOKEN } = require("./config");
const { createChannelMessage, deleteChannelMessage } = require("./discord-client");
const { buildPollCard } = require("./poll-card");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function fetchSlots(schedulerRef) {
  const slotsSnap = await schedulerRef.collection("slots").get();
  return slotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function fetchVotes(schedulerRef) {
  const votesSnap = await schedulerRef.collection("votes").get();
  const voteDocs = votesSnap.docs || [];
  const voteCount = votesSnap.size || voteDocs.length;
  const attendingCount = voteDocs.filter((doc) => {
    const data = doc.data?.() || {};
    if (data.noTimesWork) return false;
    const votes = data.votes || {};
    return Object.keys(votes).length > 0;
  }).length;
  return { voteCount, attendingCount };
}

function computeTotalParticipants(scheduler, group) {
  const participants = new Set((scheduler.participantIds || []).map((id) => String(id)));
  const groupMembers = (group?.memberIds || []).map((id) => String(id));
  groupMembers.forEach((id) => participants.add(id));
  return participants.size;
}

async function tryDeleteOldMessage(discord) {
  if (!discord?.channelId || !discord?.messageId) return;
  try {
    await deleteChannelMessage({
      channelId: discord.channelId,
      messageId: discord.messageId,
    });
  } catch (err) {
    logger.warn("Failed to delete old Discord poll message", {
      channelId: discord.channelId,
      messageId: discord.messageId,
      error: err?.message || String(err),
      status: err?.status || err?.statusCode,
      code: err?.code || err?.rawError?.code,
    });
  }
}

exports.discordRepostPollCard = onCall(
  {
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const schedulerId = String(request.data?.schedulerId || "").trim();
    if (!schedulerId) {
      throw new HttpsError("invalid-argument", "Missing scheduler id");
    }

    const schedulerRef = db.collection("schedulers").doc(schedulerId);
    const schedulerSnap = await schedulerRef.get();
    if (!schedulerSnap.exists) {
      throw new HttpsError("not-found", "Poll not found");
    }

    const scheduler = schedulerSnap.data() || {};
    if (scheduler.creatorId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Only the poll creator can repost");
    }

    if (!scheduler.questingGroupId) {
      throw new HttpsError("failed-precondition", "This poll is not linked to a questing group");
    }

    const groupSnap = await db.collection("questingGroups").doc(scheduler.questingGroupId).get();
    if (!groupSnap.exists) {
      throw new HttpsError("failed-precondition", "Questing group not found");
    }

    const group = groupSnap.data() || {};
    const discordLink = group.discord || {};
    if (!discordLink.channelId || !discordLink.guildId) {
      throw new HttpsError("failed-precondition", "No Discord channel linked for this group");
    }

    await tryDeleteOldMessage(scheduler.discord);

    const [slots, votes] = await Promise.all([
      fetchSlots(schedulerRef),
      fetchVotes(schedulerRef),
    ]);
    const totalParticipants = computeTotalParticipants(scheduler, group);

    const messageBody = buildPollCard({
      schedulerId,
      scheduler,
      slots,
      voteCount: votes.voteCount,
      totalParticipants,
    });

    const message = await createChannelMessage({
      channelId: discordLink.channelId,
      body: messageBody,
    });

    const messageId = message?.id || null;
    if (!messageId) {
      throw new HttpsError("internal", "Failed to post Discord poll message");
    }

    const messageUrl = `https://discord.com/channels/${discordLink.guildId}/${discordLink.channelId}/${messageId}`;

    await schedulerRef.set(
      {
        discord: {
          messageId,
          channelId: discordLink.channelId,
          guildId: discordLink.guildId,
          lastPostedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastStatus: scheduler.status || "OPEN",
          messageUrl,
          pendingSync: admin.firestore.FieldValue.delete(),
          pendingSyncAt: admin.firestore.FieldValue.delete(),
          pendingSyncError: admin.firestore.FieldValue.delete(),
        },
      },
      { merge: true }
    );

    return { messageId, messageUrl };
  }
);
