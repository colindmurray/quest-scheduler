import { format, isSameDay, isSameYear } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getTimeZoneAbbr } from "../../../lib/time";

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

export function formatSlotRange(range, timeZone, showTimeZone = true) {
  if (!range?.start || !range?.end) return null;

  const start = range.start;
  const end = range.end;
  const tzAbbr = showTimeZone ? getTimeZoneAbbr(start, timeZone) : "";
  const formatDate = (date, pattern) =>
    timeZone ? formatInTimeZone(date, timeZone, pattern) : format(date, pattern);

  if (isSameDay(start, end)) {
    const label = formatDate(start, "MMM d, yyyy");
    return tzAbbr ? `${label} ${tzAbbr}` : label;
  }

  if (isSameYear(start, end)) {
    const label = `${formatDate(start, "MMM d")} - ${formatDate(end, "MMM d, yyyy")}`;
    return tzAbbr ? `${label} ${tzAbbr}` : label;
  }

  const label = `${formatDate(start, "MMM d, yyyy")} - ${formatDate(end, "MMM d, yyyy")}`;
  return tzAbbr ? `${label} ${tzAbbr}` : label;
}

export function getPollStatusLabel({ status, allVotesIn, isCancelled }) {
  if (isCancelled) return "Cancelled";
  if (status === "FINALIZED") return "Finalized";
  if (status === "OPEN") return allVotesIn ? "All votes in" : "Pending votes";
  return "Pending votes";
}
