import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";
import { BASIC_POLL_STATUSES, BASIC_POLL_VOTE_TYPES, resolveBasicPollVoteType } from "../basic-polls/constants";
import { computeInstantRunoffResults } from "../basic-polls/irv";
import { computeMultipleChoiceTallies } from "../basic-polls/multiple-choice";
import { hasSubmittedVote } from "../basic-polls/vote-submission";
import { coerceDate } from "../time";
import {
  VOTE_VISIBILITY,
  resolveHideVoterIdentities,
  resolveHideVoterIdentitiesForVisibility,
  resolveVoteVisibility,
} from "../vote-visibility";

const DELETE_BATCH_SIZE = 450;
const PARENT_TYPE_COLLECTIONS = {
  group: "questingGroups",
  scheduler: "schedulers",
};
const BASIC_POLL_SERVER_FALLBACK_CODES = new Set([
  "functions/unavailable",
  "functions/not-found",
  "failed-precondition",
]);

export const groupBasicPollsRef = (groupId) =>
  collection(db, "questingGroups", groupId, "basicPolls");

export const groupBasicPollRef = (groupId, pollId) =>
  doc(db, "questingGroups", groupId, "basicPolls", pollId);

export const groupBasicPollVotesRef = (groupId, pollId) =>
  collection(db, "questingGroups", groupId, "basicPolls", pollId, "votes");

export function resolveBasicPollParentCollection(parentType) {
  return PARENT_TYPE_COLLECTIONS[parentType] || null;
}

export const basicPollRef = (parentType, parentId, pollId) => {
  const parentCollection = resolveBasicPollParentCollection(parentType);
  if (!parentCollection || !parentId || !pollId) return null;
  return doc(db, parentCollection, parentId, "basicPolls", pollId);
};

export const basicPollVotesRef = (parentType, parentId, pollId) => {
  const parentCollection = resolveBasicPollParentCollection(parentType);
  if (!parentCollection || !parentId || !pollId) return null;
  return collection(db, parentCollection, parentId, "basicPolls", pollId, "votes");
};

export const basicPollVoteRef = (parentType, parentId, pollId, userId) => {
  const votesRef = basicPollVotesRef(parentType, parentId, pollId);
  if (!votesRef || !userId) return null;
  return doc(votesRef, userId);
};

