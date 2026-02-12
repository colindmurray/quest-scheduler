import { coerceDate } from "../../../lib/time";

const toDate = coerceDate;

export const DASHBOARD_STATUS_OPTIONS = [
  {
    value: "OPEN",
    label: "Open",
    description: "Open session polls and open general polls.",
  },
  {
    value: "FINALIZED",
    label: "Finalized",
    description: "Finalized session polls and finalized general polls.",
  },
  {
    value: "CANCELLED",
    label: "Cancelled",
    description: "Cancelled session polls.",
  },
  {
    value: "CLOSED",
    label: "Closed",
    description: "Closed general polls that are not finalized.",
  },
  {
    value: "ARCHIVED",
    label: "Archived",
    description: "Archived session and general polls.",
  },
];

export const DASHBOARD_STATUS_ORDER = DASHBOARD_STATUS_OPTIONS.map((option) => option.value);

export function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

export function matchesSearch(fields, query) {
  if (!query) return true;
  const haystack = fields
    .map((field) => String(field || ""))
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function toDayStartMs(value) {
  const date = toDate(value);
  if (!date) return null;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

export function toDayEndMs(value) {
  const date = toDate(value);
  if (!date) return null;
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

export function isWithinDateWindow(value, fromMs, toMs) {
  if (fromMs === null && toMs === null) return true;
  const date = toDate(value);
  if (!date) return false;
  const time = date.getTime();
  if (fromMs !== null && time < fromMs) return false;
  if (toMs !== null && time > toMs) return false;
  return true;
}

export function resolveSessionDashboardStatus(scheduler, archivedPollSet) {
  if (archivedPollSet.has(scheduler.id)) return "ARCHIVED";
  if (scheduler.status === "FINALIZED") return "FINALIZED";
  if (scheduler.status === "CANCELLED") return "CANCELLED";
  return "OPEN";
}

export function resolveBasicPollDashboardStatus(poll) {
  if (poll.isArchived || poll.state === "ARCHIVED") return "ARCHIVED";
  if (poll.pollStatus === "FINALIZED") return "FINALIZED";
  if (poll.state === "CLOSED") return "CLOSED";
  return "OPEN";
}

export function describeStatusFilterSelection(selectedValues) {
  if (!selectedValues?.length) return "Any status";
  if (selectedValues.length === 1) {
    const option = DASHBOARD_STATUS_OPTIONS.find((entry) => entry.value === selectedValues[0]);
    return option?.label || selectedValues[0];
  }
  return `${selectedValues.length} statuses`;
}

export function describeDateFilterSelection(from, to) {
  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  const formatDate = (value) =>
    value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (fromDate && toDateValue) return `${formatDate(fromDate)} to ${formatDate(toDateValue)}`;
  if (fromDate) return `From ${formatDate(fromDate)}`;
  if (toDateValue) return `Until ${formatDate(toDateValue)}`;
  return "Date range";
}

export function normalizeDateRangeBounds(from, to) {
  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  if (fromDate && toDateValue && fromDate.getTime() > toDateValue.getTime()) {
    return { from: toDateValue, to: fromDate };
  }
  return { from: fromDate, to: toDateValue };
}
