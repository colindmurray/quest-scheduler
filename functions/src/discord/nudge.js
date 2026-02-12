const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { createChannelMessage } = require("./discord-client");
const { APP_URL, DISCORD_REGION, DISCORD_BOT_TOKEN } = require("./config");
const { formatDateTime } = require("./time-utils");
const { hasSubmittedVoteForPoll } = require("../basic-polls/vote-submission");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const NUDGE_COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8 hours
const USERS_QUERY_CHUNK_SIZE = 10;

function toUniqueStringList(values = []) {
  const set = new Set();
  (values || []).forEach((value) => {
    if (value === null || value === undefined) return;
    const normalized = String(value).trim();
    if (normalized) set.add(normalized);
  });
  return Array.from(set);
}

function chunkList(items = [], size = 10) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toUserSetKey(userIds = []) {
  return toUniqueStringList(userIds).sort().join("|");
}

function buildMentions(discordUserIds = []) {
  return toUniqueStringList(discordUserIds)
    .map((discordUserId) => `<@${discordUserId}>`)
    .join(" ");
}

function isOpenStatus(status) {
  return String(status || "OPEN").trim().toUpperCase() === "OPEN";
}

function resolveCooldownDate(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue.toDate === "function") {
    const resolved = rawValue.toDate();
    return Number.isFinite(resolved?.getTime?.()) ? resolved : null;
  }
  const parsed = new Date(rawValue);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function assertNotOnCooldown(rawValue) {
  const lastNudge = resolveCooldownDate(rawValue);
  if (!lastNudge) return;

  const elapsed = Date.now() - lastNudge.getTime();
  if (elapsed >= NUDGE_COOLDOWN_MS) return;

  const remainingMs = NUDGE_COOLDOWN_MS - elapsed;
  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  throw new functions.https.HttpsError(
    "resource-exhausted",
    `Nudge is on cooldown. Try again in ${remainingHours} hour${remainingHours === 1 ? "" : "s"}.`
  );
}

async function resolveDiscordUserIdsByUserId(userIds = []) {
  const normalizedIds = toUniqueStringList(userIds);
  if (normalizedIds.length === 0) {
    return {
      byUserId: {},
      linkedUserIds: [],
      linkedDiscordUserIds: [],
    };
  }

  const byUserId = {};
  const chunks = chunkList(normalizedIds, USERS_QUERY_CHUNK_SIZE);
  for (const chunk of chunks) {
    const usersSnap = await db
      .collection("users")
      .where(admin.firestore.FieldPath.documentId(), "in", chunk)
      .get();

    usersSnap.forEach((userDoc) => {
      const discordUserId = String(userDoc.data()?.discord?.userId || "").trim();
      if (!discordUserId) return;
      byUserId[userDoc.id] = discordUserId;
    });
  }

  const linkedUserIds = normalizedIds.filter((userId) => Boolean(byUserId[userId]));
  const linkedDiscordUserIds = linkedUserIds.map((userId) => byUserId[userId]);

  return { byUserId, linkedUserIds, linkedDiscordUserIds };
}

function formatPollTitles(pollTitles = []) {
  return toUniqueStringList(pollTitles)
    .map((title) => `"${title}"`)
    .join(", ");
}

function buildSchedulerRequiredPollGroups(requiredPolls = []) {
  const grouped = new Map();

  requiredPolls.forEach((requiredPoll) => {
    const missingUserIds = toUniqueStringList(requiredPoll?.missingUserIds || []);
    if (missingUserIds.length === 0) return;

    const key = toUserSetKey(missingUserIds);
    const existing = grouped.get(key);
    if (existing) {
      existing.pollTitles.push(requiredPoll.pollTitle || "Untitled poll");
      return;
    }

    grouped.set(key, {
      key,
      missingUserIds,
      pollTitles: [requiredPoll.pollTitle || "Untitled poll"],
    });
  });

  return Array.from(grouped.values());
}

