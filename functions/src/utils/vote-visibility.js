const VOTE_VISIBILITY = Object.freeze({
  FULL: "full_visibility",
  HIDDEN_WHILE_VOTING: "hidden_while_voting",
  HIDDEN_UNTIL_ALL_VOTED: "hidden_until_all_voted",
  HIDDEN_UNTIL_FINALIZED: "hidden_until_finalized",
  HIDDEN: "hidden",
});

const DEFAULT_VOTE_VISIBILITY = VOTE_VISIBILITY.FULL;
const VOTE_VISIBILITY_SET = new Set(Object.values(VOTE_VISIBILITY));

function resolveVoteVisibility(value) {
  return VOTE_VISIBILITY_SET.has(value) ? value : DEFAULT_VOTE_VISIBILITY;
}

function canViewOtherVotesPublicly({ voteVisibility, allParticipantsVoted, isFinalized } = {}) {
  const mode = resolveVoteVisibility(voteVisibility);
  if (mode === VOTE_VISIBILITY.FULL) return true;
  if (mode === VOTE_VISIBILITY.HIDDEN_UNTIL_ALL_VOTED) return allParticipantsVoted === true;
  if (mode === VOTE_VISIBILITY.HIDDEN_UNTIL_FINALIZED) return isFinalized === true;
  return false;
}

module.exports = {
  VOTE_VISIBILITY,
  DEFAULT_VOTE_VISIBILITY,
  resolveVoteVisibility,
  canViewOtherVotesPublicly,
};
