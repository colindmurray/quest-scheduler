export const BASIC_POLL_VOTE_TYPES = Object.freeze({
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  RANKED_CHOICE: "RANKED_CHOICE",
});

export const BASIC_POLL_STATUSES = Object.freeze({
  OPEN: "OPEN",
  FINALIZED: "FINALIZED",
  CLOSED: "CLOSED",
});

export function resolveBasicPollVoteType(value) {
  return value === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE
    ? BASIC_POLL_VOTE_TYPES.RANKED_CHOICE
    : BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE;
}

export function resolveBasicPollStatus(value) {
  if (value === BASIC_POLL_STATUSES.FINALIZED) return BASIC_POLL_STATUSES.FINALIZED;
  if (value === BASIC_POLL_STATUSES.CLOSED) return BASIC_POLL_STATUSES.CLOSED;
  return BASIC_POLL_STATUSES.OPEN;
}
