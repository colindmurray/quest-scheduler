export function formatCompactDuration(minutes) {
  const totalMinutes = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  if (totalMinutes <= 0) return "0m";

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${mins}m`;
}

export function getNextCycleVoteValue(currentVote) {
  const normalized = typeof currentVote === "string" ? currentVote.toUpperCase() : null;
  if (normalized === "FEASIBLE") return "PREFERRED";
  if (normalized === "PREFERRED") return null;
  return "FEASIBLE";
}
