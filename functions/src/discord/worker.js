const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { randomUUID } = require("crypto");
const { InteractionType } = require("discord-api-types/v10");
const {
  DISCORD_APPLICATION_ID,
  DISCORD_BOT_TOKEN,
  DISCORD_REGION,
  APP_URL,
  DISCORD_NOTIFICATION_DEFAULTS,
} = require("./config");
const { normalizeEmail } = require("../utils/email");
const { queueNotificationEvent } = require("../notifications/write-event");
const { computeInstantRunoffResults } = require("../basic-polls/irv");
const { computeMultipleChoiceTallies } = require("../basic-polls/multiple-choice");
const { hashLinkCode } = require("./link-utils");
const { ERROR_MESSAGES, buildUserNotLinkedMessage } = require("./error-messages");
const { buildBasicPollCard } = require("./basic-poll-card");
const {
  editOriginalInteractionResponse,
  editChannelMessage,
  createChannelMessage,
  deleteChannelMessage,
  fetchChannel,
} = require("./discord-client");
const {
  parseSnowflakeTimestamp,
  isTokenExpired,
  getDiscordUserId,
  hasLinkPermissions,
  clampPageIndex,
  getVotePage,
  formatVoteContent,
  buildSessionId,
  formatSlotLabel,
  buildVoteComponents,
  MAX_SELECT_OPTIONS,
} = require("./worker-utils");

if (!admin.apps.length) {
  admin.initializeApp();
}

const INTERACTION_TTL_MINUTES = 60;
const VOTE_SESSION_TTL_MINUTES = 15;
const LINK_TEST_SUCCESS_MESSAGE =
  "Discord channel linked! Polls for this group will now post here. I posted a test message to confirm I can post in this channel.";
const LINK_PERMISSION_WARNING_MESSAGE =
  "Discord channel linked, but I couldn't post a test message here. If this is a private channel, add the Quest Scheduler bot role to the channel or its category and allow View Channel, Send Messages, and Embed Links. Then run /qs link-group again.";
const ISO_DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_DEADLINE_REGEX = /^(\d+)\s*([dw])$/i;

const db = admin.firestore();

function resolveDiscordDisplayTimeZone(scheduler, linkedUser) {
  const pollTimeZone = scheduler?.timezone || null;
  const settings = linkedUser?.settings || {};
  const autoConvert = settings?.autoConvertPollTimes !== false;
  const userTimeZone =
    settings?.timezoneMode === "manual" && settings?.timezone
      ? settings.timezone
      : settings?.timezone || null;

  if (autoConvert && userTimeZone) return userTimeZone;
  return pollTimeZone || userTimeZone || null;
}

async function sendLinkTestMessage(channelId, channelName) {
  const message = {
    content: `Quest Scheduler connected${channelName ? ` to #${channelName}` : ""}. This is a test message to confirm I can post in this channel.`,
  };
  const result = await createChannelMessage({ channelId, body: message });
  return result?.id || null;
}

async function acquireInteractionLock(interactionId) {
  const ref = db.collection("discordInteractionIds").doc(interactionId);
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + INTERACTION_TTL_MINUTES * 60 * 1000)
  );
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        throw new Error("exists");
      }
      tx.set(ref, {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
        status: "processing",
      });
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function markInteractionDone(interactionId) {
  const ref = db.collection("discordInteractionIds").doc(interactionId);
  await ref.set(
    {
      status: "done",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function releaseInteractionLock(interactionId) {
  await db.collection("discordInteractionIds").doc(interactionId).delete().catch(() => null);
}

async function respondWithMessage(interaction, body) {
  if (!interaction.token || !interaction.applicationId) {
    logger.warn("Missing interaction token or application ID", {
      interactionId: interaction.id,
    });
    return null;
  }
  if (isTokenExpired(interaction.id)) {
    logger.warn("Discord interaction token expired", { interactionId: interaction.id });
    return null;
  }
  return editOriginalInteractionResponse({
    applicationId: interaction.applicationId,
    token: interaction.token,
    body,
  });
}

async function respondWithError(interaction, message) {
  return respondWithMessage(interaction, { content: message });
}

async function respondWithClosedPoll(interaction, message = ERROR_MESSAGES.pollFinalized) {
  return respondWithMessage(interaction, {
    content: message,
    components: [],
  });
}

async function getLinkedUser(discordUserId) {
  const linkSnap = await db.collection("discordUserLinks").doc(discordUserId).get();
  if (!linkSnap.exists) return null;
  const linkData = linkSnap.data() || {};
  if (!linkData.qsUserId) return null;
  const userSnap = await db.collection("users").doc(linkData.qsUserId).get();
  if (userSnap.exists) {
    return { uid: linkData.qsUserId, ...userSnap.data() };
  }
  try {
    const authUser = await admin.auth().getUser(linkData.qsUserId);
    return { uid: linkData.qsUserId, email: authUser.email, photoURL: authUser.photoURL };
  } catch (err) {
    return null;
  }
}

async function getParticipationDecision(scheduler, linkedUser) {
  if (!linkedUser?.uid) {
    return { allowed: false, message: ERROR_MESSAGES.notParticipant };
  }

  const userId = linkedUser.uid;
  const email = linkedUser.email ? normalizeEmail(linkedUser.email) : null;
  const participantIds = (scheduler.participantIds || []).map((id) => String(id));
  const pendingInvites = (scheduler.pendingInvites || []).map((invite) =>
    normalizeEmail(invite)
  );

  if (participantIds.includes(userId)) {
    return { allowed: true };
  }

  if (!scheduler.questingGroupId) {
    if (email && pendingInvites.includes(email)) {
      return { allowed: false, message: ERROR_MESSAGES.pendingInvite };
    }
    return { allowed: false, message: ERROR_MESSAGES.notInvited };
  }

  const groupSnap = await db.collection("questingGroups").doc(scheduler.questingGroupId).get();
  if (!groupSnap.exists) {
    return { allowed: false, message: ERROR_MESSAGES.groupMissing };
  }

  const groupData = groupSnap.data() || {};
  const memberIds = (groupData.memberIds || []).map((id) => String(id));
  if (memberIds.includes(userId)) {
    return { allowed: true };
  }

  const groupPendingInvites = (groupData.pendingInvites || []).map((invite) =>
    normalizeEmail(invite)
  );
  if (email && groupPendingInvites.includes(email)) {
    return { allowed: false, message: ERROR_MESSAGES.pendingInvite };
  }

  return { allowed: false, message: ERROR_MESSAGES.notGroupMember };
}

function buildBasicPollSessionId(pollId, discordUserId) {
  return `${discordUserId}:basicPoll:${pollId}`;
}

function normalizeSelectionIds(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function resolveBasicPollVoteType(pollData = {}) {
  return pollData?.settings?.voteType === "RANKED_CHOICE"
    ? "RANKED_CHOICE"
    : "MULTIPLE_CHOICE";
}

function resolveBasicPollDeadlineDate(pollData = {}) {
  const raw = pollData?.settings?.deadlineAt || pollData?.deadlineAt || null;
  if (!raw) return null;
  if (typeof raw?.toDate === "function") {
    return raw.toDate();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isBasicPollWritable(pollData = {}) {
  if (String(pollData?.status || "OPEN").toUpperCase() !== "OPEN") {
    return false;
  }
  const deadlineAt = resolveBasicPollDeadlineDate(pollData);
  return !deadlineAt || deadlineAt.getTime() > Date.now();
}

function resolveBasicPollOptions(pollData = {}) {
  return (Array.isArray(pollData?.options) ? pollData.options : [])
    .map((option) => ({
      id: String(option?.id || "").trim(),
      label: String(option?.label || "").trim() || "Option",
    }))
    .filter((option) => option.id);
}

function getBasicPollOptionMap(pollData = {}) {
  const map = new Map();
  resolveBasicPollOptions(pollData).forEach((option) => {
    map.set(option.id, option.label);
  });
  return map;
}

function getMcMaxSelections(pollData, optionCount) {
  if (pollData?.settings?.allowMultiple !== true) return 1;
  const configured = Number(pollData?.settings?.maxSelections);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(optionCount, configured);
  }
  return optionCount;
}

function buildBasicPollMcContent({ pollData, selectedIds, optionMap }) {
  const summary =
    selectedIds.length === 0
      ? "No options selected yet."
      : `Selected: ${selectedIds.map((id) => optionMap.get(id) || id).join(", ")}`;
  const writeInNote =
    pollData?.settings?.allowWriteIn === true
      ? "\nWrite-in options are only available on web right now."
      : "";
  return `Basic poll: **${pollData?.title || "Untitled poll"}**\n${summary}${writeInNote}`;
}

function buildBasicPollMcComponents({
  pollId,
  pollData,
  optionRows,
  selectedIds = [],
}) {
  const maxSelections = Math.max(1, getMcMaxSelections(pollData, optionRows.length));
  const safeSelected = selectedIds.filter((id) => optionRows.some((option) => option.id === id));
  const options = optionRows.slice(0, MAX_SELECT_OPTIONS).map((option) => ({
    label: option.label,
    value: option.id,
    default: safeSelected.includes(option.id),
  }));

  return [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `bp_mc_select:${pollId}`,
          placeholder:
            pollData?.settings?.allowMultiple === true
              ? "Select one or more options"
              : "Select an option",
          min_values: 0,
          max_values: Math.min(maxSelections, options.length || 1),
          options,
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          custom_id: `bp_submit:${pollId}`,
          label: "Submit",
        },
        {
          type: 2,
          style: 2,
          custom_id: `bp_clear:${pollId}`,
          label: "Clear vote",
        },
      ],
    },
  ];
}

function getBasicPollOptionPage(options, pageIndex = 0) {
  const pageCount = Math.max(1, Math.ceil(options.length / MAX_SELECT_OPTIONS));
  const safeIndex = clampPageIndex(pageIndex, pageCount);
  const start = safeIndex * MAX_SELECT_OPTIONS;
  return {
    pageCount,
    pageIndex: safeIndex,
    pageOptions: options.slice(start, start + MAX_SELECT_OPTIONS),
  };
}

function buildBasicPollRankContent({ pollData, rankings, optionMap, remainingCount }) {
  const rankedLines =
    rankings.length === 0
      ? "No rankings yet."
      : rankings
          .map((optionId, index) => `${index + 1}. ${optionMap.get(optionId) || optionId}`)
          .join("\n");
  const nextPrompt =
    remainingCount > 0
      ? "\nPick your next choice, or submit a partial ranking."
      : "\nAll options ranked. Submit when ready.";
  return `Ranked poll: **${pollData?.title || "Untitled poll"}**\n${rankedLines}${nextPrompt}`;
}

function buildBasicPollRankComponents({
  pollId,
  pollData,
  rankings,
  remainingOptions,
  pageIndex,
}) {
  const page = getBasicPollOptionPage(remainingOptions, pageIndex);
  const optionMap = getBasicPollOptionMap(pollData);
  const selectOptions = page.pageOptions.map((option) => ({
    label: option.label,
    value: option.id,
  }));

  const components = [];
  if (selectOptions.length > 0) {
    components.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `bp_rank_select:${pollId}`,
          placeholder: `Pick rank #${rankings.length + 1}`,
          min_values: 1,
          max_values: 1,
          options: selectOptions,
        },
      ],
    });
  }

  if (page.pageCount > 1) {
    components.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          custom_id: `bp_rank_prev:${pollId}`,
          label: "Previous",
          disabled: page.pageIndex <= 0,
        },
        {
          type: 2,
          style: 2,
          custom_id: `bp_rank_next:${pollId}`,
          label: "Next",
          disabled: page.pageIndex >= page.pageCount - 1,
        },
      ],
    });
  }

  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 1,
        custom_id: `bp_rank_submit:${pollId}`,
        label: "Submit",
      },
      {
        type: 2,
        style: 2,
        custom_id: `bp_rank_undo:${pollId}`,
        label: "Undo Last",
        disabled: rankings.length === 0,
      },
      {
        type: 2,
        style: 2,
        custom_id: `bp_rank_reset:${pollId}`,
        label: "Start Over",
        disabled: rankings.length === 0,
      },
      {
        type: 2,
        style: 2,
        custom_id: `bp_clear:${pollId}`,
        label: "Clear vote",
      },
    ],
  });

  return {
    content: buildBasicPollRankContent({
      pollData,
      rankings,
      optionMap,
      remainingCount: remainingOptions.length,
    }),
    components,
    pageIndex: page.pageIndex,
  };
}

