const { hasSubmittedVote } = require("./vote-submission");
const { BASIC_POLL_STATUSES, BASIC_POLL_VOTE_TYPES, resolveBasicPollVoteType } = require("./constants");

function toUniqueStringList(values) {
  const set = new Set();
  (values || []).forEach((value) => {
    if (value === null || value === undefined) return;
    const normalized = String(value).trim();
    if (normalized) set.add(normalized);
  });
  return Array.from(set);
}

function sortRequiredPollSummaries(summaries = []) {
  return [...summaries].sort((left, right) => {
    const leftOrder = Number.isFinite(left.order) ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right.order) ? right.order : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    return String(left.basicPollTitle || "").localeCompare(String(right.basicPollTitle || ""));
  });
}

async function resolveEligibleUserIds(db, schedulerData = {}) {
  const eligibleIds = toUniqueStringList([
    ...(schedulerData.participantIds || []),
    schedulerData.creatorId,
  ]);

  const questingGroupId = schedulerData.questingGroupId;
  if (!questingGroupId) {
    return eligibleIds;
  }

  const groupSnap = await db.collection("questingGroups").doc(String(questingGroupId)).get();
  if (!groupSnap.exists) {
    return eligibleIds;
  }

  const groupData = groupSnap.data() || {};
  return toUniqueStringList([
    ...eligibleIds,
    ...(groupData.memberIds || []),
    groupData.creatorId,
  ]);
}

async function resolveMissingUsers(db, missingUserIds = []) {
  if (!missingUserIds.length) return {};

  const byId = {};
  const snapshots = await Promise.all(
    missingUserIds.map((userId) => db.collection("usersPublic").doc(String(userId)).get())
  );

  snapshots.forEach((snap, index) => {
    const userId = String(missingUserIds[index]);
    if (!snap.exists) {
      byId[userId] = {
        userId,
        email: null,
        displayName: userId,
      };
      return;
    }

    const data = snap.data() || {};
    const email = typeof data.email === "string" ? data.email.trim() : null;
    const displayName =
      (typeof data.displayName === "string" && data.displayName.trim()) ||
      (typeof data.name === "string" && data.name.trim()) ||
      email ||
      userId;

    byId[userId] = {
      userId,
      email,
      displayName,
    };
  });

  return byId;
}

async function computeSchedulerRequiredEmbeddedPollSummary({
  db,
  schedulerId,
  schedulerData = null,
  includeMissingUsers = false,
}) {
  if (!db || !schedulerId) {
    throw new Error("db and schedulerId are required");
  }

  const schedulerRef = db.collection("schedulers").doc(String(schedulerId));
  const schedulerSnapshot = schedulerData
    ? { exists: true, data: () => schedulerData }
    : await schedulerRef.get();

  if (!schedulerSnapshot.exists) {
    return {
      schedulerId,
      eligibleUserIds: [],
      eligibleCount: 0,
      requiredPolls: [],
      totalMissingVotes: 0,
      hasMissingRequiredVotes: false,
    };
  }

  const scheduler = schedulerSnapshot.data() || {};
  const eligibleUserIds = await resolveEligibleUserIds(db, scheduler);
  const requiredPollsSnapshot = await schedulerRef.collection("basicPolls").get();

  const requiredPolls = (requiredPollsSnapshot.docs || []).filter((pollDoc) => {
    const pollData = pollDoc.data() || {};
    const isRequired = pollData.required === true;
    const isWritableState = !pollData.status || pollData.status === BASIC_POLL_STATUSES.OPEN;
    return isRequired && isWritableState;
  });

  const summaries = await Promise.all(
    requiredPolls.map(async (pollDoc) => {
      const pollData = pollDoc.data() || {};
      const votesSnap = await pollDoc.ref.collection("votes").get();
      const voteType = resolveBasicPollVoteType(pollData?.settings?.voteType);
      const allowWriteIn =
        voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE &&
        pollData?.settings?.allowWriteIn === true;

      const submittedVoterIds = new Set(
        (votesSnap.docs || [])
          .filter((voteDoc) => hasSubmittedVote(voteType, allowWriteIn, voteDoc.data() || {}))
          .map((voteDoc) => String(voteDoc.id).trim())
          .filter(Boolean)
      );

      const missingUserIds = eligibleUserIds.filter((userId) => !submittedVoterIds.has(String(userId)));

      return {
        basicPollId: pollDoc.id,
        basicPollTitle: pollData.title || "Untitled poll",
        order: Number.isFinite(pollData.order) ? pollData.order : Number.MAX_SAFE_INTEGER,
        missingCount: missingUserIds.length,
        missingUserIds,
      };
    })
  );

  const sortedSummaries = sortRequiredPollSummaries(summaries);
  const totalMissingVotes = sortedSummaries.reduce(
    (sum, pollSummary) => sum + (Number.isFinite(pollSummary.missingCount) ? pollSummary.missingCount : 0),
    0
  );

  if (!includeMissingUsers) {
    return {
      schedulerId,
      eligibleUserIds,
      eligibleCount: eligibleUserIds.length,
      requiredPolls: sortedSummaries.map(({ order, ...pollSummary }) => pollSummary),
      totalMissingVotes,
      hasMissingRequiredVotes: sortedSummaries.some((pollSummary) => pollSummary.missingCount > 0),
    };
  }

  const uniqueMissingIds = toUniqueStringList(
    sortedSummaries.flatMap((pollSummary) => pollSummary.missingUserIds || [])
  );
  const missingUsersById = await resolveMissingUsers(db, uniqueMissingIds);

  return {
    schedulerId,
    eligibleUserIds,
    eligibleCount: eligibleUserIds.length,
    requiredPolls: sortedSummaries.map(({ order, ...pollSummary }) => ({
      ...pollSummary,
      missingUsers: (pollSummary.missingUserIds || []).map(
        (userId) =>
          missingUsersById[userId] || {
            userId,
            email: null,
            displayName: userId,
          }
      ),
    })),
    totalMissingVotes,
    hasMissingRequiredVotes: sortedSummaries.some((pollSummary) => pollSummary.missingCount > 0),
  };
}

module.exports = {
  computeSchedulerRequiredEmbeddedPollSummary,
  hasSubmittedVote,
};