function buildSchedulerNudgeSections({
  sessionMissingUserIds = [],
  requiredPolls = [],
  discordUserIdsByUserId = {},
}) {
  const sections = [];
  const requiredGroups = buildSchedulerRequiredPollGroups(requiredPolls);
  const sessionMissing = toUniqueStringList(sessionMissingUserIds);
  const sessionKey = toUserSetKey(sessionMissing);

  let sessionMatchedRequiredPollTitles = [];
  if (sessionMissing.length > 0 && sessionKey) {
    const index = requiredGroups.findIndex((group) => group.key === sessionKey);
    if (index >= 0) {
      sessionMatchedRequiredPollTitles = requiredGroups[index].pollTitles || [];
      requiredGroups.splice(index, 1);
    }

    sections.push({
      type: "session",
      missingUserIds: sessionMissing,
      pollTitles: sessionMatchedRequiredPollTitles,
    });
  }

  requiredGroups.forEach((group) => {
    sections.push({
      type: "required",
      missingUserIds: group.missingUserIds,
      pollTitles: group.pollTitles,
    });
  });

  const rendered = [];
  sections.forEach((section) => {
    const linkedDiscordUserIds = toUniqueStringList(
      (section.missingUserIds || [])
        .map((userId) => discordUserIdsByUserId[userId])
        .filter(Boolean)
    );
    if (linkedDiscordUserIds.length === 0) return;

    const mentions = buildMentions(linkedDiscordUserIds);
    if (!mentions) return;

    if (section.type === "session") {
      const associatedPolls = toUniqueStringList(section.pollTitles || []);
      if (associatedPolls.length > 0) {
        rendered.push({
          text:
            `${mentions} your votes are still needed for this session poll, ` +
            `and your votes are also required in these associated polls: ${formatPollTitles(associatedPolls)}.`,
          discordUserIds: linkedDiscordUserIds,
        });
      } else {
        rendered.push({
          text: `${mentions} your votes are still needed for this session poll.`,
          discordUserIds: linkedDiscordUserIds,
        });
      }
      return;
    }

    const pollTitles = toUniqueStringList(section.pollTitles || []);
    if (pollTitles.length === 1) {
      rendered.push({
        text: `${mentions} your votes are still required in this required associated poll: ${formatPollTitles(pollTitles)}.`,
        discordUserIds: linkedDiscordUserIds,
      });
      return;
    }

    rendered.push({
      text: `${mentions} your votes are still required in one or more required associated polls: ${formatPollTitles(pollTitles)}.`,
      discordUserIds: linkedDiscordUserIds,
    });
  });

  return rendered;
}

function buildSchedulerNudgeMessage({
  schedulerId,
  schedulerTitle,
  sectionLines,
  firstSlotUnix,
  firstSlotLabel,
  pollMessageUrl,
}) {
  const pollUrl = `${APP_URL}/scheduler/${schedulerId}`;
  const mentionIds = toUniqueStringList(
    sectionLines.flatMap((section) => section.discordUserIds || [])
  );
  const mentions = buildMentions(mentionIds);

  let content = `**Reminder: Votes needed for "${schedulerTitle}"**\n\n`;
  if (mentions) {
    content += `${mentions}\n\n`;
  }

  if (sectionLines.length > 0) {
    content += `Hey! ${sectionLines[0].text}\n`;
    if (sectionLines.length > 1) {
      content += `\n${sectionLines.slice(1).map((section) => section.text).join("\n\n")}\n`;
    }
  } else {
    content += "Hey! Your votes are still needed for this session poll.\n";
  }

  if (firstSlotLabel && firstSlotUnix) {
    content += `\nThe first proposed time is ${firstSlotLabel} (<t:${firstSlotUnix}:R>).\n`;
  } else if (firstSlotLabel) {
    content += `\nThe first proposed time is ${firstSlotLabel}.\n`;
  } else if (firstSlotUnix) {
    content += `\nThe first proposed time is <t:${firstSlotUnix}:F> (<t:${firstSlotUnix}:R>).\n`;
  }

  content += `\n**[Vote now](${pollUrl})**`;

  if (pollMessageUrl) {
    content += ` | [View poll message](${pollMessageUrl})`;
  }

  return { content };
}

function buildBasicPollNudgeMessage({
  groupId,
  pollId,
  pollTitle,
  discordUserIds,
  pollMessageUrl,
}) {
  const mentions = buildMentions(discordUserIds);
  const pollUrl = `${APP_URL}/groups/${groupId}/polls/${pollId}`;

  let content = `**Reminder: Votes needed for "${pollTitle}"**\n\n`;
  content += `${mentions}\n\n`;
  content += "Hey! Your votes are still needed for this general poll.\n";
  content += `\n**[Vote now](${pollUrl})**`;

  if (pollMessageUrl) {
    content += ` | [View poll message](${pollMessageUrl})`;
  }

  return { content };
}

function sortPollDocs(pollDocs = []) {
  return [...pollDocs].sort((left, right) => {
    const leftData = left.data ? left.data() || {} : {};
    const rightData = right.data ? right.data() || {} : {};
    const leftOrder = Number.isFinite(leftData.order) ? leftData.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(rightData.order) ? rightData.order : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    const leftTitle = String(leftData.title || "");
    const rightTitle = String(rightData.title || "");
    return leftTitle.localeCompare(rightTitle);
  });
}

