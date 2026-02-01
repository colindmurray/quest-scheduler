const { createChannelMessage } = require("../discord/discord-client");
const { APP_URL, DISCORD_NOTIFICATION_DEFAULTS } = require("../discord/config");
const { NOTIFICATION_EVENTS } = require("./constants");

const DISCORD_EVENT_SETTINGS = Object.freeze({
  [NOTIFICATION_EVENTS.VOTE_SUBMITTED]: "voteSubmitted",
  [NOTIFICATION_EVENTS.SLOT_CHANGED]: "slotChanges",
  [NOTIFICATION_EVENTS.POLL_FINALIZED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.POLL_REOPENED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.POLL_CANCELLED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.POLL_DELETED]: "finalizationEvents",
});

const getDiscordNotificationSettings = (groupDiscord = {}) => {
  const notifications = groupDiscord?.notifications || {};
  return {
    ...DISCORD_NOTIFICATION_DEFAULTS,
    ...notifications,
  };
};

const buildFinalizationMention = (notifyRoleId) => {
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
};

const resolvePollTitle = (event) =>
  event?.payload?.pollTitle || event?.resource?.title || "Session Poll";

const buildPollUrl = (pollId) => `${APP_URL}/scheduler/${pollId}`;

const buildDiscordMessage = (eventType, event, { notifyRoleId }) => {
  const pollId = event?.resource?.id || "";
  if (!pollId) return null;

  const pollTitle = resolvePollTitle(event);
  const pollUrl = buildPollUrl(pollId);
  const actorName = event?.actor?.displayName || event?.actor?.email || "A participant";

  if (eventType === NOTIFICATION_EVENTS.VOTE_SUBMITTED) {
    return {
      content: `${actorName} submitted votes for **${pollTitle}**. View: ${pollUrl}`,
      allowed_mentions: { parse: [] },
    };
  }

  if (eventType === NOTIFICATION_EVENTS.SLOT_CHANGED) {
    const summary = event?.payload?.changeSummary;
    const summaryText = summary ? ` (${summary})` : "";
    return {
      content: `Slots updated for **${pollTitle}**${summaryText}. View: ${pollUrl}`,
      allowed_mentions: { parse: [] },
    };
  }

  if (
    eventType === NOTIFICATION_EVENTS.POLL_FINALIZED ||
    eventType === NOTIFICATION_EVENTS.POLL_REOPENED ||
    eventType === NOTIFICATION_EVENTS.POLL_CANCELLED ||
    eventType === NOTIFICATION_EVENTS.POLL_DELETED
  ) {
    const { mention, allowedMentions } = buildFinalizationMention(notifyRoleId);
    if (eventType === NOTIFICATION_EVENTS.POLL_FINALIZED) {
      const winningDate = event?.payload?.winningDate;
      const winningText = winningDate ? ` Winning time: ${winningDate}.` : "";
      return {
        content: `${mention}Poll finalized for **${pollTitle}**.${winningText} View: ${pollUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.POLL_REOPENED) {
      return {
        content: `${mention}Poll re-opened for **${pollTitle}**. Please vote again: ${pollUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.POLL_CANCELLED) {
      return {
        content: `${mention}Poll cancelled for **${pollTitle}**. View: ${pollUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.POLL_DELETED) {
      return {
        content: `${mention}Poll deleted for **${pollTitle}**.`,
        allowed_mentions: allowedMentions,
      };
    }
  }

  return null;
};

const sendDiscordNotification = async ({ db, eventType, event }) => {
  const settingKey = DISCORD_EVENT_SETTINGS[eventType];
  if (!settingKey) return { success: true, skipped: true };

  if (event?.resource?.type !== "poll" || !event?.resource?.id) {
    return { success: true, skipped: true };
  }

  const schedulerSnap = await db.collection("schedulers").doc(event.resource.id).get();
  if (!schedulerSnap.exists) return { success: true, skipped: true };
  const scheduler = schedulerSnap.data() || {};
  if (!scheduler.questingGroupId) return { success: true, skipped: true };

  const groupSnap = await db.collection("questingGroups").doc(scheduler.questingGroupId).get();
  if (!groupSnap.exists) return { success: true, skipped: true };

  const group = groupSnap.data() || {};
  const groupDiscord = group.discord || {};
  const channelId = scheduler.discord?.channelId || groupDiscord.channelId;
  const guildId = scheduler.discord?.guildId || groupDiscord.guildId;
  if (!channelId || !guildId) return { success: true, skipped: true };

  const settings = getDiscordNotificationSettings(groupDiscord);
  if (!settings?.[settingKey]) return { success: true, skipped: true };

  const message = buildDiscordMessage(eventType, event, {
    notifyRoleId: groupDiscord.notifyRoleId || "everyone",
  });
  if (!message) return { success: true, skipped: true };

  await createChannelMessage({
    channelId,
    body: message,
  });

  return { success: true };
};

module.exports = {
  sendDiscordNotification,
  buildDiscordMessage,
  buildFinalizationMention,
  getDiscordNotificationSettings,
  DISCORD_EVENT_SETTINGS,
};
