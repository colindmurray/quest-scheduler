const { createChannelMessage } = require("../discord/discord-client");
const { APP_URL, DISCORD_NOTIFICATION_DEFAULTS } = require("../discord/config");
const { NOTIFICATION_EVENTS } = require("./constants");

const DISCORD_EVENT_SETTINGS = Object.freeze({
  [NOTIFICATION_EVENTS.POLL_CREATED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.VOTE_SUBMITTED]: "voteSubmitted",
  [NOTIFICATION_EVENTS.SLOT_CHANGED]: "slotChanges",
  [NOTIFICATION_EVENTS.POLL_READY_TO_FINALIZE]: "allVotesIn",
  [NOTIFICATION_EVENTS.POLL_FINALIZED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.POLL_REOPENED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.POLL_CANCELLED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.POLL_RESTORED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.POLL_DELETED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.BASIC_POLL_CREATED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.BASIC_POLL_REOPENED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.BASIC_POLL_REMOVED]: "finalizationEvents",
  [NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES]: "finalizationEvents",
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
const resolveBasicPollTitle = (event) =>
  event?.payload?.basicPollTitle || event?.payload?.pollTitle || event?.resource?.title || "General poll";

const buildBasicPollUrl = (event) => {
  const payload = event?.payload || {};
  const pollId = event?.resource?.id || payload?.basicPollId || "";
  const parentType = payload?.parentType || "";
  const parentId = payload?.parentId || "";

  if (parentType === "group" && parentId && pollId) {
    return `${APP_URL}/groups/${parentId}/polls/${pollId}`;
  }
  if (parentType === "scheduler" && parentId && pollId) {
    return `${APP_URL}/scheduler/${parentId}?poll=${pollId}`;
  }
  return `${APP_URL}/dashboard`;
};

const buildDiscordMessage = (eventType, event, { notifyRoleId, pollTitle, pollUrl } = {}) => {
  const resourceType = event?.resource?.type || "";
  const fallbackPollId = event?.resource?.id || "";
  const resolvedTitle =
    pollTitle ||
    (resourceType === "basicPoll" ? resolveBasicPollTitle(event) : resolvePollTitle(event));
  const resolvedUrl =
    pollUrl ||
    (resourceType === "basicPoll" ? buildBasicPollUrl(event) : buildPollUrl(fallbackPollId));
  const actorName = event?.actor?.displayName || event?.actor?.email || "A participant";

  if (eventType === NOTIFICATION_EVENTS.VOTE_SUBMITTED) {
    return {
      content: `${actorName} submitted votes for **${resolvedTitle}**. View: ${resolvedUrl}`,
      allowed_mentions: { parse: [] },
    };
  }

  if (eventType === NOTIFICATION_EVENTS.SLOT_CHANGED) {
    const summary = event?.payload?.changeSummary;
    const summaryText = summary ? ` (${summary})` : "";
    return {
      content: `Slots updated for **${resolvedTitle}**${summaryText}. View: ${resolvedUrl}`,
      allowed_mentions: { parse: [] },
    };
  }

  if (eventType === NOTIFICATION_EVENTS.POLL_READY_TO_FINALIZE) {
    return {
      content: `All votes are in for **${resolvedTitle}**. Ready to finalize: ${resolvedUrl}`,
      allowed_mentions: { parse: [] },
    };
  }

  if (
    eventType === NOTIFICATION_EVENTS.POLL_CREATED ||
    eventType === NOTIFICATION_EVENTS.POLL_FINALIZED ||
    eventType === NOTIFICATION_EVENTS.POLL_REOPENED ||
    eventType === NOTIFICATION_EVENTS.POLL_CANCELLED ||
    eventType === NOTIFICATION_EVENTS.POLL_RESTORED ||
    eventType === NOTIFICATION_EVENTS.POLL_DELETED
  ) {
    const { mention, allowedMentions } = buildFinalizationMention(notifyRoleId);
    if (eventType === NOTIFICATION_EVENTS.POLL_CREATED) {
      return {
        content: `${mention}New session poll created: **${resolvedTitle}**. Vote now: ${resolvedUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.POLL_FINALIZED) {
      const winningDate = event?.payload?.winningDate;
      const winningText = winningDate ? ` Winning time: ${winningDate}.` : "";
      return {
        content: `${mention}Poll finalized for **${resolvedTitle}**.${winningText} View: ${resolvedUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.POLL_REOPENED) {
      return {
        content: `${mention}Poll re-opened for **${resolvedTitle}**. Please vote again: ${resolvedUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.POLL_CANCELLED) {
      return {
        content: `${mention}Poll cancelled for **${resolvedTitle}**. View: ${resolvedUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.POLL_RESTORED) {
      return {
        content: `${mention}Poll restored for **${resolvedTitle}**. Voting is open again: ${resolvedUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.POLL_DELETED) {
      return {
        content: `${mention}Poll deleted for **${resolvedTitle}**.`,
        allowed_mentions: allowedMentions,
      };
    }
  }

  if (
    eventType === NOTIFICATION_EVENTS.BASIC_POLL_CREATED ||
    eventType === NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED ||
    eventType === NOTIFICATION_EVENTS.BASIC_POLL_REOPENED ||
    eventType === NOTIFICATION_EVENTS.BASIC_POLL_REMOVED ||
    eventType === NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES
  ) {
    const { mention, allowedMentions } = buildFinalizationMention(notifyRoleId);
    if (eventType === NOTIFICATION_EVENTS.BASIC_POLL_CREATED) {
      return {
        content: `${mention}New general poll created: **${resolvedTitle}**. Vote now: ${resolvedUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED) {
      return {
        content: `${mention}General poll finalized: **${resolvedTitle}**. View results: ${resolvedUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.BASIC_POLL_REOPENED) {
      return {
        content: `${mention}General poll re-opened: **${resolvedTitle}**. Please vote: ${resolvedUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    if (eventType === NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES) {
      return {
        content: `${mention}General poll finalized with missing required votes: **${resolvedTitle}**. Review: ${resolvedUrl}`,
        allowed_mentions: allowedMentions,
      };
    }
    return {
      content: `${mention}General poll deleted: **${resolvedTitle}**.`,
      allowed_mentions: allowedMentions,
    };
  }

  return null;
};

const resolveSchedulerDiscordContext = async ({ db, schedulerId }) => {
  const schedulerSnap = await db.collection("schedulers").doc(schedulerId).get();
  if (!schedulerSnap.exists) return null;
  const scheduler = schedulerSnap.data() || {};
  if (!scheduler.questingGroupId) return null;

  const groupSnap = await db.collection("questingGroups").doc(scheduler.questingGroupId).get();
  if (!groupSnap.exists) return null;

  const group = groupSnap.data() || {};
  const groupDiscord = group.discord || {};
  const channelId = scheduler.discord?.channelId || groupDiscord.channelId;
  const guildId = scheduler.discord?.guildId || groupDiscord.guildId;
  if (!channelId || !guildId) return null;

  return { channelId, guildId, groupDiscord };
};

const resolveBasicPollDiscordContext = async ({ db, parentType, parentId }) => {
  if (!parentType || !parentId) return null;

  if (parentType === "group") {
    const groupSnap = await db.collection("questingGroups").doc(parentId).get();
    if (!groupSnap.exists) return null;
    const group = groupSnap.data() || {};
    const groupDiscord = group.discord || {};
    if (!groupDiscord?.channelId || !groupDiscord?.guildId) return null;
    return {
      channelId: groupDiscord.channelId,
      guildId: groupDiscord.guildId,
      groupDiscord,
    };
  }

  if (parentType !== "scheduler") return null;
  return resolveSchedulerDiscordContext({ db, schedulerId: parentId });
};

const sendDiscordNotification = async ({ db, eventType, event }) => {
  const settingKey = DISCORD_EVENT_SETTINGS[eventType];
  if (!settingKey) return { success: true, skipped: true };

  const resourceType = event?.resource?.type;
  let context = null;
  let pollTitle = "Poll";
  let pollUrl = `${APP_URL}/dashboard`;

  if (resourceType === "poll") {
    const pollId = event?.resource?.id || "";
    if (!pollId) return { success: true, skipped: true };
    context = await resolveSchedulerDiscordContext({ db, schedulerId: pollId });
    if (!context) return { success: true, skipped: true };
    pollTitle = resolvePollTitle(event);
    pollUrl = buildPollUrl(pollId);
  } else if (resourceType === "basicPoll") {
    const payload = event?.payload || {};
    context = await resolveBasicPollDiscordContext({
      db,
      parentType: payload.parentType || "",
      parentId: payload.parentId || "",
    });
    if (!context) return { success: true, skipped: true };
    pollTitle = resolveBasicPollTitle(event);
    pollUrl = buildBasicPollUrl(event);
  } else {
    return { success: true, skipped: true };
  }

  const settings = getDiscordNotificationSettings(context.groupDiscord || {});
  if (!settings?.[settingKey]) return { success: true, skipped: true };

  const message = buildDiscordMessage(eventType, event, {
    notifyRoleId: context.groupDiscord?.notifyRoleId || "everyone",
    pollTitle,
    pollUrl,
  });
  if (!message) return { success: true, skipped: true };

  await createChannelMessage({
    channelId: context.channelId,
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
