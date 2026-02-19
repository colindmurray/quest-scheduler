export const VOTE_VISIBILITY = Object.freeze({
  FULL: "full_visibility",
  HIDDEN_WHILE_VOTING: "hidden_while_voting",
  HIDDEN_UNTIL_ALL_VOTED: "hidden_until_all_voted",
  HIDDEN_UNTIL_FINALIZED: "hidden_until_finalized",
  HIDDEN: "hidden",
});

export const DEFAULT_VOTE_VISIBILITY = VOTE_VISIBILITY.FULL;

export const VOTE_VISIBILITY_OPTIONS = Object.freeze([
  {
    value: VOTE_VISIBILITY.FULL,
    label: "Full visibility",
    description: "Everyone can see votes during voting and after finalization.",
  },
  {
    value: VOTE_VISIBILITY.HIDDEN_WHILE_VOTING,
    label: "Hidden until you vote",
    description: "Participants see others only after casting their own vote.",
  },
  {
    value: VOTE_VISIBILITY.HIDDEN_UNTIL_ALL_VOTED,
    label: "Hidden until all voted",
    description: "Participants see others only once all participants have voted.",
  },
  {
    value: VOTE_VISIBILITY.HIDDEN_UNTIL_FINALIZED,
    label: "Hidden until finalized",
    description: "Participants see others only after a winning date is selected.",
  },
  {
    value: VOTE_VISIBILITY.HIDDEN,
    label: "Creator only",
    description: "Only the poll creator can see other participants' votes.",
  },
]);

const VOTE_VISIBILITY_SET = new Set(VOTE_VISIBILITY_OPTIONS.map((option) => option.value));

export function resolveVoteVisibility(value) {
  return VOTE_VISIBILITY_SET.has(value) ? value : DEFAULT_VOTE_VISIBILITY;
}

export function canViewOtherVotesForUser({
  voteVisibility,
  isCreator = false,
  hasVoted = false,
  allParticipantsVoted = false,
  isFinalized = false,
} = {}) {
  if (isCreator) return true;

  const mode = resolveVoteVisibility(voteVisibility);
  if (mode === VOTE_VISIBILITY.FULL) return true;
  if (mode === VOTE_VISIBILITY.HIDDEN_WHILE_VOTING) return hasVoted;
  if (mode === VOTE_VISIBILITY.HIDDEN_UNTIL_ALL_VOTED) return allParticipantsVoted;
  if (mode === VOTE_VISIBILITY.HIDDEN_UNTIL_FINALIZED) return isFinalized;
  return false;
}

export function canViewOtherVotesPublicly({
  voteVisibility,
  allParticipantsVoted = false,
  isFinalized = false,
} = {}) {
  const mode = resolveVoteVisibility(voteVisibility);
  if (mode === VOTE_VISIBILITY.FULL) return true;
  if (mode === VOTE_VISIBILITY.HIDDEN_UNTIL_ALL_VOTED) return allParticipantsVoted;
  if (mode === VOTE_VISIBILITY.HIDDEN_UNTIL_FINALIZED) return isFinalized;
  return false;
}