async function buildGroupBasicPollContextFromDoc(pollDoc) {
  const pollRef = pollDoc?.ref;
  const parentGroupRef = pollRef?.parent?.parent;
  if (!pollRef || !parentGroupRef) return null;
  if (parentGroupRef?.parent?.id !== "questingGroups") return null;

  const groupSnap = await parentGroupRef.get();
  if (!groupSnap.exists) return null;

  return {
    pollRef,
    pollData: pollDoc.data() || {},
    groupRef: parentGroupRef,
    groupData: groupSnap.data() || {},
    groupId: parentGroupRef.id,
  };
}

async function loadGroupBasicPollById(pollId, interaction = null) {
  const normalizedPollId = String(pollId || "").trim();
  if (!normalizedPollId) return null;

  if (interaction) {
    const linkedGroup = await getLinkedGroupForChannel(interaction);
    if (linkedGroup?.groupRef) {
      const pollSnap = await linkedGroup.groupRef
        .collection("basicPolls")
        .doc(normalizedPollId)
        .get();
      if (pollSnap.exists) {
        return {
          pollRef: pollSnap.ref,
          pollData: pollSnap.data() || {},
          groupRef: linkedGroup.groupRef,
          groupData: linkedGroup.groupData || {},
          groupId: linkedGroup.groupId,
        };
      }
    }
  }

  const fallbackQueries = [];
  if (interaction?.message?.id) {
    fallbackQueries.push({
      field: "discord.messageId",
      value: String(interaction.message.id),
      limit: 8,
    });
  }
  if (interaction?.channelId) {
    fallbackQueries.push({
      field: "discord.channelId",
      value: String(interaction.channelId),
      limit: 50,
    });
  }

  for (const fallback of fallbackQueries) {
    const snapshot = await db
      .collectionGroup("basicPolls")
      .where(fallback.field, "==", fallback.value)
      .limit(fallback.limit)
      .get();
    if (snapshot.empty) continue;

    const pollDoc = snapshot.docs.find((docSnap) => docSnap.id === normalizedPollId);
    if (!pollDoc) continue;

    const context = await buildGroupBasicPollContextFromDoc(pollDoc);
    if (context) return context;
  }

  return null;
}

function ensureGroupMemberForBasicPoll(groupData, linkedUser) {
  const userId = String(linkedUser?.uid || "");
  if (!userId) return false;
  if (String(groupData?.creatorId || "") === userId) return true;
  return (groupData?.memberIds || []).map(String).includes(userId);
}

function validateBasicPollDiscordChannel(interaction, pollData, groupData) {
  const pollDiscord = pollData?.discord || {};
  const groupDiscord = groupData?.discord || {};
  const expectedChannelId = pollDiscord.channelId || groupDiscord.channelId || null;
  const expectedGuildId = pollDiscord.guildId || groupDiscord.guildId || null;

  if (expectedChannelId && interaction.channelId && expectedChannelId !== interaction.channelId) {
    return { ok: false, message: ERROR_MESSAGES.channelMismatch };
  }
  if (expectedGuildId && interaction.guildId && expectedGuildId !== interaction.guildId) {
    return { ok: false, message: ERROR_MESSAGES.guildMismatch };
  }
  return { ok: true };
}

function getCommandOptionValue(interaction, optionName) {
  const options = Array.isArray(interaction?.data?.options)
    ? interaction.data.options
    : [];
  const option = options.find((entry) => entry?.name === optionName);
  return option?.value;
}

function isGroupManagerForDiscord(groupData, qsUserId) {
  if (!groupData || !qsUserId) return false;
  if (String(groupData.creatorId || "") === String(qsUserId)) return true;

  if (groupData.memberPermissionsEnabled === true) {
    return groupData.memberPermissions?.[qsUserId]?.isManager === true;
  }

  const memberIds = Array.isArray(groupData.memberIds) ? groupData.memberIds.map(String) : [];
  return groupData.memberManaged === true && memberIds.includes(String(qsUserId));
}

function parsePollCreateOptionLabels(rawOptionsValue) {
  return String(rawOptionsValue || "")
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePollCreateDeadline(rawDeadlineValue) {
  const raw = String(rawDeadlineValue || "").trim();
  if (!raw) {
    return { ok: true, deadlineAt: null };
  }

  let parsedDate = null;
  const relativeMatch = raw.match(RELATIVE_DEADLINE_REGEX);
  if (relativeMatch) {
    const amount = Number(relativeMatch[1] || 0);
    const unit = String(relativeMatch[2] || "").toLowerCase();
    const multiplierMs = unit === "w" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, errorMessage: ERROR_MESSAGES.deadlineInPast };
    }
    parsedDate = new Date(Date.now() + amount * multiplierMs);
  } else if (ISO_DATE_ONLY_REGEX.test(raw)) {
    parsedDate = new Date(`${raw}T23:59:59.999Z`);
  } else {
    parsedDate = new Date(raw);
  }

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return { ok: false, errorMessage: ERROR_MESSAGES.deadlineInPast };
  }
  if (parsedDate.getTime() <= Date.now()) {
    return { ok: false, errorMessage: ERROR_MESSAGES.deadlineInPast };
  }

  return {
    ok: true,
    deadlineAt: admin.firestore.Timestamp.fromDate(parsedDate),
  };
}

async function getLinkedGroupForChannel(interaction) {
  if (!interaction?.channelId) return null;
  const groupCollection = db.collection("questingGroups");
  if (!groupCollection || typeof groupCollection.where !== "function") return null;

  const linkedGroupsSnap = await groupCollection
    .where("discord.channelId", "==", interaction.channelId)
    .get();

  if (linkedGroupsSnap.empty) return null;
  const matchingDoc =
    linkedGroupsSnap.docs.find(
      (docSnap) => docSnap.data()?.discord?.guildId === interaction.guildId
    ) || linkedGroupsSnap.docs[0];

  if (!matchingDoc) return null;
  return {
    groupId: matchingDoc.id,
    groupRef: matchingDoc.ref,
    groupData: matchingDoc.data() || {},
  };
}

function buildBasicPollEditUrl(groupId, pollId) {
  const baseUrl = String(APP_URL || "").replace(/\/$/, "");
  return `${baseUrl}/groups/${groupId}/polls/${pollId}`;
}

function resolveGroupNotificationRecipients(groupData) {
  const recipients = new Set((groupData?.memberIds || []).map((value) => String(value)));
  if (groupData?.creatorId) {
    recipients.add(String(groupData.creatorId));
  }
  return Array.from(recipients);
}

function buildPollCreateOptions(optionLabels) {
  return optionLabels.map((label, index) => ({
    id: `option-${randomUUID()}`,
    label,
    order: index,
    note: null,
  }));
}

function buildPollCreatedNotificationActor(linkedUser) {
  return {
    uid: linkedUser?.uid || null,
    email: normalizeEmail(linkedUser?.email || "") || null,
    displayName:
      linkedUser?.displayName ||
      normalizeEmail(linkedUser?.email || "") ||
      "Someone",
  };
}

