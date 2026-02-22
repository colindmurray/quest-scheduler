export const VOTE_VALUES = {
  FEASIBLE: "FEASIBLE",
  PREFERRED: "PREFERRED",
};

export function normalizeVoteValue(value) {
  if (!value) return null;
  if (typeof value === "string") return value.toUpperCase();
  if (value === true) return VOTE_VALUES.FEASIBLE;
  if (typeof value === "object") {
    if (value.preferred) return VOTE_VALUES.PREFERRED;
    if (value.feasible) return VOTE_VALUES.FEASIBLE;
  }
  return null;
}

export function isAttendingVote(value) {
  const normalized = normalizeVoteValue(value);
  return normalized === VOTE_VALUES.FEASIBLE || normalized === VOTE_VALUES.PREFERRED;
}

export function hasSubmittedSchedulerVote(voteDoc) {
  if (!voteDoc || typeof voteDoc !== "object") return false;
  if (voteDoc.noTimesWork === true) return true;
  const votes = voteDoc.votes;
  if (!votes || typeof votes !== "object") return false;
  return Object.values(votes).some((value) => isAttendingVote(value));
}
