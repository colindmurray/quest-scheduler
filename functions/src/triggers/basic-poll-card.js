const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { getFunctions } = require("firebase-admin/functions");
const {
  DISCORD_REGION,
  DISCORD_BOT_TOKEN,
  DISCORD_BASIC_POLL_TASK_QUEUE,
} = require("../discord/config");
const {
  createChannelMessage,
  editChannelMessage,
  deleteChannelMessage,
} = require("../discord/discord-client");
const { buildBasicPollCard } = require("../discord/basic-poll-card");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function snapshotExists(snapshot) {
  if (!snapshot) return false;
  if (typeof snapshot.exists === "function") return snapshot.exists();
  return snapshot.exists === true;
}

function normalizeOptionIds(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function hasSubmittedVote(pollData, voteData) {
  const voteType = pollData?.settings?.voteType === "RANKED_CHOICE" ? "RANKED_CHOICE" : "MULTIPLE_CHOICE";
  if (voteType === "RANKED_CHOICE") {
    return normalizeOptionIds(voteData?.rankings).length > 0;
  }
  const hasOptionIds = normalizeOptionIds(voteData?.optionIds).length > 0;
  const allowWriteIn = pollData?.settings?.allowWriteIn === true;
  const hasWriteIn = allowWriteIn && String(voteData?.otherText || "").trim().length > 0;
  return hasOptionIds || hasWriteIn;
}

function computeBasicPollSyncHash(pollData, voteCount, totalParticipants) {
  const payload = {
    title: pollData?.title || "",
    status: pollData?.status || "OPEN",
    description: pollData?.description || "",
    settings: pollData?.settings || {},
    options: Array.isArray(pollData?.options)
      ? pollData.options.map((option) => ({
          id: option?.id || null,
          label: option?.label || null,
          order: option?.order ?? null,
          note: option?.note ? "has-note" : "",
        }))
      : [],
    finalResults: pollData?.finalResults || null,
    voteCount: voteCount ?? null,
    totalParticipants: totalParticipants ?? null,
  };

  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildQueueName() {
  return DISCORD_REGION === "us-central1"
    ? DISCORD_BASIC_POLL_TASK_QUEUE
    : `locations/${DISCORD_REGION}/functions/${DISCORD_BASIC_POLL_TASK_QUEUE}`;
}

async function enqueueBasicPollSync(payload, scheduleDelaySeconds = 2) {
  const queue = getFunctions().taskQueue(buildQueueName());
  await queue.enqueue(payload, {
    scheduleDelaySeconds,
  });
}

async function countSubmittedVotes(pollRef, pollData) {
  const votesSnap = await pollRef.collection("votes").get();
  return votesSnap.docs.filter((voteDoc) => hasSubmittedVote(pollData, voteDoc.data() || {})).length;
}

function computeTotalParticipants(groupData) {
  const participants = new Set((groupData?.memberIds || []).map((value) => String(value)));
  if (groupData?.creatorId) {
    participants.add(String(groupData.creatorId));
  }
  return participants.size;
}

async function upsertDiscordBasicPollCard({ groupId, pollId, groupData, pollRef, pollData }) {
  const groupDiscord = groupData?.discord || {};
  if (!groupDiscord?.channelId || !groupDiscord?.guildId) {
    return;
  }

  const voteCount = await countSubmittedVotes(pollRef, pollData);
  const totalParticipants = computeTotalParticipants(groupData);
  const syncHash = computeBasicPollSyncHash(pollData, voteCount, totalParticipants);

  const currentDiscord = pollData?.discord || {};
  const sameTargetChannel =
    currentDiscord?.channelId === groupDiscord.channelId &&
    currentDiscord?.guildId === groupDiscord.guildId;

  if (sameTargetChannel && currentDiscord?.lastSyncedHash === syncHash) {
    return;
  }

  const body = buildBasicPollCard({
    groupId,
    pollId,
    poll: pollData,
    voteCount,
    totalParticipants,
  });

  let messageId = currentDiscord?.messageId || null;
  if (messageId && sameTargetChannel) {
    await editChannelMessage({
      channelId: groupDiscord.channelId,
      messageId,
      body,
    });
  } else {
    const message = await createChannelMessage({
      channelId: groupDiscord.channelId,
      body,
    });
    messageId = message?.id || null;
  }

  if (!messageId) return;

  await pollRef.set(
    {
      discord: {
        ...(pollData?.discord || {}),
        messageId,
        channelId: groupDiscord.channelId,
        guildId: groupDiscord.guildId,
        messageUrl: `https://discord.com/channels/${groupDiscord.guildId}/${groupDiscord.channelId}/${messageId}`,
        lastSyncedHash: syncHash,
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );
}

exports.enqueueDiscordBasicPollSync = onDocumentWritten(
  {
    document: "questingGroups/{groupId}/basicPolls/{pollId}",
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (event) => {
    const groupId = event.params.groupId;
    const pollId = event.params.pollId;
    const before = event.data?.before;
    const after = event.data?.after;

    const deletedDiscord =
      !snapshotExists(after) && snapshotExists(before)
        ? before.data()?.discord || null
        : null;

    try {
      await enqueueBasicPollSync(
        {
          groupId,
          pollId,
          deletedDiscord,
        },
        1
      );
    } catch (error) {
      logger.error("Failed to enqueue basic poll Discord sync", {
        groupId,
        pollId,
        error: error?.message,
      });
    }
  }
);

exports.enqueueDiscordBasicPollSyncOnVote = onDocumentWritten(
  {
    document: "questingGroups/{groupId}/basicPolls/{pollId}/votes/{userId}",
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (event) => {
    const groupId = event.params.groupId;
    const pollId = event.params.pollId;

    try {
      await enqueueBasicPollSync(
        {
          groupId,
          pollId,
        },
        1
      );
    } catch (error) {
      logger.error("Failed to enqueue basic poll vote Discord sync", {
        groupId,
        pollId,
        error: error?.message,
      });
    }
  }
);

exports.processDiscordBasicPollUpdate = onTaskDispatched(
  {
    region: DISCORD_REGION,
    secrets: [DISCORD_BOT_TOKEN],
  },
  async (request) => {
    const groupId = request?.data?.groupId;
    const pollId = request?.data?.pollId;
    const deletedDiscord = request?.data?.deletedDiscord || null;
    if (!groupId || !pollId) {
      logger.warn("Missing groupId/pollId for basic poll sync");
      return;
    }

    const groupRef = db.collection("questingGroups").doc(String(groupId));
    const pollRef = groupRef.collection("basicPolls").doc(String(pollId));

    const [groupSnap, pollSnap] = await Promise.all([groupRef.get(), pollRef.get()]);
    if (!pollSnap.exists) {
      if (deletedDiscord?.channelId && deletedDiscord?.messageId) {
        try {
          await deleteChannelMessage({
            channelId: deletedDiscord.channelId,
            messageId: deletedDiscord.messageId,
          });
        } catch (error) {
          logger.warn("Failed to delete Discord basic poll card message", {
            groupId,
            pollId,
            error: error?.message,
          });
        }
      }
      return;
    }

    if (!groupSnap.exists) {
      return;
    }

    try {
      await upsertDiscordBasicPollCard({
        groupId,
        pollId,
        groupData: groupSnap.data() || {},
        pollRef,
        pollData: pollSnap.data() || {},
      });
    } catch (error) {
      logger.error("Failed to process Discord basic poll sync", {
        groupId,
        pollId,
        error: error?.message,
      });
    }
  }
);

exports.__test__ = {
  hasSubmittedVote,
  computeBasicPollSyncHash,
  computeTotalParticipants,
  upsertDiscordBasicPollCard,
  enqueueBasicPollSync,
};
