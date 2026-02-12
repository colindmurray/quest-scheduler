const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { normalizeEmail } = require("../utils/email");
const { queueNotificationEvent } = require("../notifications/write-event");
const { computeInstantRunoffResults } = require("./irv");
const { computeMultipleChoiceTallies } = require("./multiple-choice");
const { computeSchedulerRequiredEmbeddedPollSummary } = require("./required-summary");
const {
  BASIC_POLL_STATUSES,
  BASIC_POLL_VOTE_TYPES,
  resolveBasicPollVoteType,
} = require("./constants");
const {
  hasSubmittedVote,
} = require("./vote-submission");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const PARENT_COLLECTIONS = {
  group: "questingGroups",
  scheduler: "schedulers",
};

function resolveParentType(value) {
  if (value === "group" || value === "scheduler") return value;
  return null;
}

function resolveParentCollection(parentType) {
  return PARENT_COLLECTIONS[parentType] || null;
}

function buildFinalResultsSnapshot(pollData, votes) {
  const settings = pollData?.settings || {};
  const voteType = resolveBasicPollVoteType(settings.voteType);
  const allowWriteIn =
    voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && settings.allowWriteIn === true;
  const options = Array.isArray(pollData?.options) ? pollData.options : [];
  const submittedVotes = (votes || []).filter((voteDoc) =>
    hasSubmittedVote(voteType, allowWriteIn, voteDoc)
  );

  if (voteType === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE) {
    const results = computeInstantRunoffResults({
      optionIds: options.map((option) => option?.id).filter(Boolean),
      votes: submittedVotes,
    });
    const rounds = Array.isArray(results.rounds) ? results.rounds : [];
    const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
    return {
      voteType,
      rounds,
      winnerIds: Array.isArray(results.winnerIds) ? results.winnerIds : [],
      tiedIds: Array.isArray(results.tiedIds) ? results.tiedIds : [],
      voterCount: Number.isFinite(results.totalBallots)
        ? results.totalBallots
        : submittedVotes.length,
      exhaustedCount:
        Number.isFinite(lastRound?.exhausted) ? lastRound.exhausted : 0,
      capturedAt: FieldValue.serverTimestamp(),
    };
  }

  const tallies = computeMultipleChoiceTallies({
    options,
    votes: submittedVotes,
    allowWriteIn,
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
    voteType,
    rows,
    winnerIds,
    voterCount: Number.isFinite(tallies.totalVoters)
      ? tallies.totalVoters
      : submittedVotes.length,
    capturedAt: FieldValue.serverTimestamp(),
  };
}

function asStringSet(values = []) {
  const set = new Set();
  values.forEach((value) => {
    if (value === null || value === undefined) return;
    const normalized = String(value).trim();
    if (normalized) set.add(normalized);
  });
  return set;
}

function isGroupManager(groupData, uid) {
  if (!groupData || !uid) return false;
  if (String(groupData.creatorId || "") === uid) return true;
  if (groupData.memberPermissionsEnabled !== true) return false;
  return groupData.memberPermissions?.[uid]?.isManager === true;
}

async function resolveRecipientUserIds(parentType, parentData) {
  if (parentType === "group") {
    const ids = asStringSet(parentData?.memberIds || []);
    if (parentData?.creatorId) ids.add(String(parentData.creatorId));
    return Array.from(ids);
  }

  const ids = asStringSet(parentData?.participantIds || []);
  if (parentData?.creatorId) ids.add(String(parentData.creatorId));

  const questingGroupId = parentData?.questingGroupId;
  if (questingGroupId) {
    const groupSnap = await db.collection("questingGroups").doc(String(questingGroupId)).get();
    if (groupSnap.exists) {
      const groupData = groupSnap.data() || {};
      (groupData.memberIds || []).forEach((memberId) => ids.add(String(memberId)));
      if (groupData.creatorId) ids.add(String(groupData.creatorId));
    }
  }

  return Array.from(ids);
}

function buildActor(context) {
  const uid = context?.auth?.uid || null;
  const email = normalizeEmail(context?.auth?.token?.email || "");
  const displayName = context?.auth?.token?.name || email || "Someone";
  return {
    uid,
    email: email || null,
    displayName,
  };
}

function getParentAndPollRefs(parentType, parentId, pollId) {
  const parentCollection = resolveParentCollection(parentType);
  if (!parentCollection || !parentId || !pollId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "parentType, parentId, and pollId are required"
    );
  }

  const parentRef = db.collection(parentCollection).doc(String(parentId));
  const pollRef = parentRef.collection("basicPolls").doc(String(pollId));
  return { parentRef, pollRef };
}

