const { BASIC_POLL_VOTE_TYPES, resolveBasicPollVoteType } = require("./constants");

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

function resolveVoteType(value) {
  return resolveBasicPollVoteType(value);
}

function resolveVoteConfigFromPoll(pollData = {}) {
  const voteType = resolveVoteType(pollData?.settings?.voteType);
  return {
    voteType,
    allowWriteIn:
      voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && pollData?.settings?.allowWriteIn === true,
  };
}

function hasSubmittedVote(voteType, allowWriteIn, voteDoc) {
  if (resolveVoteType(voteType) === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE) {
    return normalizeVoteRankings(voteDoc).length > 0;
  }

  const hasOptionIds = normalizeVoteOptionIds(voteDoc).length > 0;
  const hasWriteIn = Boolean(allowWriteIn) && String(voteDoc?.otherText || "").trim().length > 0;
  return hasOptionIds || hasWriteIn;
}

function hasSubmittedVoteForPoll(pollData, voteDoc) {
  if (!pollData || !voteDoc) return false;
  const { voteType, allowWriteIn } = resolveVoteConfigFromPoll(pollData);
  return hasSubmittedVote(voteType, allowWriteIn, voteDoc);
}

function hasVotePayloadChanged(beforeData, afterData) {
  const beforeOptionIds = normalizeVoteOptionIds(beforeData);
  const afterOptionIds = normalizeVoteOptionIds(afterData);
  const beforeRankings = normalizeVoteRankings(beforeData);
  const afterRankings = normalizeVoteRankings(afterData);
  const beforeOther = String(beforeData?.otherText || "").trim();
  const afterOther = String(afterData?.otherText || "").trim();

  return (
    JSON.stringify(beforeOptionIds) !== JSON.stringify(afterOptionIds) ||
    JSON.stringify(beforeRankings) !== JSON.stringify(afterRankings) ||
    beforeOther !== afterOther
  );
}

module.exports = {
  normalizeVoteIdList,
  normalizeVoteOptionIds,
  normalizeVoteRankings,
  resolveVoteType,
  resolveVoteConfigFromPoll,
  hasSubmittedVote,
  hasSubmittedVoteForPoll,
  hasVotePayloadChanged,
};
