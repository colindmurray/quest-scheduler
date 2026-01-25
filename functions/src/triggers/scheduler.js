const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { DISCORD_REGION, DISCORD_BOT_TOKEN } = require("../discord/config");
const { createChannelMessage, editChannelMessage } = require("../discord/discord-client");
const { buildPollCard } = require("../discord/poll-card");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function hasNonDiscordChanges(beforeData, afterData) {
  const beforeCopy = { ...(beforeData || {}) };
  const afterCopy = { ...(afterData || {}) };
  delete beforeCopy.discord;
  delete afterCopy.discord;
  return JSON.stringify(beforeCopy) !== JSON.stringify(afterCopy);
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

    const slotsSnap = await db.collection("schedulers").doc(schedulerId).collection("slots").get();
    const slots = slotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const messageBody = buildPollCard({ schedulerId, scheduler, slots });

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

    if (!afterData.discord?.messageId) {
      return;
    }

    if (!hasNonDiscordChanges(beforeData, afterData)) {
      return;
    }

    try {
      const slotsSnap = await db.collection("schedulers").doc(schedulerId).collection("slots").get();
      const slots = slotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const messageBody = buildPollCard({ schedulerId, scheduler: afterData, slots });

      await editChannelMessage({
        channelId: afterData.discord.channelId,
        messageId: afterData.discord.messageId,
        body: messageBody,
      });

      await db.collection("schedulers").doc(schedulerId).set(
        {
          discord: {
            ...afterData.discord,
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastStatus: afterData.status || "OPEN",
          },
        },
        { merge: true }
      );
    } catch (err) {
      logger.error("Failed to update Discord poll card", {
        schedulerId,
        error: err?.message,
      });
    }
  }
);
