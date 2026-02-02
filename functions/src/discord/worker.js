const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { InteractionType } = require("discord-api-types/v10");
const {
  DISCORD_APPLICATION_ID,
  DISCORD_BOT_TOKEN,
  DISCORD_REGION,
  APP_URL,
  DISCORD_NOTIFICATION_DEFAULTS,
} = require("./config");
const { normalizeEmail } = require("../utils/email");
const { hashLinkCode } = require("./link-utils");
const { ERROR_MESSAGES, buildUserNotLinkedMessage } = require("./error-messages");
const {
  editOriginalInteractionResponse,
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

async function respondWithClosedPoll(interaction) {
  return respondWithMessage(interaction, {
    content: ERROR_MESSAGES.pollFinalized,
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
  formatSlotLabel,
  buildVoteComponents,
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
};
