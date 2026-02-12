import { BASIC_POLL_VOTE_TYPES, resolveBasicPollVoteType } from "./constants";

function normalizeVoteIdList(values = []) {
  if (!Array.isArray(values)) return [];
  return values
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function normalizeVoteOptionIds(voteDoc = {}) {
  return normalizeVoteIdList(voteDoc?.optionIds);
}

function normalizeVoteRankings(voteDoc = {}) {
  return normalizeVoteIdList(voteDoc?.rankings);
}

export function resolveVoteType(value) {
  return resolveBasicPollVoteType(value);
}

export function resolveVoteConfigFromPoll(pollData = {}) {
  const voteType = resolveVoteType(pollData?.settings?.voteType);
  return {
    voteType,
    allowWriteIn:
      voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && pollData?.settings?.allowWriteIn === true,
  };
}

export function hasSubmittedVote(voteType, allowWriteIn, voteDoc) {
  if (resolveVoteType(voteType) === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE) {
    return normalizeVoteRankings(voteDoc).length > 0;
  }

  const hasOptionIds = normalizeVoteOptionIds(voteDoc).length > 0;
  const hasWriteIn = Boolean(allowWriteIn) && String(voteDoc?.otherText || "").trim().length > 0;
  return hasOptionIds || hasWriteIn;
}

export function hasSubmittedVoteForPoll(pollData, voteDoc) {
  if (!pollData || !voteDoc) return false;
  const { voteType, allowWriteIn } = resolveVoteConfigFromPoll(pollData);
  return hasSubmittedVote(voteType, allowWriteIn, voteDoc);
}

export { normalizeVoteIdList, normalizeVoteOptionIds, normalizeVoteRankings };