async function resolveSchedulerRequiredPollMissingUsers({ schedulerRef, eligibleUserIds = [], actorUserId }) {
  const basicPollsSnap = await schedulerRef.collection("basicPolls").get();
  const pollDocs = sortPollDocs(basicPollsSnap.docs || []);

  const summaries = [];
  for (const pollDoc of pollDocs) {
    const pollData = pollDoc.data() || {};
    if (pollData.required !== true) continue;
    if (!isOpenStatus(pollData.status || "OPEN")) continue;

    const votesSnap = await pollDoc.ref.collection("votes").get();
    const submittedUserIds = new Set(
      (votesSnap.docs || [])
        .filter((voteDoc) => hasSubmittedVoteForPoll(pollData, voteDoc.data() || {}))
        .map((voteDoc) => String(voteDoc.id || "").trim())
        .filter(Boolean)
    );

    const missingUserIds = eligibleUserIds.filter(
      (userId) => userId !== actorUserId && !submittedUserIds.has(userId)
    );

    if (missingUserIds.length === 0) continue;

    summaries.push({
      pollId: pollDoc.id,
      pollTitle: pollData.title || "Untitled poll",
      missingUserIds,
    });
  }

  return summaries;
}

async function resolveSchedulerNudgeParticipants({ scheduler, actorUserId }) {
  const participantIds = new Set(
    toUniqueStringList(scheduler?.participantIds || [])
  );

  if (scheduler?.questingGroupId) {
    const groupSnap = await db
      .collection("questingGroups")
      .doc(String(scheduler.questingGroupId))
      .get();
    if (groupSnap.exists) {
      const groupData = groupSnap.data() || {};
      toUniqueStringList(groupData.memberIds || []).forEach((memberId) => participantIds.add(memberId));
    }
  }

  participantIds.delete(String(actorUserId));
  return Array.from(participantIds);
}

async function resolveFirstSchedulerSlotSummary(schedulerRef, timezone) {
  const slotsSnap = await schedulerRef.collection("slots").orderBy("start").limit(1).get();
  if (slotsSnap.empty) {
    return { firstSlotUnix: null, firstSlotLabel: null };
  }

  const firstSlot = slotsSnap.docs[0].data() || {};
  if (!firstSlot.start) {
    return { firstSlotUnix: null, firstSlotLabel: null };
  }

  const epochMs = new Date(firstSlot.start).getTime();
  const firstSlotUnix = Number.isFinite(epochMs) ? Math.floor(epochMs / 1000) : null;
  const firstSlotLabel = formatDateTime(firstSlot.start, timezone || null);
  return { firstSlotUnix, firstSlotLabel };
}

/**
 * Nudge Discord participants who haven't voted on a session poll.
 * Only the poll creator can trigger this, with an 8-hour cooldown per poll.
 */
exports.nudgeDiscordParticipants = functions
  .region(DISCORD_REGION)
  .runWith({ secrets: [DISCORD_BOT_TOKEN] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }

    const schedulerId = String(data?.schedulerId || "").trim();
    if (!schedulerId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing schedulerId");
    }

    const actorUserId = context.auth.uid;
    const schedulerRef = db.collection("schedulers").doc(schedulerId);
    const schedulerSnap = await schedulerRef.get();

    if (!schedulerSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Session poll not found");
    }

    const scheduler = schedulerSnap.data() || {};
    if (String(scheduler.creatorId || "") !== actorUserId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the poll creator can nudge participants"
      );
    }

    const discordChannelId = String(scheduler?.discord?.channelId || "").trim();
    if (!discordChannelId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This poll is not posted to Discord"
      );
    }

    assertNotOnCooldown(scheduler?.discord?.nudgeLastSentAt || null);

    if (!isOpenStatus(scheduler.status)) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Can only nudge participants on open polls"
      );
    }

    const eligibleUserIds = await resolveSchedulerNudgeParticipants({
      scheduler,
      actorUserId,
    });

    if (eligibleUserIds.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No participants to nudge"
      );
    }

    const schedulerVotesSnap = await schedulerRef.collection("votes").get();
    const schedulerVoterIds = new Set(
      (schedulerVotesSnap.docs || [])
        .map((voteDoc) => String(voteDoc.id || "").trim())
        .filter(Boolean)
    );

    const sessionMissingUserIds = eligibleUserIds.filter(
      (userId) => !schedulerVoterIds.has(userId)
    );

    const requiredPollsMissing = await resolveSchedulerRequiredPollMissingUsers({
      schedulerRef,
      eligibleUserIds,
      actorUserId,
    });

    if (sessionMissingUserIds.length === 0 && requiredPollsMissing.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Everyone has already voted!"
      );
    }

    const totalMissingUserIds = toUniqueStringList([
      ...sessionMissingUserIds,
      ...requiredPollsMissing.flatMap((poll) => poll.missingUserIds || []),
    ]);

    const {
      byUserId: discordUserIdsByUserId,
      linkedUserIds,
    } = await resolveDiscordUserIdsByUserId(totalMissingUserIds);

    if (linkedUserIds.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No non-voters have linked their Discord accounts"
      );
    }

    const sectionLines = buildSchedulerNudgeSections({
      sessionMissingUserIds,
      requiredPolls: requiredPollsMissing,
      discordUserIdsByUserId,
    });

    if (sectionLines.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No non-voters have linked their Discord accounts"
      );
    }

    const { firstSlotUnix, firstSlotLabel } = await resolveFirstSchedulerSlotSummary(
      schedulerRef,
      scheduler.timezone || null
    );

    const messageBody = buildSchedulerNudgeMessage({
      schedulerId,
      schedulerTitle: scheduler.title || "Quest Session",
      sectionLines,
      firstSlotUnix,
      firstSlotLabel,
      pollMessageUrl: scheduler?.discord?.messageUrl || null,
    });

    try {
      await createChannelMessage({
        channelId: discordChannelId,
        body: messageBody,
      });
    } catch (error) {
      console.error("Failed to send nudge message:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to send Discord message. The bot may not have permission to post in this channel."
      );
    }

    await schedulerRef.update({
      "discord.nudgeLastSentAt": admin.firestore.FieldValue.serverTimestamp(),
    });

    const nudgedUserIds = toUniqueStringList(
      sectionLines.flatMap((section) => section.discordUserIds || [])
    );

    return {
      success: true,
      nudgedCount: nudgedUserIds.length,
      totalNonVoters: totalMissingUserIds.length,
    };
  });