async function emitBasicPollCreatedNotification({
  groupId,
  pollId,
  pollData,
  groupData,
  linkedUser,
}) {
  const recipientUserIds = resolveGroupNotificationRecipients(groupData);
  if (recipientUserIds.length === 0) return;

  await queueNotificationEvent({
    db,
    eventType: "BASIC_POLL_CREATED",
    resource: {
      type: "basicPoll",
      id: pollId,
      title: pollData?.title || "Basic poll",
    },
    actor: buildPollCreatedNotificationActor(linkedUser),
    payload: {
      parentType: "group",
      parentId: groupId,
      basicPollId: pollId,
      basicPollTitle: pollData?.title || "Basic poll",
    },
    recipients: {
      userIds: recipientUserIds,
    },
    source: "discord",
    createdBy: linkedUser?.uid || "system",
  });
}

function buildPollCreateSuccessResponse(groupId, pollId) {
  const editUrl = buildBasicPollEditUrl(groupId, pollId);
  return {
    content:
      "Poll created! See the poll card above. Click **Edit on Web** to add descriptions, option notes, or fine-tune settings.",
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "Edit on Web",
            url: editUrl,
          },
        ],
      },
    ],
  };
}

function hasSubmittedBasicPollVote(pollData, voteData = {}) {
  const voteType = resolveBasicPollVoteType(pollData);
  if (voteType === "RANKED_CHOICE") {
    return normalizeSelectionIds(voteData.rankings || []).length > 0;
  }

  const hasOptionIds = normalizeSelectionIds(voteData.optionIds || []).length > 0;
  const allowWriteIn = pollData?.settings?.allowWriteIn === true;
  const hasWriteIn = allowWriteIn && String(voteData.otherText || "").trim().length > 0;
  return hasOptionIds || hasWriteIn;
}

