const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { InteractionType, ComponentType } = require("discord-api-types/v10");
const {
  DISCORD_APPLICATION_ID,
  DISCORD_BOT_TOKEN,
  DISCORD_REGION,
  APP_URL,
} = require("./config");
const { hashLinkCode } = require("./link-utils");
const {
  editOriginalInteractionResponse,
  fetchChannel,
} = require("./discord-client");

if (!admin.apps.length) {
  admin.initializeApp();
}

const DISCORD_EPOCH = 1420070400000n;
const INTERACTION_TTL_MINUTES = 60;
const VOTE_SESSION_TTL_MINUTES = 15;
const MAX_SELECT_OPTIONS = 25;
const PERMISSION_ADMIN = 0x8n;
const PERMISSION_MANAGE_CHANNELS = 0x10n;

const db = admin.firestore();

function parseSnowflakeTimestamp(id) {
  try {
    return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
  } catch (err) {
    return null;
  }
}

function isTokenExpired(interactionId) {
  const timestamp = parseSnowflakeTimestamp(interactionId);
  if (!timestamp) return false;
  return Date.now() - timestamp > 15 * 60 * 1000;
}

function getDiscordUserId(interaction) {
  return interaction?.member?.user?.id || interaction?.user?.id || null;
}

function hasLinkPermissions(memberPermissions) {
  if (!memberPermissions) return false;
  try {
    const perms = BigInt(memberPermissions);
    return (perms & PERMISSION_ADMIN) === PERMISSION_ADMIN ||
      (perms & PERMISSION_MANAGE_CHANNELS) === PERMISSION_MANAGE_CHANNELS;
  } catch (err) {
    return false;
  }
}

function clampPageIndex(pageIndex, pageCount) {
  if (pageCount <= 0) return 0;
  if (pageIndex < 0) return 0;
  if (pageIndex >= pageCount) return pageCount - 1;
  return pageIndex;
}

function getVotePage(slots, pageIndex) {
  const pageCount = Math.max(1, Math.ceil(slots.length / MAX_SELECT_OPTIONS));
  const safeIndex = clampPageIndex(pageIndex || 0, pageCount);
  const start = safeIndex * MAX_SELECT_OPTIONS;
  const pageSlots = slots.slice(start, start + MAX_SELECT_OPTIONS);
  return { pageIndex: safeIndex, pageCount, pageSlots };
}

function formatVoteContent(base, pageIndex, pageCount) {
  if (pageCount > 1) {
    return `${base} (Page ${pageIndex + 1} of ${pageCount})`;
  }
  return base;
}

function buildSessionId(schedulerId, discordUserId) {
  return `${schedulerId}:${discordUserId}`;
}

function formatSlotLabel(startIso, endIso, timezone) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const timeOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  if (timezone) {
    dateOptions.timeZone = timezone;
    timeOptions.timeZone = timezone;
  }
  const datePart = start.toLocaleDateString("en-US", dateOptions);
  const timePart = `${start.toLocaleTimeString("en-US", timeOptions)} - ${end.toLocaleTimeString("en-US", timeOptions)}`;
  return `${datePart} ${timePart}`;
}

