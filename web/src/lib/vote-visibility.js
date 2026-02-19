export const VOTE_VISIBILITY = Object.freeze({
  FULL: "full_visibility",
  HIDDEN_WHILE_VOTING: "hidden_while_voting",
  HIDDEN_UNTIL_ALL_VOTED: "hidden_until_all_voted",
  HIDDEN_UNTIL_FINALIZED: "hidden_until_finalized",
  HIDDEN: "hidden",
});

export const DEFAULT_VOTE_VISIBILITY = VOTE_VISIBILITY.FULL;
export const DEFAULT_HIDE_VOTER_IDENTITIES = false;
export const VOTE_ANONYMIZATION = Object.freeze({
  NONE: "none",
  CREATOR_EXCLUDED: "creator_excluded",
  ALL_PARTICIPANTS: "all_participants",
});
export const DEFAULT_VOTE_ANONYMIZATION = VOTE_ANONYMIZATION.NONE;

export const VOTE_VISIBILITY_OPTIONS = Object.freeze([
  {
    value: VOTE_VISIBILITY.FULL,
    label: "Visible to participants immediately",
    description: "Participants see vote details as soon as voting starts.",
  },
  {
    value: VOTE_VISIBILITY.HIDDEN_WHILE_VOTING,
    label: "Visible after each participant votes",
    description: "Each participant unlocks vote details after submitting their own vote.",
  },
  {
    value: VOTE_VISIBILITY.HIDDEN_UNTIL_ALL_VOTED,
    label: "Visible after everyone votes",
    description: "Participants see vote details only once everyone has submitted.",
  },
  {
    value: VOTE_VISIBILITY.HIDDEN_UNTIL_FINALIZED,
    label: "Visible after finalization",
    description: "Participants see vote details only after the poll is finalized.",
  },
  {
    value: VOTE_VISIBILITY.HIDDEN,
    label: "Visible only to organizer",
    description: "Participants never see detailed vote selections.",
  },
]);

export const VOTE_ANONYMIZATION_OPTIONS = Object.freeze([
  {
    value: VOTE_ANONYMIZATION.NONE,
    label: "No anonymization",
    description: "Names are shown wherever vote details are visible.",
  },
  {
    value: VOTE_ANONYMIZATION.CREATOR_EXCLUDED,
    label: "Anonymous for participants",
    description: "Participants see aliases. Organizer still sees real names.",
  },
  {
    value: VOTE_ANONYMIZATION.ALL_PARTICIPANTS,
    label: "Anonymous for everyone",
    description: "Everyone sees aliases, including the organizer.",
  },
]);

const VOTE_VISIBILITY_SET = new Set(VOTE_VISIBILITY_OPTIONS.map((option) => option.value));
const VOTE_ANONYMIZATION_SET = new Set(
  VOTE_ANONYMIZATION_OPTIONS.map((option) => option.value)
);

export function resolveVoteVisibility(value) {
  return VOTE_VISIBILITY_SET.has(value) ? value : DEFAULT_VOTE_VISIBILITY;
}

export function resolveVoteAnonymization(value) {
  return VOTE_ANONYMIZATION_SET.has(value) ? value : DEFAULT_VOTE_ANONYMIZATION;
}

export function resolveHideVoterIdentities(value) {
  return value === true;
}

export function resolveHideVoterIdentitiesForVisibility(value, voteVisibility) {
  const normalizedVisibility = resolveVoteVisibility(voteVisibility);
  if (normalizedVisibility === VOTE_VISIBILITY.FULL) return false;
  return resolveHideVoterIdentities(value);
}

export function canViewVoterIdentities({ isCreator = false, hideVoterIdentities = false } = {}) {
  if (isCreator) return true;
  return resolveHideVoterIdentities(hideVoterIdentities) !== true;
}

export function getVoteIdentityDisplayMode({
  isCreator = false,
  hideVoterIdentities = false,
  voteAnonymization,
} = {}) {
  if (!canViewVoterIdentities({ isCreator, hideVoterIdentities })) return "hidden";

  const anonymizationMode = resolveVoteAnonymization(voteAnonymization);
  if (anonymizationMode === VOTE_ANONYMIZATION.ALL_PARTICIPANTS) return "anonymous";
  if (anonymizationMode === VOTE_ANONYMIZATION.CREATOR_EXCLUDED && !isCreator) {
    return "anonymous";
  }
  return "named";
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
