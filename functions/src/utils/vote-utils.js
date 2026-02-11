function normalizeVoteValue(value) {
  if (!value) return null;
  if (typeof value === "string") return value.toUpperCase();
  if (value === true) return "FEASIBLE";
  if (typeof value === "object") {
    if (value.preferred) return "PREFERRED";
    if (value.feasible) return "FEASIBLE";
  }
  return null;
}

function isAttendingVote(value) {
  const normalized = normalizeVoteValue(value);
  return normalized === "FEASIBLE" || normalized === "PREFERRED";
}

module.exports = {
  normalizeVoteValue,
  isAttendingVote,
};