function buildVoteComponents({
  schedulerId,
  slots,
  preferredIds,
  feasibleIds,
  timezone,
  pageIndex,
  pageCount,
}) {
  const options = slots.map((slot) => ({
    label: formatSlotLabel(slot.start, slot.end, timezone),
    value: slot.id,
  }));

  const preferredSet = new Set(preferredIds || []);
  const feasibleSet = new Set(feasibleIds || []);

  const preferredOptions = options.map((option) => ({
    ...option,
    default: preferredSet.has(option.value),
  }));

  const feasibleOptions = options.map((option) => ({
    ...option,
    default: feasibleSet.has(option.value),
  }));

  const showPagination = pageCount > 1;
  const actionButtons = [];
  if (showPagination) {
    actionButtons.push(
      {
        type: ComponentType.Button,
        custom_id: `page_prev:${schedulerId}`,
        style: 2,
        label: "Previous",
        disabled: pageIndex <= 0,
      },
      {
        type: ComponentType.Button,
        custom_id: `page_next:${schedulerId}`,
        style: 2,
        label: "Next",
        disabled: pageIndex >= pageCount - 1,
      }
    );
  }
  actionButtons.push(
    {
      type: ComponentType.Button,
      custom_id: `submit_vote:${schedulerId}`,
      style: 1,
      label: "Submit",
    },
    {
      type: ComponentType.Button,
      custom_id: `clear_votes:${schedulerId}`,
      style: 2,
      label: "Clear my votes",
    },
    {
      type: ComponentType.Button,
      custom_id: `none_work:${schedulerId}`,
      style: 4,
      label: "None work for me",
    }
  );

  return [
    {
      type: 1,
      components: [
        {
          type: ComponentType.Button,
          custom_id: `label_pref:${schedulerId}`,
          style: 2,
          label: "Preferred times",
          disabled: true,
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: `vote_pref:${schedulerId}`,
          placeholder: "Select preferred times",
          min_values: 0,
          max_values: options.length,
          options: preferredOptions,
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: ComponentType.Button,
          custom_id: `label_feasible:${schedulerId}`,
          style: 2,
          label: "Feasible times",
          disabled: true,
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: `vote_feasible:${schedulerId}`,
          placeholder: "Select feasible times",
          min_values: 0,
          max_values: options.length,
          options: feasibleOptions,
        },
      ],
    },
    {
      type: 1,
      components: actionButtons,
    },
  ];
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

async function ensureParticipant(scheduler, userEmail) {
  const normalizedEmail = String(userEmail || "").toLowerCase();
  const participants = scheduler.participants || [];
  if (participants.includes(normalizedEmail)) {
    return true;
  }
  if (!scheduler.questingGroupId) {
    return false;
  }
  const groupSnap = await db.collection("questingGroups").doc(scheduler.questingGroupId).get();
  if (!groupSnap.exists) {
    return false;
  }
  const members = groupSnap.data()?.members || [];
  return members.map((email) => String(email).toLowerCase()).includes(normalizedEmail);
}

async function handleLinkGroup(interaction) {
  const options = interaction?.data?.options || [];
  const codeOption = options.find((option) => option.name === "code");
  const rawCode = String(codeOption?.value || "").trim();
  if (!rawCode) {
    return respondWithError(interaction, "Missing link code. Paste the code from Quest Scheduler.");
  }

  if (!interaction.guildId || !interaction.channelId) {
    return respondWithError(interaction, "This command must be run in a server channel.");
  }

  if (!hasLinkPermissions(interaction.member?.permissions)) {
    return respondWithError(interaction, "You need Manage Channels or Administrator permissions to link.");
  }

  const codeHash = hashLinkCode(rawCode);
  const codeRef = db.collection("discordLinkCodes").doc(codeHash);
  const codeSnap = await codeRef.get();
  if (!codeSnap.exists) {
    return respondWithError(interaction, "Invalid or expired link code.");
  }
  const codeData = codeSnap.data() || {};
  const expiresAt = codeData.expiresAt?.toDate?.();
  if (codeData.type !== "group-link" || !codeData.groupId || !codeData.uid) {
    await codeRef.delete();
    return respondWithError(interaction, "Invalid link code.");
  }
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    await codeRef.delete();
    return respondWithError(interaction, "Link code expired. Generate a new one in Quest Scheduler.");
  }

  const channelInfo = await fetchChannel({ channelId: interaction.channelId }).catch(() => null);

  await db.collection("questingGroups").doc(codeData.groupId).set(
    {
      discord: {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        channelName: channelInfo?.name || null,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
        linkedByUserId: codeData.uid,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await codeRef.delete();

  return respondWithMessage(interaction, {
    content: "Discord channel linked! Polls for this group will now post here.",
  });
}

async function handleVoteButton(interaction, schedulerId) {
  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    return respondWithError(interaction, "Poll not found.");
  }
  const scheduler = schedulerSnap.data();
  if (scheduler.status !== "OPEN") {
    return respondWithError(interaction, "Voting is closed for this poll.");
  }
  if (
    scheduler.discord?.channelId &&
    scheduler.discord.channelId !== interaction.channelId
  ) {
    return respondWithError(interaction, "This poll is linked to a different channel.");
  }
  if (
    scheduler.discord?.guildId &&
    scheduler.discord.guildId !== interaction.guildId
  ) {
    return respondWithError(interaction, "This poll is linked to a different server.");
  }

  const discordUserId = getDiscordUserId(interaction);
  if (!discordUserId) {
    return respondWithError(interaction, "Unable to identify your Discord account.");
  }
  const linkedUser = await getLinkedUser(discordUserId);
  if (!linkedUser) {
    return respondWithError(
      interaction,
      `Link your Discord account in Quest Scheduler: ${APP_URL}/settings?discord=link`
    );
  }

  const userEmail = String(linkedUser.email || "").toLowerCase();
  const isParticipant = await ensureParticipant(scheduler, userEmail);
  if (!isParticipant) {
    return respondWithError(
      interaction,
      "You're not a participant for this poll. Ask the organizer to invite you."
    );
  }

  const slotsSnap = await schedulerRef.collection("slots").get();
  const slots = slotsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((slot) => slot.start && slot.end)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  if (slots.length === 0) {
    return respondWithError(interaction, "No available slots to vote on.");
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
    timezone: scheduler?.timezone || null,
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
    return respondWithError(interaction, "Unable to identify your Discord account.");
  }

  const sessionRef = db.collection("discordVoteSessions").doc(
    buildSessionId(schedulerId, discordUserId)
  );
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return respondWithError(interaction, "Voting session expired. Click Vote again.");
  }
  const sessionData = sessionSnap.data() || {};
  const values = interaction?.data?.values || [];

  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  const scheduler = schedulerSnap.exists ? schedulerSnap.data() : {};
  const slotsSnap = await schedulerRef.collection("slots").get();
  const slots = slotsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((slot) => slot.start && slot.end)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
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
    timezone: scheduler?.timezone || null,
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
    return respondWithError(interaction, "Unable to identify your Discord account.");
  }

  const sessionRef = db.collection("discordVoteSessions").doc(
    buildSessionId(schedulerId, discordUserId)
  );
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return respondWithError(interaction, "Voting session expired. Click Vote again.");
  }
  const sessionData = sessionSnap.data() || {};

  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  const scheduler = schedulerSnap.exists ? schedulerSnap.data() : {};
  const slotsSnap = await schedulerRef.collection("slots").get();
  const slots = slotsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((slot) => slot.start && slot.end)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  if (slots.length === 0) {
    return respondWithError(interaction, "No available slots to vote on.");
  }

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
    timezone: scheduler?.timezone || null,
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
    return respondWithError(interaction, "Poll not found.");
  }
  const scheduler = schedulerSnap.data();
  if (scheduler.status !== "OPEN") {
    return respondWithError(interaction, "Voting is closed for this poll.");
  }
  if (
    scheduler.discord?.channelId &&
    scheduler.discord.channelId !== interaction.channelId
  ) {
    return respondWithError(interaction, "This poll is linked to a different channel.");
  }
  if (
    scheduler.discord?.guildId &&
    scheduler.discord.guildId !== interaction.guildId
  ) {
    return respondWithError(interaction, "This poll is linked to a different server.");
  }

  const discordUserId = getDiscordUserId(interaction);
  if (!discordUserId) {
    return respondWithError(interaction, "Unable to identify your Discord account.");
  }
  const linkedUser = await getLinkedUser(discordUserId);
  if (!linkedUser) {
    return respondWithError(
      interaction,
      `Link your Discord account in Quest Scheduler: ${APP_URL}/settings?discord=link`
    );
  }

  const userEmail = String(linkedUser.email || "").toLowerCase();
  const isParticipant = await ensureParticipant(scheduler, userEmail);
  if (!isParticipant) {
    return respondWithError(
      interaction,
      "You're not a participant for this poll. Ask the organizer to invite you."
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
  await sessionRef.set(
    {
      schedulerId,
      discordUserId,
      qsUserId: linkedUser.uid,
      preferredSlotIds: [],
      feasibleSlotIds: [],
      pageIndex: 0,
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
  const pageInfo = getVotePage(slots, 0);

  const components = buildVoteComponents({
    schedulerId,
    slots: pageInfo.pageSlots,
    preferredIds: [],
    feasibleIds: [],
    timezone: scheduler?.timezone || null,
    pageIndex: pageInfo.pageIndex,
    pageCount: pageInfo.pageCount,
  });

  const message = noTimesWork
    ? "Marked as unavailable for this poll."
    : "Votes cleared. You can pick new times below.";

  return respondWithMessage(interaction, {
    content: formatVoteContent(message, pageInfo.pageIndex, pageInfo.pageCount),
    components,
  });
}

async function handleSubmitVote(interaction, schedulerId) {
  const discordUserId = getDiscordUserId(interaction);
  if (!discordUserId) {
    return respondWithError(interaction, "Unable to identify your Discord account.");
  }

  const sessionRef = db.collection("discordVoteSessions").doc(
    buildSessionId(schedulerId, discordUserId)
  );
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return respondWithError(interaction, "Voting session expired. Click Vote again.");
  }
  const session = sessionSnap.data() || {};

  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    return respondWithError(interaction, "Poll not found.");
  }
  const scheduler = schedulerSnap.data();
  if (scheduler.status !== "OPEN") {
    return respondWithError(interaction, "Voting is closed for this poll.");
  }
  if (
    scheduler.discord?.channelId &&
    scheduler.discord.channelId !== interaction.channelId
  ) {
    return respondWithError(interaction, "This poll is linked to a different channel.");
  }
  if (
    scheduler.discord?.guildId &&
    scheduler.discord.guildId !== interaction.guildId
  ) {
    return respondWithError(interaction, "This poll is linked to a different server.");
  }

  const linkedUser = await getLinkedUser(discordUserId);
  if (!linkedUser) {
    return respondWithError(
      interaction,
      `Link your Discord account in Quest Scheduler: ${APP_URL}/settings?discord=link`
    );
  }

  const userEmail = String(linkedUser.email || "").toLowerCase();
  const isParticipant = await ensureParticipant(scheduler, userEmail);
  if (!isParticipant) {
    return respondWithError(
      interaction,
      "You're not a participant for this poll. Ask the organizer to invite you."
    );
  }

  const slotsSnap = await schedulerRef.collection("slots").get();
  const slotIds = new Set(slotsSnap.docs.map((doc) => doc.id));

  const preferredSelections = session.preferredSlotIds || [];
  const feasibleSelections = session.feasibleSlotIds || [];
  const invalidPreferred = preferredSelections.filter((id) => !slotIds.has(id));
  const invalidFeasible = feasibleSelections.filter((id) => !slotIds.has(id));
  if (invalidPreferred.length > 0 || invalidFeasible.length > 0) {
    return respondWithError(interaction, "Poll was updated. Please tap Vote again.");
  }

  const preferredIds = preferredSelections.filter((id) => slotIds.has(id));
  const feasibleIds = feasibleSelections.filter((id) => slotIds.has(id));

  if (preferredIds.length === 0 && feasibleIds.length === 0) {
    return respondWithError(interaction, "Select at least one slot before submitting.");
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

    if (interaction.applicationId !== DISCORD_APPLICATION_ID.value()) {
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
        }
      }

      if (interaction.type === InteractionType.MessageComponent) {
        const customId = interaction.data?.custom_id || "";
        if (customId.startsWith("vote_btn:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleVoteButton(interaction, schedulerId);
          } else {
            await respondWithError(interaction, "Missing poll id.");
          }
          handled = true;
        } else if (customId.startsWith("submit_vote:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleSubmitVote(interaction, schedulerId);
          } else {
            await respondWithError(interaction, "Missing poll id.");
          }
          handled = true;
        } else if (customId.startsWith("page_prev:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleVotePage(interaction, schedulerId, "prev");
          } else {
            await respondWithError(interaction, "Missing poll id.");
          }
          handled = true;
        } else if (customId.startsWith("page_next:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleVotePage(interaction, schedulerId, "next");
          } else {
            await respondWithError(interaction, "Missing poll id.");
          }
          handled = true;
        } else if (customId.startsWith("clear_votes:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleClearVotes(interaction, schedulerId, false);
          } else {
            await respondWithError(interaction, "Missing poll id.");
          }
          handled = true;
        } else if (customId.startsWith("none_work:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleClearVotes(interaction, schedulerId, true);
          } else {
            await respondWithError(interaction, "Missing poll id.");
          }
          handled = true;
        } else if (customId.startsWith("vote_pref:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleVoteSelect(interaction, schedulerId, "preferred");
          } else {
            await respondWithError(interaction, "Missing poll id.");
          }
          handled = true;
        } else if (customId.startsWith("vote_feasible:")) {
          const schedulerId = customId.split(":")[1];
          if (schedulerId) {
            await handleVoteSelect(interaction, schedulerId, "feasible");
          } else {
            await respondWithError(interaction, "Missing poll id.");
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
    } catch (err) {
      logger.error("Discord worker error", {
        interactionId: interaction.id,
        error: err?.message,
      });
      await respondWithError(interaction, "Something went wrong. Please try again.");
      await releaseInteractionLock(interaction.id);
    }
  }
);
