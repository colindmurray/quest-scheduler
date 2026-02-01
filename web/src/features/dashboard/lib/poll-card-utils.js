import { format, isSameDay, isSameYear } from "date-fns";

export function getSlotRange(slots = []) {
  const dates = slots
    .map((slot) => (slot?.start ? new Date(slot.start) : null))
    .filter((date) => date && !Number.isNaN(date.getTime()));

  if (dates.length === 0) return null;

  dates.sort((a, b) => a - b);
  return {
    start: dates[0],
    end: dates[dates.length - 1],
  };
}

export function formatSlotRange(range) {
  if (!range?.start || !range?.end) return null;

  const start = range.start;
  const end = range.end;

  if (isSameDay(start, end)) {
    return format(start, "MMM d, yyyy");
  }

  if (isSameYear(start, end)) {
    return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
  }

  return `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`;
}

export function getPollStatusLabel({ status, allVotesIn, isCancelled }) {
  if (isCancelled) return "Cancelled";
  if (status === "FINALIZED") return "Finalized";
  if (status === "OPEN") return allVotesIn ? "All votes in" : "Pending votes";
  return "Pending votes";
}