function mapSnapshotDocs(snapshot) {
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

function sanitizePollCreateData(pollData = {}) {
  const voteVisibility = resolveVoteVisibility(pollData?.voteVisibility);
  return {
    ...pollData,
    voteVisibility,
    hideVoterIdentities: resolveHideVoterIdentitiesForVisibility(
      pollData?.hideVoterIdentities,
      voteVisibility
    ),
    votesAllSubmitted: false,
  };
}

function sanitizePollUpdateData(updates = {}) {
  const hasVoteVisibility = Object.prototype.hasOwnProperty.call(updates || {}, "voteVisibility");
  const hasHideVoterIdentities = Object.prototype.hasOwnProperty.call(
    updates || {},
    "hideVoterIdentities"
  );
  if (!hasVoteVisibility && !hasHideVoterIdentities) {
    return updates;
  }

  const normalized = { ...updates };
  if (hasVoteVisibility) {
    normalized.voteVisibility = resolveVoteVisibility(updates?.voteVisibility);
  }
  if (hasHideVoterIdentities) {
    normalized.hideVoterIdentities = resolveHideVoterIdentitiesForVisibility(
      updates?.hideVoterIdentities,
      normalized.voteVisibility
    );
  } else if (
    hasVoteVisibility &&
    resolveVoteVisibility(normalized.voteVisibility) === VOTE_VISIBILITY.FULL
  ) {
    normalized.hideVoterIdentities = resolveHideVoterIdentities(false);
  }
  return normalized;
}

function resolvePollDeadline(pollData = {}) {
  return coerceDate(pollData?.settings?.deadlineAt || pollData?.deadlineAt || null);
}

function isPollDeadlineOpen(pollData = {}) {
  const deadlineAt = resolvePollDeadline(pollData);
  return !deadlineAt || deadlineAt.getTime() > Date.now();
}

function isPermissionDeniedError(error) {
  const code = String(error?.code || "").toLowerCase();
  return code.includes("permission-denied");
}

async function callBasicPollServerAction(actionName, payload) {
  try {
    const functions = getFunctions();
    const action = httpsCallable(functions, actionName);
    const result = await action(payload);
    return result?.data || null;
  } catch (error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    const shouldFallback =
      BASIC_POLL_SERVER_FALLBACK_CODES.has(code) ||
      message.includes("No Firebase App") ||
      message.includes("no-app");

    if (shouldFallback) {
      return null;
    }

    throw error;
  }
}

function buildFinalResultsSnapshot(pollData = {}, votes = []) {
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
    const lastRound = Array.isArray(results.rounds)
      ? results.rounds[results.rounds.length - 1]
      : null;
    return {
      voteType,
      rounds: Array.isArray(results.rounds) ? results.rounds : [],
      winnerIds: Array.isArray(results.winnerIds) ? results.winnerIds : [],
      tiedIds: Array.isArray(results.tiedIds) ? results.tiedIds : [],
      voterCount: Number.isFinite(results.totalBallots) ? results.totalBallots : submittedVotes.length,
      exhaustedCount: Number.isFinite(lastRound?.exhausted) ? lastRound.exhausted : 0,
      capturedAt: serverTimestamp(),
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
    voterCount: Number.isFinite(tallies.totalVoters) ? tallies.totalVoters : submittedVotes.length,
    capturedAt: serverTimestamp(),
  };
}

async function deleteDocRefsInBatches(refs = []) {
  if (refs.length === 0) return;

  const commits = [];
  for (let index = 0; index < refs.length; index += DELETE_BATCH_SIZE) {
    const batch = writeBatch(db);
    refs.slice(index, index + DELETE_BATCH_SIZE).forEach((ref) => batch.delete(ref));
    commits.push(batch.commit());
  }

  await Promise.all(commits);
}

async function deleteBasicPollWithVotes(parentType, parentId, pollId) {
  const pollRef = basicPollRef(parentType, parentId, pollId);
  const votesRef = basicPollVotesRef(parentType, parentId, pollId);
  if (!pollRef || !votesRef) return;

  const votesSnap = await getDocs(votesRef);
  const refsToDelete = votesSnap.docs.map((voteDoc) => voteDoc.ref);
  refsToDelete.push(pollRef);

  await deleteDocRefsInBatches(refsToDelete);
}

export async function createBasicPoll(groupId, pollData = {}, options = {}) {
  if (!groupId) return null;
  const normalizedPollData = sanitizePollCreateData(pollData);

  const useServer = options.useServer !== false;
  if (useServer) {
    const response = await callBasicPollServerAction("createBasicPoll", {
      parentType: "group",
      parentId: groupId,
      pollData: normalizedPollData,
    });
    if (response?.pollId) {
      return response.pollId;
    }
  }

  const created = await addDoc(groupBasicPollsRef(groupId), {
    ...normalizedPollData,
    status: normalizedPollData.status ?? BASIC_POLL_STATUSES.OPEN,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return created.id;
}

export async function fetchGroupBasicPolls(groupId) {
  if (!groupId) return [];
  const snapshot = await getDocs(groupBasicPollsRef(groupId));
  return mapSnapshotDocs(snapshot);
}

export async function fetchOpenGroupPollsWithoutVote(groupIds = [], userId) {
  const normalizedGroupIds = Array.from(new Set((groupIds || []).filter(Boolean)));
  if (!userId || normalizedGroupIds.length === 0) return [];

  const allResults = await Promise.all(
    normalizedGroupIds.map(async (groupId) => {
      const pollsSnapshot = await getDocs(
        query(groupBasicPollsRef(groupId), where("status", "==", BASIC_POLL_STATUSES.OPEN))
      );
      const openPolls = pollsSnapshot.docs.map((pollDoc) => ({
        id: pollDoc.id,
        ...pollDoc.data(),
      }));

      const unvoted = await Promise.all(
        openPolls.map(async (poll) => {
          if (!isPollDeadlineOpen(poll)) return null;

          const settings = poll?.settings || {};
          const voteType = resolveBasicPollVoteType(settings.voteType);
          const allowWriteIn =
            voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && settings.allowWriteIn === true;
          const voteRef = basicPollVoteRef("group", groupId, poll.id, userId);
          const voteSnap = voteRef ? await getDoc(voteRef) : null;
          const myVote = voteSnap?.exists() ? voteSnap.data() || {} : null;
          const hasVoted = myVote ? hasSubmittedVote(voteType, allowWriteIn, myVote) : false;
          if (hasVoted) return null;

          return {
            ...poll,
            parentType: "group",
            parentId: groupId,
            pollId: poll.id,
          };
        })
      );

      return unvoted.filter(Boolean);
    })
  );

  return allResults.flat();
}

async function buildDashboardPollSummary(parentType, parentId, pollData, userId) {
  const settings = pollData?.settings || {};
  const voteType = resolveBasicPollVoteType(settings.voteType);
  const allowWriteIn =
    voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && settings.allowWriteIn === true;
  let voteDocs = [];
  try {
    const votesSnapshot = await getDocs(basicPollVotesRef(parentType, parentId, pollData.id));
    voteDocs = mapSnapshotDocs(votesSnapshot);
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
    const ownVoteReference = basicPollVoteRef(parentType, parentId, pollData.id, userId);
    if (ownVoteReference) {
      const ownVoteSnapshot = await getDoc(ownVoteReference);
      voteDocs = ownVoteSnapshot.exists() ? [{ id: ownVoteSnapshot.id, ...ownVoteSnapshot.data() }] : [];
    }
  }
  const submittedVotes = voteDocs.filter((voteDoc) => hasSubmittedVote(voteType, allowWriteIn, voteDoc));
  const voterIds = submittedVotes.map((voteDoc) => voteDoc.id).filter(Boolean);

  return {
    ...pollData,
    parentType,
    parentId,
    pollId: pollData.id,
    voteType,
    allowWriteIn,
    deadlineAt: resolvePollDeadline(pollData),
    isDeadlineOpen: isPollDeadlineOpen(pollData),
    hasVoted: submittedVotes.some((voteDoc) => voteDoc.id === userId),
    votedCount: submittedVotes.length,
    voterIds,
  };
}

export async function fetchDashboardGroupBasicPolls(groupIds = [], userId) {
  const normalizedGroupIds = Array.from(new Set((groupIds || []).filter(Boolean)));
  if (!userId || normalizedGroupIds.length === 0) return [];

  const groupPolls = await Promise.all(
    normalizedGroupIds.map(async (groupId) => {
      const pollsSnapshot = await getDocs(groupBasicPollsRef(groupId));
      const polls = pollsSnapshot.docs.map((pollDoc) => ({ id: pollDoc.id, ...pollDoc.data() }));
      const summaries = await Promise.all(
        polls.map((pollData) => buildDashboardPollSummary("group", groupId, pollData, userId))
      );
      return summaries;
    })
  );

  return groupPolls.flat();
}

export async function updateBasicPoll(groupId, pollId, updates = {}) {
  if (!groupId || !pollId) return;
  const normalizedUpdates = sanitizePollUpdateData(updates);

  await updateDoc(groupBasicPollRef(groupId, pollId), {
    ...normalizedUpdates,
    updatedAt: serverTimestamp(),
  });
}

export async function finalizeBasicPoll(groupId, pollId) {
  return finalizeBasicPollForParent("group", groupId, pollId);
}

export async function reopenBasicPoll(groupId, pollId) {
  return reopenBasicPollForParent("group", groupId, pollId);
}

export async function finalizeBasicPollForParent(parentType, parentId, pollId) {
  if (!parentType || !parentId || !pollId) return;
  const pollRef = basicPollRef(parentType, parentId, pollId);
  const votesRef = basicPollVotesRef(parentType, parentId, pollId);
  if (!pollRef || !votesRef) return;

  const response = await callBasicPollServerAction("finalizeBasicPoll", {
    parentType,
    parentId,
    pollId,
  });
  if (response?.status === BASIC_POLL_STATUSES.FINALIZED) return;

  const [pollSnap, votesSnap] = await Promise.all([getDoc(pollRef), getDocs(votesRef)]);
  if (!pollSnap.exists()) return;

  const finalResults = buildFinalResultsSnapshot(pollSnap.data() || {}, mapSnapshotDocs(votesSnap));
  await updateDoc(pollRef, {
    status: BASIC_POLL_STATUSES.FINALIZED,
    finalizedAt: serverTimestamp(),
    finalResults,
    updatedAt: serverTimestamp(),
  });
}

export async function reopenBasicPollForParent(parentType, parentId, pollId) {
  if (!parentType || !parentId || !pollId) return;
  const pollRef = basicPollRef(parentType, parentId, pollId);
  if (!pollRef) return;

  const response = await callBasicPollServerAction("reopenBasicPoll", {
    parentType,
    parentId,
    pollId,
  });
  if (response?.status === BASIC_POLL_STATUSES.OPEN) return;

  await updateDoc(pollRef, {
    status: BASIC_POLL_STATUSES.OPEN,
    updatedAt: serverTimestamp(),
  });
}

export async function finalizeEmbeddedBasicPoll(schedulerId, pollId) {
  return finalizeBasicPollForParent("scheduler", schedulerId, pollId);
}

export async function reopenEmbeddedBasicPoll(schedulerId, pollId) {
  return reopenBasicPollForParent("scheduler", schedulerId, pollId);
}

export async function deleteBasicPoll(groupId, pollId, options = {}) {
  const useServer = options.useServer === true;
  if (useServer) {
    const response = await callBasicPollServerAction("removeBasicPoll", {
      parentType: "group",
      parentId: groupId,
      pollId,
    });
    if (response?.removed) return;
  }

  await deleteBasicPollWithVotes("group", groupId, pollId);
}

export async function resetBasicPollVotes(parentType, parentId, pollId, options = {}) {
  const useServer = options.useServer === true;
  if (useServer) {
    const response = await callBasicPollServerAction("resetBasicPollVotes", {
      parentType,
      parentId,
      pollId,
    });
    if (response && Number.isFinite(response.deletedVotes)) {
      return;
    }
  }

  const votesRef = basicPollVotesRef(parentType, parentId, pollId);
  if (!votesRef) return;
  const votesSnap = await getDocs(votesRef);
  const voteRefs = votesSnap.docs.map((voteDoc) => voteDoc.ref);
  await deleteDocRefsInBatches(voteRefs);
}

export function subscribeToGroupPolls(groupId, callback, onError) {
  if (!groupId) {
    if (callback) callback([]);
    return () => {};
  }

  const pollsQuery = query(groupBasicPollsRef(groupId), orderBy("createdAt", "desc"));
  return onSnapshot(
    pollsQuery,
    (snapshot) => {
      if (callback) callback(mapSnapshotDocs(snapshot));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export function subscribeToBasicPoll(groupId, pollId, callback, onError) {
  if (!groupId || !pollId) {
    if (callback) callback(null);
    return () => {};
  }

  return onSnapshot(
    groupBasicPollRef(groupId, pollId),
    (snapshot) => {
      if (!callback) return;
      callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function createEmbeddedBasicPoll(schedulerId, pollData = {}, options = {}) {
  if (!schedulerId) return null;
  const normalizedPollData = sanitizePollCreateData(pollData);

  const useServer = options.useServer !== false;
  if (useServer) {
    const response = await callBasicPollServerAction("createBasicPoll", {
      parentType: "scheduler",
      parentId: schedulerId,
      pollData: normalizedPollData,
    });
    if (response?.pollId) {
      return response.pollId;
    }
  }

  const pollsRef = collection(db, "schedulers", schedulerId, "basicPolls");
  const created = await addDoc(pollsRef, {
    ...normalizedPollData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return created.id;
}

export async function fetchEmbeddedBasicPolls(schedulerId) {
  if (!schedulerId) return [];
  const snapshot = await getDocs(collection(db, "schedulers", schedulerId, "basicPolls"));
  return mapSnapshotDocs(snapshot);
}

export async function fetchRequiredEmbeddedPollsWithoutVote(schedulerIds = [], userId) {
  const normalizedSchedulerIds = Array.from(new Set((schedulerIds || []).filter(Boolean)));
  if (!userId || normalizedSchedulerIds.length === 0) return [];

  const allResults = await Promise.all(
    normalizedSchedulerIds.map(async (schedulerId) => {
      const pollsSnapshot = await getDocs(
        query(
          collection(db, "schedulers", schedulerId, "basicPolls"),
          where("required", "==", true)
        )
      );
      const requiredPolls = pollsSnapshot.docs.map((pollDoc) => ({
        id: pollDoc.id,
        ...pollDoc.data(),
      }));

      const unvoted = await Promise.all(
        requiredPolls.map(async (poll) => {
          if (poll?.status && poll.status !== BASIC_POLL_STATUSES.OPEN) return null;
          if (!isPollDeadlineOpen(poll)) return null;

          const settings = poll?.settings || {};
          const voteType = resolveBasicPollVoteType(settings.voteType);
          const allowWriteIn =
            voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && settings.allowWriteIn === true;
          const voteRef = basicPollVoteRef("scheduler", schedulerId, poll.id, userId);
          const voteSnap = voteRef ? await getDoc(voteRef) : null;
          const myVote = voteSnap?.exists() ? voteSnap.data() || {} : null;
          const hasVoted = myVote ? hasSubmittedVote(voteType, allowWriteIn, myVote) : false;
          if (hasVoted) return null;

          return {
            ...poll,
            parentType: "scheduler",
            parentId: schedulerId,
            pollId: poll.id,
          };
        })
      );

      return unvoted.filter(Boolean);
    })
  );

  return allResults.flat();
}

export async function fetchDashboardEmbeddedBasicPolls(schedulerIds = [], userId) {
  const normalizedSchedulerIds = Array.from(new Set((schedulerIds || []).filter(Boolean)));
  if (!userId || normalizedSchedulerIds.length === 0) return [];

  const schedulerPolls = await Promise.all(
    normalizedSchedulerIds.map(async (schedulerId) => {
      const pollsSnapshot = await getDocs(collection(db, "schedulers", schedulerId, "basicPolls"));
      const polls = pollsSnapshot.docs.map((pollDoc) => ({ id: pollDoc.id, ...pollDoc.data() }));
      const summaries = await Promise.all(
        polls.map((pollData) => buildDashboardPollSummary("scheduler", schedulerId, pollData, userId))
      );
      return summaries;
    })
  );

  return schedulerPolls.flat();
}

export async function updateEmbeddedBasicPoll(schedulerId, pollId, updates = {}) {
  if (!schedulerId || !pollId) return;
  const normalizedUpdates = sanitizePollUpdateData(updates);

  await updateDoc(doc(db, "schedulers", schedulerId, "basicPolls", pollId), {
    ...normalizedUpdates,
    updatedAt: serverTimestamp(),
  });
}

export async function notifyEmbeddedBasicPollRequiredChanged(schedulerId, pollId) {
  if (!schedulerId || !pollId) return null;
  return callBasicPollServerAction("notifyBasicPollRequiredChanged", {
    schedulerId,
    basicPollId: pollId,
  });
}

export async function fetchRequiredEmbeddedPollFinalizeSummary(schedulerId) {
  if (!schedulerId) return null;
  return callBasicPollServerAction("getRequiredEmbeddedPollFinalizeSummary", {
    schedulerId,
  });
}

export async function breakBasicPollTieForParent(parentType, parentId, pollId, method) {
  if (!parentType || !parentId || !pollId || !method) return null;
  const response = await callBasicPollServerAction("breakBasicPollTie", {
    parentType,
    parentId,
    pollId,
    method,
  });
  if (response) return response;
  throw new Error("Tie-break action is currently unavailable.");
}

export async function deleteEmbeddedBasicPoll(schedulerId, pollId, options = {}) {
  const useServer = options.useServer === true;
  if (useServer) {
    const response = await callBasicPollServerAction("removeBasicPoll", {
      parentType: "scheduler",
      parentId: schedulerId,
      pollId,
    });
    if (response?.removed) return;
  }

  await deleteBasicPollWithVotes("scheduler", schedulerId, pollId);
}

export async function reorderEmbeddedBasicPolls(schedulerId, pollIds = []) {
  if (!schedulerId) return;

  const normalizedIds = (pollIds || []).filter(Boolean);
  if (normalizedIds.length === 0) return;

  const commits = [];
  for (let index = 0; index < normalizedIds.length; index += DELETE_BATCH_SIZE) {
    const batch = writeBatch(db);
    normalizedIds.slice(index, index + DELETE_BATCH_SIZE).forEach((pollId, offset) => {
      batch.update(doc(db, "schedulers", schedulerId, "basicPolls", pollId), {
        order: index + offset,
        updatedAt: serverTimestamp(),
      });
    });
    commits.push(batch.commit());
  }

  await Promise.all(commits);
}

export function subscribeToEmbeddedBasicPolls(schedulerId, callback, onError) {
  if (!schedulerId) {
    if (callback) callback([]);
    return () => {};
  }

  const pollsQuery = query(
    collection(db, "schedulers", schedulerId, "basicPolls"),
    orderBy("order", "asc")
  );

  return onSnapshot(
    pollsQuery,
    (snapshot) => {
      if (callback) callback(mapSnapshotDocs(snapshot));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function cloneEmbeddedBasicPolls(
  sourceSchedulerId,
  targetSchedulerId,
  options = {}
) {
  if (!sourceSchedulerId || !targetSchedulerId) return;

  const clearVotes = options.clearVotes === true;
  const userId = options.userId || null;
  const votesByPollId = options.votesByPollId || {};

  const sourcePolls = await fetchEmbeddedBasicPolls(sourceSchedulerId);
  const sortedPolls = [...sourcePolls].sort((left, right) => {
    const leftOrder = Number.isFinite(left?.order) ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right?.order) ? right.order : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left?.title || "").localeCompare(String(right?.title || ""));
  });

  await Promise.all(
    sortedPolls.map((poll, index) => {
      const targetPollRef = doc(db, "schedulers", targetSchedulerId, "basicPolls", poll.id);
      const clonedPoll = {
        ...poll,
        order: Number.isFinite(poll?.order) ? poll.order : index,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      delete clonedPoll.id;
      delete clonedPoll.finalResults;
      delete clonedPoll.finalizedAt;
      delete clonedPoll.finalizedByUserId;
      delete clonedPoll.status;
      return setDoc(targetPollRef, clonedPoll);
    })
  );

  if (clearVotes || !userId) return;

  await Promise.all(
    sortedPolls.map(async (poll) => {
      const voteType = resolveBasicPollVoteType(poll?.settings?.voteType);
      const allowWriteIn =
        voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && poll?.settings?.allowWriteIn === true;
      const sourceVote = votesByPollId[poll.id] || null;
      if (!sourceVote || !hasSubmittedVote(voteType, allowWriteIn, sourceVote)) return;

      const nextVote = {
        ...sourceVote,
        updatedAt: serverTimestamp(),
      };
      delete nextVote.id;
      const targetVoteRef = basicPollVoteRef("scheduler", targetSchedulerId, poll.id, userId);
      if (!targetVoteRef) return;
      await setDoc(targetVoteRef, nextVote, { merge: true });
    })
  );
}

export async function submitBasicPollVote(parentType, parentId, pollId, userId, voteData = {}) {
  const voteRef = basicPollVoteRef(parentType, parentId, pollId, userId);
  if (!voteRef) return;

  await setDoc(
    voteRef,
    {
      ...voteData,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteBasicPollVote(parentType, parentId, pollId, userId) {
  const voteRef = basicPollVoteRef(parentType, parentId, pollId, userId);
  if (!voteRef) return;
  await deleteDoc(voteRef);
}

export function subscribeToBasicPollVotes(parentType, parentId, pollId, callback, onError) {
  const votesRef = basicPollVotesRef(parentType, parentId, pollId);
  if (!votesRef) {
    if (callback) callback([]);
    return () => {};
  }

  return onSnapshot(
    votesRef,
    (snapshot) => {
      if (callback) callback(mapSnapshotDocs(snapshot));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export function subscribeToMyBasicPollVote(
  parentType,
  parentId,
  pollId,
  userId,
  callback,
  onError
) {
  const voteRef = basicPollVoteRef(parentType, parentId, pollId, userId);
  if (!voteRef) {
    if (callback) callback(null);
    return () => {};
  }

  return onSnapshot(
    voteRef,
    (snapshot) => {
      if (!callback) return;
      callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}
