const VOTE_VISIBILITY = Object.freeze({
  FULL: "full_visibility",
  HIDDEN_WHILE_VOTING: "hidden_while_voting",
  HIDDEN_UNTIL_ALL_VOTED: "hidden_until_all_voted",
  HIDDEN_UNTIL_FINALIZED: "hidden_until_finalized",
  HIDDEN: "hidden",
});

const DEFAULT_VOTE_VISIBILITY = VOTE_VISIBILITY.FULL;
const DEFAULT_HIDE_VOTER_IDENTITIES = false;
const VOTE_ANONYMIZATION = Object.freeze({
  NONE: "none",
  CREATOR_EXCLUDED: "creator_excluded",
  ALL_PARTICIPANTS: "all_participants",
});
const DEFAULT_VOTE_ANONYMIZATION = VOTE_ANONYMIZATION.NONE;
const VOTE_VISIBILITY_SET = new Set(Object.values(VOTE_VISIBILITY));
const VOTE_ANONYMIZATION_SET = new Set(Object.values(VOTE_ANONYMIZATION));

function resolveVoteVisibility(value) {
  return VOTE_VISIBILITY_SET.has(value) ? value : DEFAULT_VOTE_VISIBILITY;
}

function resolveVoteAnonymization(value) {
  return VOTE_ANONYMIZATION_SET.has(value) ? value : DEFAULT_VOTE_ANONYMIZATION;
}

function resolveHideVoterIdentities(value) {
  return value === true;
}

function resolveHideVoterIdentitiesForVisibility(value, voteVisibility) {
  const normalizedVisibility = resolveVoteVisibility(voteVisibility);
  if (normalizedVisibility === VOTE_VISIBILITY.FULL) return false;
  return resolveHideVoterIdentities(value);
}

function canViewVoterIdentities({ isCreator = false, hideVoterIdentities = false } = {}) {
  if (isCreator) return true;
  return resolveHideVoterIdentities(hideVoterIdentities) !== true;
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
  DEFAULT_HIDE_VOTER_IDENTITIES,
  VOTE_ANONYMIZATION,
  DEFAULT_VOTE_ANONYMIZATION,
  resolveVoteVisibility,
  resolveVoteAnonymization,
  resolveHideVoterIdentities,
  resolveHideVoterIdentitiesForVisibility,
  canViewVoterIdentities,
  canViewOtherVotesPublicly,
};