function buildBasicPollFinalResults(pollData = {}, voteDocs = []) {
  const options = Array.isArray(pollData.options) ? pollData.options : [];
  const voteType = resolveBasicPollVoteType(pollData);
  const submittedVotes = voteDocs.filter((voteDoc) =>
    hasSubmittedBasicPollVote(pollData, voteDoc || {})
  );

  if (voteType === "RANKED_CHOICE") {
    const optionIds = options.map((option) => option?.id).filter(Boolean);
    const irv = computeInstantRunoffResults({
      optionIds,
      votes: submittedVotes,
    });
    const rounds = Array.isArray(irv.rounds) ? irv.rounds : [];
    const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
    return {
      voteType: "RANKED_CHOICE",
      rounds,
      winnerIds: Array.isArray(irv.winnerIds) ? irv.winnerIds : [],
      tiedIds: Array.isArray(irv.tiedIds) ? irv.tiedIds : [],
      voterCount: Number.isFinite(irv.totalBallots) ? irv.totalBallots : submittedVotes.length,
      exhaustedCount: Number.isFinite(lastRound?.exhausted) ? lastRound.exhausted : 0,
      capturedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
  }

  const tallies = computeMultipleChoiceTallies({
    options,
    votes: submittedVotes,
    allowWriteIn: pollData?.settings?.allowWriteIn === true,
  });
  const rows = (tallies.rows || []).map((row) => ({
    key: row.key,
    label: row.label,
    order: row.order,
    count: row.count,
    percentage: row.percentage,
  }));
  const winningCount = Math.max(...rows.map((row) => row.count), 0);
  const winnerIds =
    winningCount > 0 ? rows.filter((row) => row.count === winningCount).map((row) => row.key) : [];
  return {
    voteType: "MULTIPLE_CHOICE",
    rows,
    winnerIds,
    voterCount: Number.isFinite(tallies.totalVoters) ? tallies.totalVoters : submittedVotes.length,
    capturedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildBasicPollOptionLabelMap(pollData = {}) {
  const optionMap = new Map();
  (Array.isArray(pollData.options) ? pollData.options : []).forEach((option) => {
    const optionId = String(option?.id || "").trim();
    if (!optionId) return;
    const label = String(option?.label || optionId).trim() || optionId;
    optionMap.set(optionId, label);
  });
  return optionMap;
}

function summarizeBasicPollResults(pollData, finalResults) {
  if (!finalResults) return "View the final results.";

  if (finalResults.voteType === "RANKED_CHOICE") {
    const optionMap = buildBasicPollOptionLabelMap(pollData);
    const winnerLabels = (finalResults.winnerIds || []).map((id) => optionMap.get(id) || id);
    if (winnerLabels.length > 0) {
      return `Winner: ${winnerLabels.join(", ")}.`;
    }
    const tiedLabels = (finalResults.tiedIds || []).map((id) => optionMap.get(id) || id);
    if (tiedLabels.length > 0) {
      return `Tie: ${tiedLabels.join(", ")}.`;
    }
    return "No winner.";
  }

  const rows = Array.isArray(finalResults.rows) ? finalResults.rows : [];
  if (rows.length === 0) return "No votes yet.";
  const topRow = rows.reduce((best, row) => {
    if (!best || Number(row?.count || 0) > Number(best?.count || 0)) return row;
    return best;
  }, null);
  if (!topRow) return "No votes yet.";
  const count = Number.isFinite(topRow.count) ? topRow.count : 0;
  return `Top choice: ${topRow.label || topRow.key || "Option"} (${count} vote${count === 1 ? "" : "s"}).`;
}

function formatMcResultsAnnouncement({ pollData, finalResults }) {
  const rows = Array.isArray(finalResults?.rows) ? finalResults.rows : [];
  if (rows.length === 0) return "No votes were submitted.";
  const winnerIds = new Set(Array.isArray(finalResults?.winnerIds) ? finalResults.winnerIds : []);
  return rows
    .slice(0, 8)
    .map((row, index) => {
      const label = row?.label || row?.key || `Option ${index + 1}`;
      const count = Number.isFinite(row?.count) ? row.count : 0;
      const pct = Number.isFinite(row?.percentage) ? row.percentage : 0;
      const winnerPrefix = winnerIds.has(row?.key) ? "🏆 " : "";
      return `${winnerPrefix}${label} — ${count} vote${count === 1 ? "" : "s"} (${pct}%)`;
    })
    .join("\n");
}

function formatRcRoundsAnnouncement({ pollData, finalResults }) {
  const optionMap = buildBasicPollOptionLabelMap(pollData);
  const rounds = Array.isArray(finalResults?.rounds) ? finalResults.rounds : [];
  if (rounds.length === 0) return "No rounds were computed.";

  return rounds
    .slice(0, 5)
    .map((round, roundIndex) => {
      const counts = round?.counts || {};
      const labels = Object.keys(counts)
        .map((optionId) => ({
          optionId,
          label: optionMap.get(optionId) || optionId,
          count: Number.isFinite(counts[optionId]) ? counts[optionId] : 0,
        }))
        .sort((left, right) => right.count - left.count)
        .map((entry) => `${entry.label} (${entry.count})`)
        .join(", ");
      if (roundIndex === rounds.length - 1 && Array.isArray(finalResults?.winnerIds) && finalResults.winnerIds.length > 0) {
        return `Round ${round?.round || roundIndex + 1}: ${labels} — majority reached`;
      }
      const eliminated = Array.isArray(round?.eliminatedIds)
        ? round.eliminatedIds.map((id) => optionMap.get(id) || id)
        : [];
      const eliminationText = eliminated.length > 0 ? ` — eliminated: ${eliminated.join(", ")}` : " — no majority";
      return `Round ${round?.round || roundIndex + 1}: ${labels}${eliminationText}`;
    })
    .join("\n");
}

function buildBasicPollResultsAnnouncement({
  groupId,
  pollId,
  pollData,
  finalResults,
  finalizedBy,
}) {
  const pollUrl = buildBasicPollEditUrl(groupId, pollId);
  const title = pollData?.title || "Untitled Poll";
  const actorName =
    finalizedBy?.displayName ||
    normalizeEmail(finalizedBy?.email || "") ||
    "someone";

  if (finalResults?.voteType === "RANKED_CHOICE") {
    const optionMap = buildBasicPollOptionLabelMap(pollData);
    const winnerLabels = (finalResults.winnerIds || []).map((id) => optionMap.get(id) || id);
    const headline =
      winnerLabels.length > 0
        ? `🏆 **${winnerLabels.join(", ")}** wins after ${Array.isArray(finalResults.rounds) ? finalResults.rounds.length : 0} rounds!`
        : "Poll finalized.";
    const roundsText = formatRcRoundsAnnouncement({ pollData, finalResults });
    const voterCount = Number.isFinite(finalResults.voterCount) ? finalResults.voterCount : 0;
    const exhausted = Number.isFinite(finalResults.exhaustedCount) ? finalResults.exhaustedCount : 0;
    return [
      `📊 **Poll Results: "${title}"**`,
      "",
      headline,
      "",
      roundsText,
      "",
      `${voterCount} voter${voterCount === 1 ? "" : "s"} · ${exhausted} exhausted ballot${exhausted === 1 ? "" : "s"} · Finalized by ${actorName}`,
      `View full round-by-round breakdown: ${pollUrl}`,
    ].join("\n");
  }

  const rowsText = formatMcResultsAnnouncement({ pollData, finalResults });
  const voterCount = Number.isFinite(finalResults?.voterCount) ? finalResults.voterCount : 0;
  return [
    `📊 **Poll Results: "${title}"**`,
    "",
    rowsText,
    "",
    `${voterCount} voter${voterCount === 1 ? "" : "s"} · Finalized by ${actorName}`,
    `View full results: ${pollUrl}`,
  ].join("\n");
}

async function handlePollCreate(interaction) {
  const linked = await getBasicPollLinkedUser(interaction);
  if (!linked) return;

  const linkedGroup = await getLinkedGroupForChannel(interaction);
  if (!linkedGroup) {
    return respondWithError(interaction, ERROR_MESSAGES.noLinkedGroupForPoll);
  }

  if (!isGroupManagerForDiscord(linkedGroup.groupData, linked.linkedUser.uid)) {
    return respondWithError(interaction, ERROR_MESSAGES.notGroupManager);
  }

  const title = String(getCommandOptionValue(interaction, "title") || "").trim();
  const optionLabels = parsePollCreateOptionLabels(
    getCommandOptionValue(interaction, "options")
  );
  const mode = String(getCommandOptionValue(interaction, "mode") || "multiple-choice")
    .trim()
    .toLowerCase();
  const rankedChoice = mode === "ranked-choice";
  const allowOther = Boolean(getCommandOptionValue(interaction, "allow_other"));
  const allowMultiple = rankedChoice ? false : Boolean(getCommandOptionValue(interaction, "multi"));

  if (optionLabels.length < 2) {
    return respondWithError(interaction, ERROR_MESSAGES.tooFewOptions);
  }
  if (optionLabels.length > MAX_SELECT_OPTIONS) {
    return respondWithError(interaction, ERROR_MESSAGES.tooManyOptionsDiscord);
  }
  if (rankedChoice && allowOther) {
    return respondWithError(interaction, ERROR_MESSAGES.writeInNotRanked);
  }

  const deadlineResult = parsePollCreateDeadline(
    getCommandOptionValue(interaction, "deadline")
  );
  if (!deadlineResult.ok) {
    return respondWithError(
      interaction,
      deadlineResult.errorMessage || ERROR_MESSAGES.deadlineInPast
    );
  }

  const pollRef = linkedGroup.groupRef.collection("basicPolls").doc();
  const pollId = pollRef.id;
  const pollData = {
    title: title || "Untitled Poll",
    description: null,
    status: "OPEN",
    creatorId: linked.linkedUser.uid,
    options: buildPollCreateOptions(optionLabels),
    settings: {
      voteType: rankedChoice ? "RANKED_CHOICE" : "MULTIPLE_CHOICE",
      allowMultiple,
      maxSelections: null,
      allowWriteIn: rankedChoice ? false : allowOther,
      deadlineAt: deadlineResult.deadlineAt,
    },
    source: "discord",
  };

  const totalParticipants = resolveGroupNotificationRecipients(linkedGroup.groupData).length;
  const cardBody = buildBasicPollCard({
    groupId: linkedGroup.groupId,
    pollId,
    poll: pollData,
    voteCount: 0,
    totalParticipants,
  });

  const message = await createChannelMessage({
    channelId: interaction.channelId,
    body: cardBody,
  });
  const messageId = message?.id || null;
  if (!messageId) {
    throw new Error("Discord poll-create message ID missing");
  }

  const discordMetadata = {
    messageId,
    channelId: interaction.channelId || linkedGroup.groupData?.discord?.channelId || null,
    guildId: interaction.guildId || linkedGroup.groupData?.discord?.guildId || null,
    messageUrl:
      interaction.guildId && interaction.channelId
        ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${messageId}`
        : null,
  };

  try {
    await pollRef.set({
      ...pollData,
      discord: discordMetadata,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    await deleteChannelMessage({
      channelId: interaction.channelId,
      messageId,
    }).catch(() => null);
    throw error;
  }

  emitBasicPollCreatedNotification({
    groupId: linkedGroup.groupId,
    pollId,
    pollData,
    groupData: linkedGroup.groupData,
    linkedUser: linked.linkedUser,
  }).catch((error) => {
    logger.error("Failed to emit BASIC_POLL_CREATED notification from Discord poll-create", {
      groupId: linkedGroup.groupId,
      pollId,
      error: error?.message,
    });
  });

  return respondWithMessage(
    interaction,
    buildPollCreateSuccessResponse(linkedGroup.groupId, pollId)
  );
}

async function handleLinkGroup(interaction) {
  const options = interaction?.data?.options || [];
  const codeOption = options.find((option) => option.name === "code");
  const rawCode = String(codeOption?.value || "").trim();
  if (!rawCode) {
    return respondWithError(interaction, ERROR_MESSAGES.missingLinkCode);
  }

  if (!interaction.guildId || !interaction.channelId) {
    return respondWithError(interaction, ERROR_MESSAGES.linkChannelOnly);
  }

  if (!hasLinkPermissions(interaction.member?.permissions)) {
    return respondWithError(interaction, ERROR_MESSAGES.linkPermissions);
  }

  const codeHash = hashLinkCode(rawCode);
  const codeRef = db.collection("discordLinkCodes").doc(codeHash);
  const codeSnap = await codeRef.get();
  if (!codeSnap.exists) {
    return respondWithError(interaction, ERROR_MESSAGES.linkCodeInvalidOrExpired);
  }
  const codeData = codeSnap.data() || {};
  const expiresAt = codeData.expiresAt?.toDate?.();
  const attempts = Number(codeData.attempts || 0);
  if (codeData.type !== "group-link" || !codeData.groupId || !codeData.uid) {
    await codeRef.delete();
    return respondWithError(interaction, ERROR_MESSAGES.linkCodeInvalid);
  }
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    await codeRef.delete();
    return respondWithError(interaction, ERROR_MESSAGES.linkCodeExpired);
  }
  if (attempts >= 5) {
    await codeRef.delete();
    return respondWithError(interaction, ERROR_MESSAGES.linkCodeInvalidOrExpired);
  }

  const existingChannelLinksSnap = await db
    .collection("questingGroups")
    .where("discord.channelId", "==", interaction.channelId)
    .get();
  const conflictingLink = existingChannelLinksSnap.docs.find(
    (doc) => doc.id !== codeData.groupId
  );
  if (conflictingLink) {
    return respondWithError(interaction, ERROR_MESSAGES.channelAlreadyLinked);
  }

  await codeRef.set(
    {
      attempts: attempts + 1,
    },
    { merge: true }
  );

  const channelInfo = await fetchChannel({ channelId: interaction.channelId }).catch(() => null);

  const groupRef = db.collection("questingGroups").doc(codeData.groupId);
  const groupSnap = await groupRef.get();
  const existingNotifyRoleId =
    groupSnap.exists ? groupSnap.data()?.discord?.notifyRoleId : null;
  const existingNotifications =
    groupSnap.exists ? groupSnap.data()?.discord?.notifications : null;
  const notificationSettings = {
    ...DISCORD_NOTIFICATION_DEFAULTS,
    ...(existingNotifications || {}),
  };

  await groupRef.set(
    {
      discord: {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        channelName: channelInfo?.name || null,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
        linkedByUserId: codeData.uid,
        notifyRoleId: existingNotifyRoleId || "everyone",
        notifications: notificationSettings,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await codeRef.delete();

  try {
    const testMessageId = await sendLinkTestMessage(
      interaction.channelId,
      channelInfo?.name || null
    );
    if (testMessageId) {
      await deleteChannelMessage({
        channelId: interaction.channelId,
        messageId: testMessageId,
      }).catch((err) => {
        logger.warn("Failed to delete Discord link test message", {
          channelId: interaction.channelId,
          messageId: testMessageId,
          error: err?.message || String(err),
        });
      });
    }
    return respondWithMessage(interaction, {
      content: LINK_TEST_SUCCESS_MESSAGE,
    });
  } catch (err) {
    logger.warn("Discord link test message failed", {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      error: err?.message || String(err),
      status: err?.status || err?.statusCode,
      code: err?.code || err?.rawError?.code,
    });
    return respondWithMessage(interaction, {
      content: LINK_PERMISSION_WARNING_MESSAGE,
    });
  }
}

async function handleUnlinkGroup(interaction) {
  if (!interaction.guildId || !interaction.channelId) {
    return respondWithError(interaction, ERROR_MESSAGES.linkChannelOnly);
  }

  if (!hasLinkPermissions(interaction.member?.permissions)) {
    return respondWithError(interaction, ERROR_MESSAGES.linkPermissions);
  }

  const groupSnap = await db
    .collection("questingGroups")
    .where("discord.channelId", "==", interaction.channelId)
    .get();
  if (groupSnap.empty) {
    return respondWithError(interaction, ERROR_MESSAGES.noLinkedGroup);
  }

  const matchingDoc =
    groupSnap.docs.find(
      (doc) => doc.data()?.discord?.guildId === interaction.guildId
    ) || groupSnap.docs[0];

  if (!matchingDoc) {
    return respondWithError(interaction, ERROR_MESSAGES.noLinkedGroup);
  }

  await matchingDoc.ref.set(
    {
      discord: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return respondWithMessage(interaction, {
    content: "Discord channel unlinked from the Quest Scheduler group.",
  });
}

async function handleVoteButton(interaction, schedulerId) {
  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    return respondWithError(interaction, ERROR_MESSAGES.pollNotFound);
  }
  const scheduler = schedulerSnap.data();
  if (scheduler.status !== "OPEN") {
    return respondWithError(interaction, ERROR_MESSAGES.pollFinalized);
  }
  if (
    scheduler.discord?.channelId &&
    scheduler.discord.channelId !== interaction.channelId
  ) {
    return respondWithError(interaction, ERROR_MESSAGES.channelMismatch);
  }
  if (
    scheduler.discord?.guildId &&
    scheduler.discord.guildId !== interaction.guildId
  ) {
    return respondWithError(interaction, ERROR_MESSAGES.guildMismatch);
  }

  const discordUserId = getDiscordUserId(interaction);
  if (!discordUserId) {
    return respondWithError(interaction, ERROR_MESSAGES.missingDiscordUser);
  }
  const linkedUser = await getLinkedUser(discordUserId);
  if (!linkedUser) {
    return respondWithError(
      interaction,
      buildUserNotLinkedMessage(APP_URL)
    );
  }
  const userEmail = linkedUser.email || null;
  const displayTimeZone = resolveDiscordDisplayTimeZone(scheduler, linkedUser);

  const participation = await getParticipationDecision(scheduler, linkedUser);
  if (!participation.allowed) {
    return respondWithError(
      interaction,
      participation.message || ERROR_MESSAGES.notParticipant
    );
  }

  const slotsSnap = await schedulerRef.collection("slots").get();
  const slots = slotsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((slot) => slot.start && slot.end)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  if (slots.length === 0) {
    return respondWithError(interaction, ERROR_MESSAGES.noSlots);
  }

  const voteSnap = await schedulerRef.collection("votes").doc(linkedUser.uid).get();
  const existingVotes = voteSnap.exists ? voteSnap.data()?.votes || {} : {};
  const preferredIds = Object.entries(existingVotes)
    .filter(([, value]) => value === "PREFERRED")
    .map(([slotId]) => slotId);
  const feasibleIds = Object.entries(existingVotes)
    .filter(([, value]) => value === "FEASIBLE" || value === "PREFERRED")
    .map(([slotId]) => slotId);

  const sessionRef = db.collection("discordVoteSessions").doc(
    buildSessionId(schedulerId, discordUserId)
  );
  const pageInfo = getVotePage(slots, 0);
  await sessionRef.set(
    {
      schedulerId,
      discordUserId,
      qsUserId: linkedUser.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      preferredSlotIds: preferredIds,
      feasibleSlotIds: feasibleIds,
      pageIndex: pageInfo.pageIndex,
      displayTimeZone,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + VOTE_SESSION_TTL_MINUTES * 60 * 1000)
      ),
    },
    { merge: true }
  );

  const components = buildVoteComponents({
    schedulerId,
    slots: pageInfo.pageSlots,
    preferredIds,
    feasibleIds,
    timezone: displayTimeZone || scheduler?.timezone || null,
    pageIndex: pageInfo.pageIndex,
    pageCount: pageInfo.pageCount,
  });

  return respondWithMessage(interaction, {
    content: formatVoteContent(
      "Select your preferred and feasible times, then press Submit.",
      pageInfo.pageIndex,
      pageInfo.pageCount
    ),
    components,
  });
}

async function handleVoteSelect(interaction, schedulerId, type) {
  const discordUserId = getDiscordUserId(interaction);
  if (!discordUserId) {
    return respondWithError(interaction, ERROR_MESSAGES.missingDiscordUser);
  }

  const sessionRef = db.collection("discordVoteSessions").doc(
    buildSessionId(schedulerId, discordUserId)
  );
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return respondWithError(interaction, ERROR_MESSAGES.sessionExpired);
  }
  const sessionData = sessionSnap.data() || {};
  const values = interaction?.data?.values || [];

  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  const scheduler = schedulerSnap.exists ? schedulerSnap.data() : {};
  if (scheduler.status !== "OPEN") {
    await sessionRef.delete().catch(() => null);
    return respondWithClosedPoll(interaction);
  }
  const slotsSnap = await schedulerRef.collection("slots").get();
  const slots = slotsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((slot) => slot.start && slot.end)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  if (slots.length === 0) {
    return respondWithError(interaction, ERROR_MESSAGES.noSlots);
  }
  const displayTimeZone = sessionData.displayTimeZone || scheduler?.timezone || null;
  const pageInfo = getVotePage(slots, sessionData.pageIndex || 0);
  const pageSlotIds = new Set(pageInfo.pageSlots.map((slot) => slot.id));

  const update = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + VOTE_SESSION_TTL_MINUTES * 60 * 1000)
    ),
    pageIndex: pageInfo.pageIndex,
  };

  const currentPreferred = sessionData.preferredSlotIds || [];
  const currentFeasible = sessionData.feasibleSlotIds || [];
  let nextPreferred = currentPreferred;
  let nextFeasible = currentFeasible;

  if (type === "preferred") {
    const preferredSet = new Set(
      currentPreferred.filter((slotId) => !pageSlotIds.has(slotId))
    );
    values.forEach((slotId) => preferredSet.add(slotId));
    nextPreferred = Array.from(preferredSet);
    const feasibleSet = new Set(currentFeasible);
    nextPreferred.forEach((slotId) => feasibleSet.add(slotId));
    nextFeasible = Array.from(feasibleSet);
    update.preferredSlotIds = nextPreferred;
    update.feasibleSlotIds = nextFeasible;
  } else {
    const feasibleSet = new Set(
      currentFeasible.filter((slotId) => !pageSlotIds.has(slotId))
    );
    values.forEach((slotId) => feasibleSet.add(slotId));
    nextFeasible = Array.from(feasibleSet);
    nextPreferred = currentPreferred.filter((slotId) => feasibleSet.has(slotId));
    update.feasibleSlotIds = nextFeasible;
    update.preferredSlotIds = nextPreferred;
  }

  await sessionRef.set(update, { merge: true });

  const components = buildVoteComponents({
    schedulerId,
    slots: pageInfo.pageSlots,
    preferredIds: nextPreferred,
    feasibleIds: nextFeasible,
    timezone: displayTimeZone,
    pageIndex: pageInfo.pageIndex,
    pageCount: pageInfo.pageCount,
  });

  return respondWithMessage(interaction, {
    content: formatVoteContent(
      "Selections saved. Submit when ready.",
      pageInfo.pageIndex,
      pageInfo.pageCount
    ),
    components,
  });
}

async function handleVotePage(interaction, schedulerId, direction) {
  const discordUserId = getDiscordUserId(interaction);
  if (!discordUserId) {
    return respondWithError(interaction, ERROR_MESSAGES.missingDiscordUser);
  }

  const sessionRef = db.collection("discordVoteSessions").doc(
    buildSessionId(schedulerId, discordUserId)
  );
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return respondWithError(interaction, ERROR_MESSAGES.sessionExpired);
  }
  const sessionData = sessionSnap.data() || {};

  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  const scheduler = schedulerSnap.exists ? schedulerSnap.data() : {};
  if (scheduler.status !== "OPEN") {
    await sessionRef.delete().catch(() => null);
    return respondWithClosedPoll(interaction);
  }
  const slotsSnap = await schedulerRef.collection("slots").get();
  const slots = slotsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((slot) => slot.start && slot.end)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  if (slots.length === 0) {
    return respondWithError(interaction, ERROR_MESSAGES.noSlots);
  }

  const displayTimeZone = sessionData.displayTimeZone || scheduler?.timezone || null;
  const currentPage = getVotePage(slots, sessionData.pageIndex || 0);
  const nextIndex =
    direction === "next" ? currentPage.pageIndex + 1 : currentPage.pageIndex - 1;
  const pageInfo = getVotePage(slots, nextIndex);

  await sessionRef.set(
    {
      pageIndex: pageInfo.pageIndex,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + VOTE_SESSION_TTL_MINUTES * 60 * 1000)
      ),
    },
    { merge: true }
  );

  const components = buildVoteComponents({
    schedulerId,
    slots: pageInfo.pageSlots,
    preferredIds: sessionData.preferredSlotIds || [],
    feasibleIds: sessionData.feasibleSlotIds || [],
    timezone: displayTimeZone,
    pageIndex: pageInfo.pageIndex,
    pageCount: pageInfo.pageCount,
  });

  return respondWithMessage(interaction, {
    content: formatVoteContent(
      "Selections saved. Submit when ready.",
      pageInfo.pageIndex,
      pageInfo.pageCount
    ),
    components,
  });
}

async function handleClearVotes(interaction, schedulerId, noTimesWork) {
  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    return respondWithError(interaction, ERROR_MESSAGES.pollNotFound);
  }
  const scheduler = schedulerSnap.data();
  if (scheduler.status !== "OPEN") {
    return respondWithClosedPoll(interaction);
  }
  if (
    scheduler.discord?.channelId &&
    scheduler.discord.channelId !== interaction.channelId
  ) {
    return respondWithError(interaction, ERROR_MESSAGES.channelMismatch);
  }
  if (
    scheduler.discord?.guildId &&
    scheduler.discord.guildId !== interaction.guildId
  ) {
    return respondWithError(interaction, ERROR_MESSAGES.guildMismatch);
  }

  const discordUserId = getDiscordUserId(interaction);
  if (!discordUserId) {
    return respondWithError(interaction, ERROR_MESSAGES.missingDiscordUser);
  }
  const linkedUser = await getLinkedUser(discordUserId);
  if (!linkedUser) {
    return respondWithError(
      interaction,
      buildUserNotLinkedMessage(APP_URL)
    );
  }
  const userEmail = linkedUser.email || null;
  const displayTimeZone = resolveDiscordDisplayTimeZone(scheduler, linkedUser);

  const participation = await getParticipationDecision(scheduler, linkedUser);
  if (!participation.allowed) {
    return respondWithError(
      interaction,
      participation.message || ERROR_MESSAGES.notParticipant
    );
  }

  await schedulerRef
    .collection("votes")
    .doc(linkedUser.uid)
    .set(
      {
        userEmail,
        userAvatar: linkedUser.photoURL || null,
        votes: {},
        noTimesWork: Boolean(noTimesWork),
        source: "discord",
        lastVotedFrom: "discord",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  const sessionRef = db.collection("discordVoteSessions").doc(
    buildSessionId(schedulerId, discordUserId)
  );
  if (noTimesWork) {
    await sessionRef.delete().catch(() => null);
    return respondWithMessage(interaction, {
      content: "Marked as unavailable for this poll.",
      components: [],
    });
  }

  await sessionRef.set(
    {
      schedulerId,
      discordUserId,
      qsUserId: linkedUser.uid,
      preferredSlotIds: [],
      feasibleSlotIds: [],
      pageIndex: 0,
      displayTimeZone,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + VOTE_SESSION_TTL_MINUTES * 60 * 1000)
      ),
    },
    { merge: true }
  );

  const slotsSnap = await schedulerRef.collection("slots").get();
  const slots = slotsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((slot) => slot.start && slot.end)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  if (slots.length === 0) {
    return respondWithError(interaction, ERROR_MESSAGES.noSlots);
  }
  const pageInfo = getVotePage(slots, 0);

  const components = buildVoteComponents({
    schedulerId,
    slots: pageInfo.pageSlots,
    preferredIds: [],
    feasibleIds: [],
    timezone: displayTimeZone || scheduler?.timezone || null,
    pageIndex: pageInfo.pageIndex,
    pageCount: pageInfo.pageCount,
  });

  const message = "Votes cleared. You can pick new times below.";

  return respondWithMessage(interaction, {
    content: formatVoteContent(message, pageInfo.pageIndex, pageInfo.pageCount),
    components,
  });
}

async function handleSubmitVote(interaction, schedulerId) {
  const discordUserId = getDiscordUserId(interaction);
  if (!discordUserId) {
    return respondWithError(interaction, ERROR_MESSAGES.missingDiscordUser);
  }

  const sessionRef = db.collection("discordVoteSessions").doc(
    buildSessionId(schedulerId, discordUserId)
  );
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return respondWithError(interaction, ERROR_MESSAGES.sessionExpired);
  }
  const session = sessionSnap.data() || {};

  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    return respondWithError(interaction, ERROR_MESSAGES.pollNotFound);
  }
  const scheduler = schedulerSnap.data();
  if (scheduler.status !== "OPEN") {
    return respondWithClosedPoll(interaction);
  }
  if (
    scheduler.discord?.channelId &&
    scheduler.discord.channelId !== interaction.channelId
  ) {
    return respondWithError(interaction, ERROR_MESSAGES.channelMismatch);
  }
  if (
    scheduler.discord?.guildId &&
    scheduler.discord.guildId !== interaction.guildId
  ) {
    return respondWithError(interaction, ERROR_MESSAGES.guildMismatch);
  }

  const linkedUser = await getLinkedUser(discordUserId);
  if (!linkedUser) {
    return respondWithError(
      interaction,
      buildUserNotLinkedMessage(APP_URL)
    );
  }
  const userEmail = linkedUser.email || null;

  const participation = await getParticipationDecision(scheduler, linkedUser);
  if (!participation.allowed) {
    return respondWithError(
      interaction,
      participation.message || ERROR_MESSAGES.notParticipant
    );
  }

  const slotsSnap = await schedulerRef.collection("slots").get();
  const slotIds = new Set(slotsSnap.docs.map((doc) => doc.id));

  const preferredSelections = session.preferredSlotIds || [];
  const feasibleSelections = session.feasibleSlotIds || [];
  const invalidPreferred = preferredSelections.filter((id) => !slotIds.has(id));
  const invalidFeasible = feasibleSelections.filter((id) => !slotIds.has(id));
  if (invalidPreferred.length > 0 || invalidFeasible.length > 0) {
    return respondWithError(interaction, ERROR_MESSAGES.staleSlots);
  }

  const preferredIds = preferredSelections.filter((id) => slotIds.has(id));
  const feasibleIds = feasibleSelections.filter((id) => slotIds.has(id));

  if (preferredIds.length === 0 && feasibleIds.length === 0) {
    return respondWithError(interaction, ERROR_MESSAGES.selectAtLeastOne);
  }

  const votes = {};
  const feasibleSet = new Set(feasibleIds);
  preferredIds.forEach((slotId) => feasibleSet.add(slotId));
  feasibleSet.forEach((slotId) => {
    votes[slotId] = "FEASIBLE";
  });
  preferredIds.forEach((slotId) => {
    votes[slotId] = "PREFERRED";
  });

  await schedulerRef
    .collection("votes")
    .doc(linkedUser.uid)
    .set(
      {
        userEmail,
        userAvatar: linkedUser.photoURL || null,
        votes,
        noTimesWork: false,
        source: "discord",
        lastVotedFrom: "discord",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  await sessionRef.delete().catch(() => null);

  return respondWithMessage(interaction, { content: "Votes saved!", components: [] });
}

async function getBasicPollContext(interaction, pollId) {
  const context = await loadGroupBasicPollById(pollId, interaction);
  if (!context) {
    await respondWithError(
      interaction,
      ERROR_MESSAGES.basicPollNotFound || ERROR_MESSAGES.pollNotFound
    );
    return null;
  }

  const channelCheck = validateBasicPollDiscordChannel(
    interaction,
    context.pollData,
    context.groupData
  );
  if (!channelCheck.ok) {
    await respondWithError(interaction, channelCheck.message);
    return null;
  }

  if (!isBasicPollWritable(context.pollData)) {
    await respondWithClosedPoll(
      interaction,
      ERROR_MESSAGES.basicPollClosed || ERROR_MESSAGES.pollFinalized
    );
    return null;
  }

  const options = resolveBasicPollOptions(context.pollData);
  if (options.length === 0) {
    await respondWithError(interaction, ERROR_MESSAGES.noOptions || ERROR_MESSAGES.pollNotFound);
    return null;
  }

  return {
    ...context,
    options,
    optionMap: getBasicPollOptionMap(context.pollData),
    voteType: resolveBasicPollVoteType(context.pollData),
  };
}

async function getBasicPollLinkedUser(interaction) {
  const discordUserId = getDiscordUserId(interaction);
  if (!discordUserId) {
    await respondWithError(interaction, ERROR_MESSAGES.missingDiscordUser);
    return null;
  }
  const linkedUser = await getLinkedUser(discordUserId);
  if (!linkedUser) {
    await respondWithError(interaction, buildUserNotLinkedMessage(APP_URL));
    return null;
  }
  return { discordUserId, linkedUser };
}

async function handleBasicPollVoteButton(interaction, pollId) {
  const linked = await getBasicPollLinkedUser(interaction);
  if (!linked) return;

  const context = await getBasicPollContext(interaction, pollId);
  if (!context) return;

  if (!ensureGroupMemberForBasicPoll(context.groupData, linked.linkedUser)) {
    return respondWithError(interaction, ERROR_MESSAGES.notGroupMember);
  }

  const sessionRef = db
    .collection("discordVoteSessions")
    .doc(buildBasicPollSessionId(pollId, linked.discordUserId));
  const existingVoteSnap = await context.pollRef.collection("votes").doc(linked.linkedUser.uid).get();
  const existingVote = existingVoteSnap.exists ? existingVoteSnap.data() || {} : {};

  const baseSession = {
    pollId,
    parentType: "group",
    parentId: context.groupId,
    qsUserId: linked.linkedUser.uid,
    voteType: context.voteType,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + VOTE_SESSION_TTL_MINUTES * 60 * 1000)
    ),
  };

  if (context.voteType === "RANKED_CHOICE") {
    const validOptionIds = new Set(context.options.map((option) => option.id));
    const rankings = normalizeSelectionIds(existingVote.rankings || []).filter((id) =>
      validOptionIds.has(id)
    );
    await sessionRef.set(
      {
        ...baseSession,
        rankings,
        rankPageIndex: 0,
      },
      { merge: true }
    );

    const remaining = context.options.filter((option) => !rankings.includes(option.id));
    const rankUi = buildBasicPollRankComponents({
      pollId,
      pollData: context.pollData,
      rankings,
      remainingOptions: remaining,
      pageIndex: 0,
    });
    return respondWithMessage(interaction, {
      content: rankUi.content,
      components: rankUi.components,
    });
  }

  const validOptionIds = new Set(context.options.map((option) => option.id));
  const selectedOptionIds = normalizeSelectionIds(existingVote.optionIds || []).filter((id) =>
    validOptionIds.has(id)
  );

  await sessionRef.set(
    {
      ...baseSession,
      selectedOptionIds,
    },
    { merge: true }
  );

  return respondWithMessage(interaction, {
    content: buildBasicPollMcContent({
      pollData: context.pollData,
      selectedIds: selectedOptionIds,
      optionMap: context.optionMap,
    }),
    components: buildBasicPollMcComponents({
      pollId,
      pollData: context.pollData,
      optionRows: context.options,
      selectedIds: selectedOptionIds,
    }),
  });
}

async function loadBasicPollSession(interaction, pollId) {
  const linked = await getBasicPollLinkedUser(interaction);
  if (!linked) return null;

  const sessionRef = db
    .collection("discordVoteSessions")
    .doc(buildBasicPollSessionId(pollId, linked.discordUserId));
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    await respondWithError(interaction, ERROR_MESSAGES.sessionExpired);
    return null;
  }

  const sessionData = sessionSnap.data() || {};
  if (
    sessionData?.qsUserId &&
    String(sessionData.qsUserId) !== String(linked.linkedUser.uid)
  ) {
    await respondWithError(interaction, ERROR_MESSAGES.sessionExpired);
    return null;
  }

  const context = await getBasicPollContext(interaction, pollId);
  if (!context) {
    await sessionRef.delete().catch(() => null);
    return null;
  }

  if (!ensureGroupMemberForBasicPoll(context.groupData, linked.linkedUser)) {
    await respondWithError(interaction, ERROR_MESSAGES.notGroupMember);
    return null;
  }

  return {
    linked,
    sessionRef,
    sessionData,
    context,
  };
}

async function handleBasicPollMcSelect(interaction, pollId) {
  const loaded = await loadBasicPollSession(interaction, pollId);
  if (!loaded) return;
  if (loaded.context.voteType !== "MULTIPLE_CHOICE") {
    return respondWithError(interaction, ERROR_MESSAGES.staleSlots);
  }

  const optionIdSet = new Set(loaded.context.options.map((option) => option.id));
  const maxSelections = Math.max(
    1,
    getMcMaxSelections(loaded.context.pollData, loaded.context.options.length)
  );
  const values = normalizeSelectionIds(interaction?.data?.values || [])
    .filter((id) => optionIdSet.has(id))
    .slice(0, maxSelections);

  await loaded.sessionRef.set(
    {
      selectedOptionIds: values,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + VOTE_SESSION_TTL_MINUTES * 60 * 1000)
      ),
    },
    { merge: true }
  );

  return respondWithMessage(interaction, {
    content: buildBasicPollMcContent({
      pollData: loaded.context.pollData,
      selectedIds: values,
      optionMap: loaded.context.optionMap,
    }),
    components: buildBasicPollMcComponents({
      pollId,
      pollData: loaded.context.pollData,
      optionRows: loaded.context.options,
      selectedIds: values,
    }),
  });
}

async function handleBasicPollSubmit(interaction, pollId) {
  const loaded = await loadBasicPollSession(interaction, pollId);
  if (!loaded) return;
  if (loaded.context.voteType !== "MULTIPLE_CHOICE") {
    return respondWithError(interaction, ERROR_MESSAGES.staleSlots);
  }

  const optionIdSet = new Set(loaded.context.options.map((option) => option.id));
  const maxSelections = Math.max(
    1,
    getMcMaxSelections(loaded.context.pollData, loaded.context.options.length)
  );
  const selectedOptionIds = normalizeSelectionIds(
    loaded.sessionData.selectedOptionIds || []
  )
    .filter((id) => optionIdSet.has(id))
    .slice(0, maxSelections);

  if (selectedOptionIds.length === 0) {
    return respondWithError(interaction, ERROR_MESSAGES.selectAtLeastOne);
  }

  await loaded.context.pollRef
    .collection("votes")
    .doc(loaded.linked.linkedUser.uid)
    .set(
      {
        optionIds: selectedOptionIds,
        source: "discord",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  await loaded.sessionRef.delete().catch(() => null);

  return respondWithMessage(interaction, {
    content: "Vote saved!",
    components: [],
  });
}

async function handleBasicPollClear(interaction, pollId) {
  const linked = await getBasicPollLinkedUser(interaction);
  if (!linked) return;
  const context = await getBasicPollContext(interaction, pollId);
  if (!context) return;
  if (!ensureGroupMemberForBasicPoll(context.groupData, linked.linkedUser)) {
    return respondWithError(interaction, ERROR_MESSAGES.notGroupMember);
  }

  await context.pollRef.collection("votes").doc(linked.linkedUser.uid).delete().catch(() => null);
  const sessionRef = db
    .collection("discordVoteSessions")
    .doc(buildBasicPollSessionId(pollId, linked.discordUserId));
  await sessionRef.delete().catch(() => null);

  return respondWithMessage(interaction, {
    content: "Vote cleared.",
    components: [],
  });
}

async function handleBasicPollFinalize(interaction, pollId) {
  const linked = await getBasicPollLinkedUser(interaction);
  if (!linked) return;

  const context = await loadGroupBasicPollById(pollId, interaction);
  if (!context) {
    return respondWithError(
      interaction,
      ERROR_MESSAGES.basicPollNotFound || ERROR_MESSAGES.pollNotFound
    );
  }

  const channelCheck = validateBasicPollDiscordChannel(
    interaction,
    context.pollData,
    context.groupData
  );
  if (!channelCheck.ok) {
    return respondWithError(interaction, channelCheck.message);
  }

  if (!isGroupManagerForDiscord(context.groupData, linked.linkedUser.uid)) {
    return respondWithError(interaction, ERROR_MESSAGES.notGroupManager);
  }

  const status = String(context.pollData?.status || "OPEN").toUpperCase();
  if (status === "FINALIZED") {
    return respondWithError(interaction, ERROR_MESSAGES.pollAlreadyFinalized);
  }
  if (status !== "OPEN") {
    return respondWithClosedPoll(
      interaction,
      ERROR_MESSAGES.basicPollClosed || ERROR_MESSAGES.pollFinalized
    );
  }

  const options = resolveBasicPollOptions(context.pollData);
  if (options.length === 0) {
    return respondWithError(interaction, ERROR_MESSAGES.noOptions || ERROR_MESSAGES.pollNotFound);
  }

  const votesSnap = await context.pollRef.collection("votes").get();
  const voteDocs = votesSnap.docs.map((voteDoc) => ({
    id: voteDoc.id,
    ...(voteDoc.data() || {}),
  }));
  const finalResults = buildBasicPollFinalResults(context.pollData, voteDocs);
  if (
    finalResults.voteType === "RANKED_CHOICE" &&
    Array.isArray(finalResults.tiedIds) &&
    finalResults.tiedIds.length > 0 &&
    (!Array.isArray(finalResults.winnerIds) || finalResults.winnerIds.length === 0)
  ) {
    return respondWithError(interaction, ERROR_MESSAGES.pollTieBreakWeb);
  }

  const finalizedByUserId = linked.linkedUser.uid;
  await context.pollRef.set(
    {
      status: "FINALIZED",
      finalResults,
      finalizedByUserId,
      finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const finalizedPollData = {
    ...context.pollData,
    status: "FINALIZED",
    finalResults,
    finalizedByUserId,
  };
  const voteCount = voteDocs.filter((voteDoc) =>
    hasSubmittedBasicPollVote(finalizedPollData, voteDoc)
  ).length;
  const totalParticipants = resolveGroupNotificationRecipients(context.groupData).length;
  const discordChannelId =
    context.pollData?.discord?.channelId ||
    context.groupData?.discord?.channelId ||
    interaction.channelId;
  const discordMessageId = context.pollData?.discord?.messageId || null;

  if (discordChannelId && discordMessageId) {
    try {
      await editChannelMessage({
        channelId: discordChannelId,
        messageId: discordMessageId,
        body: buildBasicPollCard({
          groupId: context.groupId,
          pollId,
          poll: finalizedPollData,
          voteCount,
          totalParticipants,
        }),
      });
    } catch (error) {
      logger.warn("Failed to update finalized basic poll card from Discord worker", {
        groupId: context.groupId,
        pollId,
        messageId: discordMessageId,
        error: error?.message,
      });
    }
  }

  if (discordChannelId) {
    const resultsContent = buildBasicPollResultsAnnouncement({
      groupId: context.groupId,
      pollId,
      pollData: finalizedPollData,
      finalResults,
      finalizedBy: linked.linkedUser,
    });
    try {
      await createChannelMessage({
        channelId: discordChannelId,
        body: {
          content: resultsContent,
          allowed_mentions: { parse: [] },
        },
      });
    } catch (error) {
      logger.warn("Failed to post basic poll final results message from Discord worker", {
        groupId: context.groupId,
        pollId,
        error: error?.message,
      });
    }
  }

  const recipients = resolveGroupNotificationRecipients(context.groupData);
  const actor = buildPollCreatedNotificationActor(linked.linkedUser);
  const basePayload = {
    parentType: "group",
    parentId: context.groupId,
    basicPollId: pollId,
    basicPollTitle: finalizedPollData?.title || "Basic poll",
  };

  try {
    await queueNotificationEvent({
      db,
      eventType: "BASIC_POLL_FINALIZED",
      resource: {
        type: "basicPoll",
        id: pollId,
        title: finalizedPollData?.title || "Basic poll",
      },
      actor,
      payload: basePayload,
      recipients: {
        userIds: recipients,
      },
      source: "discord",
      createdBy: finalizedByUserId || "system",
    });
  } catch (error) {
    logger.error("Failed to queue BASIC_POLL_FINALIZED from Discord finalize flow", {
      groupId: context.groupId,
      pollId,
      error: error?.message,
    });
  }

  try {
    await queueNotificationEvent({
      db,
      eventType: "BASIC_POLL_RESULTS",
      resource: {
        type: "basicPoll",
        id: pollId,
        title: finalizedPollData?.title || "Basic poll",
      },
      actor,
      payload: {
        ...basePayload,
        resultsSummary: summarizeBasicPollResults(finalizedPollData, finalResults),
      },
      recipients: {
        userIds: recipients,
      },
      source: "discord",
      createdBy: finalizedByUserId || "system",
    });
  } catch (error) {
    logger.error("Failed to queue BASIC_POLL_RESULTS from Discord finalize flow", {
      groupId: context.groupId,
      pollId,
      error: error?.message,
    });
  }

  return respondWithMessage(interaction, {
    content: "Poll finalized and results posted.",
    components: [],
  });
}

function getRankedOptionsFromSession(context, sessionData) {
  const optionIdSet = new Set(context.options.map((option) => option.id));
  const rankings = normalizeSelectionIds(sessionData.rankings || []).filter((id) =>
    optionIdSet.has(id)
  );
  const remaining = context.options.filter((option) => !rankings.includes(option.id));
  return { rankings, remaining };
}

async function writeRankSession(loaded, updates = {}) {
  await loaded.sessionRef.set(
    {
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + VOTE_SESSION_TTL_MINUTES * 60 * 1000)
      ),
    },
    { merge: true }
  );
}

async function respondWithRankSession(interaction, pollId, loaded, rankings, remaining, pageIndex) {
  const rankUi = buildBasicPollRankComponents({
    pollId,
    pollData: loaded.context.pollData,
    rankings,
    remainingOptions: remaining,
    pageIndex,
  });
  return respondWithMessage(interaction, {
    content: rankUi.content,
    components: rankUi.components,
  });
}

async function handleBasicPollRankSelect(interaction, pollId) {
  const loaded = await loadBasicPollSession(interaction, pollId);
  if (!loaded) return;
  if (loaded.context.voteType !== "RANKED_CHOICE") {
    return respondWithError(interaction, ERROR_MESSAGES.staleSlots);
  }

  const { rankings, remaining } = getRankedOptionsFromSession(loaded.context, loaded.sessionData);
  const selectedId = normalizeSelectionIds(interaction?.data?.values || [])[0];
  if (!selectedId || !remaining.some((option) => option.id === selectedId)) {
    return respondWithError(interaction, ERROR_MESSAGES.staleSlots);
  }

  const nextRankings = [...rankings, selectedId];
  const nextRemaining = loaded.context.options.filter((option) => !nextRankings.includes(option.id));
  await writeRankSession(loaded, { rankings: nextRankings, rankPageIndex: 0 });
  return respondWithRankSession(interaction, pollId, loaded, nextRankings, nextRemaining, 0);
}

async function handleBasicPollRankPage(interaction, pollId, direction) {
  const loaded = await loadBasicPollSession(interaction, pollId);
  if (!loaded) return;
  if (loaded.context.voteType !== "RANKED_CHOICE") {
    return respondWithError(interaction, ERROR_MESSAGES.staleSlots);
  }

  const { rankings, remaining } = getRankedOptionsFromSession(loaded.context, loaded.sessionData);
  const page = getBasicPollOptionPage(remaining, loaded.sessionData.rankPageIndex || 0);
  const nextPageIndex =
    direction === "next" ? page.pageIndex + 1 : page.pageIndex - 1;
  const clamped = clampPageIndex(nextPageIndex, page.pageCount);
  await writeRankSession(loaded, { rankings, rankPageIndex: clamped });
  return respondWithRankSession(
    interaction,
    pollId,
    loaded,
    rankings,
    remaining,
    clamped
  );
}

async function handleBasicPollRankUndo(interaction, pollId) {
  const loaded = await loadBasicPollSession(interaction, pollId);
  if (!loaded) return;
  if (loaded.context.voteType !== "RANKED_CHOICE") {
    return respondWithError(interaction, ERROR_MESSAGES.staleSlots);
  }

  const { rankings } = getRankedOptionsFromSession(loaded.context, loaded.sessionData);
  const nextRankings = rankings.slice(0, Math.max(0, rankings.length - 1));
  const nextRemaining = loaded.context.options.filter((option) => !nextRankings.includes(option.id));
  await writeRankSession(loaded, { rankings: nextRankings, rankPageIndex: 0 });
  return respondWithRankSession(interaction, pollId, loaded, nextRankings, nextRemaining, 0);
}

async function handleBasicPollRankReset(interaction, pollId) {
  const loaded = await loadBasicPollSession(interaction, pollId);
  if (!loaded) return;
  if (loaded.context.voteType !== "RANKED_CHOICE") {
    return respondWithError(interaction, ERROR_MESSAGES.staleSlots);
  }

  const nextRankings = [];
  const nextRemaining = loaded.context.options;
  await writeRankSession(loaded, { rankings: nextRankings, rankPageIndex: 0 });
  return respondWithRankSession(interaction, pollId, loaded, nextRankings, nextRemaining, 0);
}

async function handleBasicPollRankSubmit(interaction, pollId) {
  const loaded = await loadBasicPollSession(interaction, pollId);
  if (!loaded) return;
  if (loaded.context.voteType !== "RANKED_CHOICE") {
    return respondWithError(interaction, ERROR_MESSAGES.staleSlots);
  }

  const { rankings } = getRankedOptionsFromSession(loaded.context, loaded.sessionData);
  if (rankings.length === 0) {
    return respondWithError(interaction, ERROR_MESSAGES.selectAtLeastOne);
  }

  await loaded.context.pollRef
    .collection("votes")
    .doc(loaded.linked.linkedUser.uid)
    .set(
      {
        rankings,
        source: "discord",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  await loaded.sessionRef.delete().catch(() => null);

  return respondWithMessage(interaction, {
    content: "Ranking saved!",
    components: [],
  });
}

exports.processDiscordInteraction = onTaskDispatched(
  {
    region: DISCORD_REGION,
    secrets: [DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN],
  },
  async (request) => {
    const interaction = request.data;
    if (!interaction || !interaction.id) {
      logger.error("Missing interaction payload");
      return;
    }

    const startedAt = Date.now();
    const interactionMeta = {
      interactionId: interaction.id,
      type: interaction.type,
      command: interaction.data?.name || null,
      customId: interaction.data?.custom_id || null,
      userId: getDiscordUserId(interaction),
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    };

    const interactionAppId = interaction.applicationId || interaction.application_id || null;
    const expectedAppId = DISCORD_APPLICATION_ID?.value?.() || null;
    const isTestEnv = process.env.NODE_ENV === "test";
    if (!isTestEnv && expectedAppId && interactionAppId !== expectedAppId) {
      logger.warn("Discarding interaction with mismatched application ID", {
        interactionId: interaction.id,
      });
      return;
    }

    const lockAcquired = await acquireInteractionLock(interaction.id);
    if (!lockAcquired) {
      logger.info("Skipping duplicate interaction", { interactionId: interaction.id });
      return;
    }

    try {
      let handled = false;
      if (interaction.type === InteractionType.ApplicationCommand) {
        if (interaction.data?.name === "link-group") {
          await handleLinkGroup(interaction);
          handled = true;
        } else if (interaction.data?.name === "unlink-group") {
          await handleUnlinkGroup(interaction);
          handled = true;
        } else if (interaction.data?.name === "poll-create") {
          await handlePollCreate(interaction);
          handled = true;
        }
      }

      if (interaction.type === InteractionType.MessageComponent) {
        const customId = interaction.data?.custom_id || "";
        if (customId.startsWith("vote_btn:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleVoteButton(interaction, schedulerId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("submit_vote:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleSubmitVote(interaction, schedulerId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("page_prev:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleVotePage(interaction, schedulerId, "prev");
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("page_next:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleVotePage(interaction, schedulerId, "next");
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("clear_votes:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleClearVotes(interaction, schedulerId, false);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("none_work:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleClearVotes(interaction, schedulerId, true);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("vote_pref:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleVoteSelect(interaction, schedulerId, "preferred");
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("vote_feasible:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleVoteSelect(interaction, schedulerId, "feasible");
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_vote:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollVoteButton(interaction, pollId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_mc_select:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollMcSelect(interaction, pollId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_submit:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollSubmit(interaction, pollId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_clear:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollClear(interaction, pollId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_finalize:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollFinalize(interaction, pollId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_rank_select:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollRankSelect(interaction, pollId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_rank_prev:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollRankPage(interaction, pollId, "prev");
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_rank_next:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollRankPage(interaction, pollId, "next");
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_rank_undo:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollRankUndo(interaction, pollId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_rank_reset:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollRankReset(interaction, pollId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        } else if (customId.startsWith("bp_rank_submit:")) {
          const pollId = customId.split(":")[1];
          if (pollId) {
            await handleBasicPollRankSubmit(interaction, pollId);
          } else {
            await respondWithError(interaction, ERROR_MESSAGES.missingPollId);
          }
          handled = true;
        }
      }

      if (!handled) {
        const fallbackMessage =
          interaction.type === InteractionType.ApplicationCommand
            ? "Command not supported yet."
            : "Action not supported.";
        await respondWithMessage(interaction, { content: fallbackMessage });
      }

      await markInteractionDone(interaction.id);
      const durationMs = Date.now() - startedAt;
      const latencyMs = interaction.receivedAt ? Date.now() - interaction.receivedAt : null;
      logger.info("Discord interaction handled", {
        ...interactionMeta,
        handled,
        durationMs,
        latencyMs,
      });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const latencyMs = interaction.receivedAt ? Date.now() - interaction.receivedAt : null;
      logger.error("Discord worker error", {
        interactionId: interaction.id,
        error: err?.message,
        durationMs,
        latencyMs,
      });
      await respondWithError(interaction, ERROR_MESSAGES.genericError);
      await releaseInteractionLock(interaction.id);
    }
  }
);

exports.__test__ = {
  parseSnowflakeTimestamp,
  isTokenExpired,
  getDiscordUserId,
  hasLinkPermissions,
  clampPageIndex,
  getVotePage,
  formatVoteContent,
  buildSessionId,
  buildBasicPollSessionId,
  formatSlotLabel,
  buildVoteComponents,
  resolveBasicPollVoteType,
  resolveBasicPollOptions,
  getBasicPollOptionMap,
  isBasicPollWritable,
  getMcMaxSelections,
  buildBasicPollMcComponents,
  buildBasicPollMcContent,
  getBasicPollOptionPage,
  buildBasicPollRankComponents,
  loadGroupBasicPollById,
  ensureGroupMemberForBasicPoll,
  validateBasicPollDiscordChannel,
  getCommandOptionValue,
  isGroupManagerForDiscord,
  parsePollCreateOptionLabels,
  parsePollCreateDeadline,
  getLinkedGroupForChannel,
  buildBasicPollEditUrl,
  resolveGroupNotificationRecipients,
  buildPollCreateOptions,
  buildPollCreateSuccessResponse,
  handlePollCreate,
  normalizeEmail,
  acquireInteractionLock,
  markInteractionDone,
  releaseInteractionLock,
  respondWithMessage,
  respondWithError,
  respondWithClosedPoll,
  getLinkedUser,
  getParticipationDecision,
  handleLinkGroup,
  handleUnlinkGroup,
  handleVoteButton,
  handleVoteSelect,
  handleVotePage,
  handleClearVotes,
  handleSubmitVote,
  handleBasicPollVoteButton,
  handleBasicPollMcSelect,
  handleBasicPollSubmit,
  handleBasicPollClear,
  handleBasicPollFinalize,
  handleBasicPollRankSelect,
  handleBasicPollRankPage,
  handleBasicPollRankUndo,
  handleBasicPollRankReset,
  handleBasicPollRankSubmit,
};