/**
 * Nudge Discord participants who haven't voted on a standalone group basic poll.
 * Only the poll creator can trigger this, with an 8-hour cooldown per poll.
 */
exports.nudgeDiscordBasicPollParticipants = functions
  .region(DISCORD_REGION)
  .runWith({ secrets: [DISCORD_BOT_TOKEN] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }

    const groupId = String(data?.groupId || data?.parentId || "").trim();
    const pollId = String(data?.pollId || data?.basicPollId || "").trim();
    if (!groupId || !pollId) {
      throw new functions.https.HttpsError("invalid-argument", "groupId and pollId are required");
    }

    const actorUserId = context.auth.uid;
    const groupRef = db.collection("questingGroups").doc(groupId);
    const pollRef = groupRef.collection("basicPolls").doc(pollId);
    const [groupSnap, pollSnap] = await Promise.all([groupRef.get(), pollRef.get()]);

    if (!groupSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Questing group not found");
    }

    if (!pollSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Basic poll not found");
    }

    const groupData = groupSnap.data() || {};
    const pollData = pollSnap.data() || {};

    if (String(pollData.creatorId || "") !== actorUserId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the poll creator can nudge participants"
      );
    }

    const discordChannelId = String(pollData?.discord?.channelId || "").trim();
    if (!discordChannelId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This poll is not posted to Discord"
      );
    }

    assertNotOnCooldown(pollData?.discord?.nudgeLastSentAt || null);

    if (!isOpenStatus(pollData.status)) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Can only nudge participants on open polls"
      );
    }

    const participantIds = toUniqueStringList([
      ...(groupData.memberIds || []),
      groupData.creatorId,
    ]).filter((userId) => userId !== actorUserId);

    if (participantIds.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No participants to nudge"
      );
    }

    const votesSnap = await pollRef.collection("votes").get();
    const submittedUserIds = new Set(
      (votesSnap.docs || [])
        .filter((voteDoc) => hasSubmittedVoteForPoll(pollData, voteDoc.data() || {}))
        .map((voteDoc) => String(voteDoc.id || "").trim())
        .filter(Boolean)
    );

    const nonVoterIds = participantIds.filter((userId) => !submittedUserIds.has(userId));
    if (nonVoterIds.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Everyone has already voted!"
      );
    }

    const { linkedDiscordUserIds } = await resolveDiscordUserIdsByUserId(nonVoterIds);
    if (linkedDiscordUserIds.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No non-voters have linked their Discord accounts"
      );
    }

    const messageBody = buildBasicPollNudgeMessage({
      groupId,
      pollId,
      pollTitle: pollData.title || "General Poll",
      discordUserIds: linkedDiscordUserIds,
      pollMessageUrl: pollData?.discord?.messageUrl || null,
    });

    try {
      await createChannelMessage({
        channelId: discordChannelId,
        body: messageBody,
      });
    } catch (error) {
      console.error("Failed to send basic poll nudge message:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to send Discord message. The bot may not have permission to post in this channel."
      );
    }

    await pollRef.update({
      "discord.nudgeLastSentAt": admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      nudgedCount: linkedDiscordUserIds.length,
      totalNonVoters: nonVoterIds.length,
    };
  });

exports.__test__ = {
  NUDGE_COOLDOWN_MS,
  toUniqueStringList,
  toUserSetKey,
  buildSchedulerRequiredPollGroups,
  buildSchedulerNudgeSections,
  buildSchedulerNudgeMessage,
  buildBasicPollNudgeMessage,
};