async function loadParentAndPoll(parentType, parentId, pollId) {
  const { parentRef, pollRef } = getParentAndPollRefs(parentType, parentId, pollId);
  const [parentSnap, pollSnap] = await Promise.all([parentRef.get(), pollRef.get()]);

  if (!parentSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Parent resource not found");
  }

  if (!pollSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Basic poll not found");
  }

  return {
    parentRef,
    parentData: parentSnap.data() || {},
    pollRef,
    pollData: pollSnap.data() || {},
  };
}

function assertCanManagePoll(parentType, parentData, uid) {
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  if (parentType === "group") {
    if (!isGroupManager(parentData, uid)) {
      throw new functions.https.HttpsError("permission-denied", "Group manager required");
    }
    return;
  }

  if (String(parentData?.creatorId || "") !== uid) {
    throw new functions.https.HttpsError("permission-denied", "Scheduler creator required");
  }
}

function summarizeResults(pollData, finalResults) {
  if (!finalResults) return null;
  const optionById = Object.fromEntries(
    (pollData?.options || []).map((option) => [option?.id, option?.label || option?.id || "Option"])
  );

  if (finalResults.voteType === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE) {
    const winners = (finalResults.winnerIds || []).map((id) => optionById[id] || id);
    if (winners.length > 0) {
      return `Winner: ${winners.join(", ")}.`; 
    }
    const tied = (finalResults.tiedIds || []).map((id) => optionById[id] || id);
    if (tied.length > 0) {
      return `Tie: ${tied.join(", ")}.`;
    }
    return "No winner yet.";
  }

  const topRow = (finalResults.rows || []).reduce((best, row) => {
    if (!best) return row;
    if (row.count > best.count) return row;
    return best;
  }, null);

  if (!topRow) return "No votes yet.";
  return `Top choice: ${topRow.label} (${topRow.count} vote${topRow.count === 1 ? "" : "s"}).`;
}

function computeMissingVoterIds({ pollData, voteDocs, eligibleUserIds }) {
  const settings = pollData?.settings || {};
  const voteType = resolveBasicPollVoteType(settings.voteType);
  const allowWriteIn =
    voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && settings.allowWriteIn === true;

  const submittedVoterIds = new Set(
    (voteDocs || [])
      .filter((voteDoc) => hasSubmittedVote(voteType, allowWriteIn, voteDoc))
      .map((voteDoc) => String(voteDoc?.id || "").trim())
      .filter(Boolean)
  );

  return (eligibleUserIds || []).filter((userId) => !submittedVoterIds.has(String(userId)));
}

async function emitPollEvent({
  eventType,
  parentType,
  parentId,
  pollId,
  pollData,
  actor,
  recipientUserIds,
  payload,
  createdBy,
  source,
}) {
  return queueNotificationEvent({
    db,
    eventType,
    resource: {
      type: "basicPoll",
      id: pollId,
      title: pollData?.title || "Basic poll",
    },
    actor,
    payload: {
      parentType,
      parentId,
      basicPollId: pollId,
      basicPollTitle: pollData?.title || "Basic poll",
      ...(payload || {}),
    },
    recipients: {
      userIds: recipientUserIds,
    },
    source: source || "server",
    createdBy,
  });
}

async function deleteVotes(votesCollection) {
  const votesSnap = await votesCollection.get();
  if (votesSnap.empty) return 0;

  await Promise.all(votesSnap.docs.map((voteDoc) => voteDoc.ref.delete()));
  return votesSnap.docs.length;
}

const createBasicPoll = functions.https.onCall(async (data, context) => {
  const uid = context?.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const parentType = resolveParentType(data?.parentType || "group");
  const parentId = data?.parentId || data?.groupId || data?.schedulerId;
  const pollData = data?.pollData || {};

  const parentCollection = resolveParentCollection(parentType);
  if (!parentCollection || !parentId) {
    throw new functions.https.HttpsError("invalid-argument", "Valid parentType and parentId are required");
  }

  const parentRef = db.collection(parentCollection).doc(String(parentId));
  const parentSnap = await parentRef.get();
  if (!parentSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Parent resource not found");
  }

  const parentData = parentSnap.data() || {};
  assertCanManagePoll(parentType, parentData, uid);

  const createdRef = parentRef.collection("basicPolls").doc();
  const basePoll = {
    ...pollData,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (parentType === "group") {
    basePoll.status = pollData.status || BASIC_POLL_STATUSES.OPEN;
  }

  await createdRef.set(basePoll);

  const actor = buildActor(context);
  const recipientUserIds = await resolveRecipientUserIds(parentType, parentData);

  await emitPollEvent({
    eventType: "BASIC_POLL_CREATED",
    parentType,
    parentId,
    pollId: createdRef.id,
    pollData: { ...basePoll, title: pollData?.title || "Basic poll" },
    actor,
    recipientUserIds,
    createdBy: uid,
    source: "web",
  });

  return { pollId: createdRef.id };
});

const finalizeBasicPoll = functions.https.onCall(async (data, context) => {
  const uid = context?.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const parentType = resolveParentType(data?.parentType || "group");
  const parentId = data?.parentId || data?.groupId || data?.schedulerId;
  const pollId = data?.pollId;
  const { parentData, pollRef, pollData } = await loadParentAndPoll(parentType, parentId, pollId);
  assertCanManagePoll(parentType, parentData, uid);

  const votesSnap = await pollRef.collection("votes").get();
  const voteDocs = votesSnap.docs.map((voteDoc) => ({ id: voteDoc.id, ...voteDoc.data() }));
  const finalResults = buildFinalResultsSnapshot(pollData, voteDocs);

  await pollRef.update({
    status: BASIC_POLL_STATUSES.FINALIZED,
    finalizedAt: FieldValue.serverTimestamp(),
    finalResults,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const actor = buildActor(context);
  const recipientUserIds = await resolveRecipientUserIds(parentType, parentData);

  await emitPollEvent({
    eventType: "BASIC_POLL_FINALIZED",
    parentType,
    parentId,
    pollId,
    pollData,
    actor,
    recipientUserIds,
    createdBy: uid,
    source: "web",
  });

  await emitPollEvent({
    eventType: "BASIC_POLL_RESULTS",
    parentType,
    parentId,
    pollId,
    pollData,
    actor,
    recipientUserIds,
    payload: {
      resultsSummary: summarizeResults(pollData, finalResults),
    },
    createdBy: uid,
    source: "web",
  });

  return { status: BASIC_POLL_STATUSES.FINALIZED };
});

const reopenBasicPoll = functions.https.onCall(async (data, context) => {
  const uid = context?.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const parentType = resolveParentType(data?.parentType || "group");
  const parentId = data?.parentId || data?.groupId || data?.schedulerId;
  const pollId = data?.pollId;
  const { parentData, pollRef, pollData } = await loadParentAndPoll(parentType, parentId, pollId);
  assertCanManagePoll(parentType, parentData, uid);

  await pollRef.update({
    status: BASIC_POLL_STATUSES.OPEN,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const actor = buildActor(context);
  const recipientUserIds = await resolveRecipientUserIds(parentType, parentData);

  await emitPollEvent({
    eventType: "BASIC_POLL_REOPENED",
    parentType,
    parentId,
    pollId,
    pollData,
    actor,
    recipientUserIds,
    createdBy: uid,
    source: "web",
  });

  return { status: BASIC_POLL_STATUSES.OPEN };
});

const removeBasicPoll = functions.https.onCall(async (data, context) => {
  const uid = context?.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const parentType = resolveParentType(data?.parentType || "group");
  const parentId = data?.parentId || data?.groupId || data?.schedulerId;
  const pollId = data?.pollId;

  const { parentData, pollRef, pollData } = await loadParentAndPoll(parentType, parentId, pollId);
  assertCanManagePoll(parentType, parentData, uid);

  await deleteVotes(pollRef.collection("votes"));
  await pollRef.delete();

  const actor = buildActor(context);
  const recipientUserIds = await resolveRecipientUserIds(parentType, parentData);

  await emitPollEvent({
    eventType: "BASIC_POLL_REMOVED",
    parentType,
    parentId,
    pollId,
    pollData,
    actor,
    recipientUserIds,
    createdBy: uid,
    source: "web",
  });

  return { removed: true };
});

const resetBasicPollVotes = functions.https.onCall(async (data, context) => {
  const uid = context?.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const parentType = resolveParentType(data?.parentType || "group");
  const parentId = data?.parentId || data?.groupId || data?.schedulerId;
  const pollId = data?.pollId;

  const { parentData, pollRef, pollData } = await loadParentAndPoll(parentType, parentId, pollId);
  assertCanManagePoll(parentType, parentData, uid);

  const deletedVotes = await deleteVotes(pollRef.collection("votes"));
  await pollRef.update({ updatedAt: FieldValue.serverTimestamp() });

  const actor = buildActor(context);
  const recipientUserIds = await resolveRecipientUserIds(parentType, parentData);

  await emitPollEvent({
    eventType: "BASIC_POLL_RESET",
    parentType,
    parentId,
    pollId,
    pollData,
    actor,
    recipientUserIds,
    payload: {
      deletedVotes,
    },
    createdBy: uid,
    source: "web",
  });

  return { deletedVotes };
});

const notifyBasicPollRequiredChanged = functions.https.onCall(async (data, context) => {
  const uid = context?.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const schedulerId = data?.schedulerId || data?.parentId;
  const basicPollId = data?.basicPollId || data?.pollId;
  if (!schedulerId || !basicPollId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "schedulerId and basicPollId are required"
    );
  }

  const { parentData, pollRef, pollData } = await loadParentAndPoll(
    "scheduler",
    schedulerId,
    basicPollId
  );
  assertCanManagePoll("scheduler", parentData, uid);

  const eligibleUserIds = await resolveRecipientUserIds("scheduler", parentData);
  const votesSnap = await pollRef.collection("votes").get();
  const voteDocs = votesSnap.docs.map((voteDoc) => ({ id: voteDoc.id, ...voteDoc.data() }));
  const missingVoterIds = computeMissingVoterIds({
    pollData,
    voteDocs,
    eligibleUserIds,
  });

  const actor = buildActor(context);
  await emitPollEvent({
    eventType: "BASIC_POLL_REQUIRED_CHANGED",
    parentType: "scheduler",
    parentId: schedulerId,
    pollId: basicPollId,
    pollData,
    actor,
    recipientUserIds: missingVoterIds,
    payload: {
      required: pollData?.required === true,
      missingCount: missingVoterIds.length,
    },
    createdBy: uid,
    source: "web",
  });

  return {
    ok: true,
    required: pollData?.required === true,
    eligibleCount: eligibleUserIds.length,
    missingVoterIds,
  };
});

const getRequiredEmbeddedPollFinalizeSummary = functions.https.onCall(async (data, context) => {
  const uid = context?.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const schedulerId = data?.schedulerId || data?.parentId;
  if (!schedulerId) {
    throw new functions.https.HttpsError("invalid-argument", "schedulerId is required");
  }

  const schedulerRef = db.collection("schedulers").doc(String(schedulerId));
  const schedulerSnap = await schedulerRef.get();
  if (!schedulerSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Scheduler not found");
  }

  const schedulerData = schedulerSnap.data() || {};
  assertCanManagePoll("scheduler", schedulerData, uid);

  const summary = await computeSchedulerRequiredEmbeddedPollSummary({
    db,
    schedulerId,
    schedulerData,
    includeMissingUsers: true,
  });

  return {
    schedulerId: summary.schedulerId,
    eligibleCount: summary.eligibleCount,
    totalMissingVotes: summary.totalMissingVotes,
    hasMissingRequiredVotes: summary.hasMissingRequiredVotes,
    requiredPolls: summary.requiredPolls,
  };
});

module.exports = {
  createBasicPoll,
  finalizeBasicPoll,
  reopenBasicPoll,
  removeBasicPoll,
  resetBasicPollVotes,
  notifyBasicPollRequiredChanged,
  getRequiredEmbeddedPollFinalizeSummary,
  __test__: {
    isGroupManager,
    resolveParentType,
    summarizeResults,
    hasSubmittedVote,
    buildFinalResultsSnapshot,
    computeMissingVoterIds,
  },
};
