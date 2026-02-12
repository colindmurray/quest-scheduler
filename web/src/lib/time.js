import { formatInTimeZone, toZonedTime } from "date-fns-tz";

const FALLBACK_TIME_ZONE = "UTC";

function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function getIntlTimeZoneName(date, timeZone, timeZoneName) {
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName,
  }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value || null;
}

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
}

export function resolveUserTimeZone(settings) {
  if (settings?.timezoneMode === "manual" && settings?.timezone) {
    return settings.timezone;
  }
  return getBrowserTimeZone();
}

export function resolvePollTimeZone(pollTimeZone) {
  return pollTimeZone || getBrowserTimeZone();
}

export function shouldAutoConvertPollTimes(settings) {
  return settings?.autoConvertPollTimes !== false;
}

export function resolveDisplayTimeZone({ pollTimeZone, settings }) {
  const pollZone = resolvePollTimeZone(pollTimeZone);
  if (shouldAutoConvertPollTimes(settings)) {
    return resolveUserTimeZone(settings) || pollZone;
  }
  return pollZone;
}

export function shouldShowTimeZone(settings) {
  if (!shouldAutoConvertPollTimes(settings)) return true;
  return settings?.hideTimeZone !== true;
}

export function toDisplayDate(value, timeZone) {
  const date = toDate(value);
  if (!date) return null;
  const targetZone = timeZone || getBrowserTimeZone();
  const browserZone = getBrowserTimeZone();
  if (targetZone === browserZone) {
    return date;
  }
  return toZonedTime(date, targetZone);
}

export function getTimeZoneAbbr(value, timeZone) {
  const date = toDate(value) || new Date();
  const targetZone = timeZone || getBrowserTimeZone();

  try {
    const tzName = getIntlTimeZoneName(date, targetZone, "short");
    if (tzName) {
      return tzName.replace(/\s+/g, " ").trim();
    }
  } catch (err) {
    // ignore and fall back
  }

  if (targetZone === "UTC" || targetZone === "Etc/UTC") return "UTC";
  return "UTC";
}

export function formatZoned(date, timeZone, pattern, options = {}) {
  const targetZone = timeZone || getBrowserTimeZone();
  const value = toDate(date);
  if (!value) return "";
  const base = formatInTimeZone(value, targetZone, pattern);
  const showTimeZone = options.showTimeZone !== false;
  const abbr = showTimeZone ? getTimeZoneAbbr(value, targetZone) : "";
  return abbr ? `${base} ${abbr}` : base;
}

export function formatZonedTime(date, timeZone, pattern = "h:mm a", options = {}) {
  return formatZoned(date, timeZone, pattern, options);
}

export function formatZonedDate(date, timeZone, pattern = "MMM d, yyyy", options = {}) {
  return formatZoned(date, timeZone, pattern, options);
}

export function formatZonedDateTime(date, timeZone, pattern = "MMM d, yyyy · h:mm a", options = {}) {
  return formatZoned(date, timeZone, pattern, options);
}

export function formatZonedTimeRange({
  start,
  end,
  timeZone,
  startPattern = "h:mm a",
  endPattern = "h:mm a",
  showTimeZone = true,
}) {
  const targetZone = timeZone || getBrowserTimeZone();
  const startDate = toDate(start);
  if (!startDate) return "";
  const endDate = toDate(end);
  const startLabel = formatInTimeZone(startDate, targetZone, startPattern);
  const endLabel = endDate ? formatInTimeZone(endDate, targetZone, endPattern) : null;
  const abbr = showTimeZone ? getTimeZoneAbbr(startDate, targetZone) : "";

  if (!endLabel) {
    return abbr ? `${startLabel} ${abbr}` : startLabel;
  }

  return abbr ? `${startLabel} - ${endLabel} ${abbr}` : `${startLabel} - ${endLabel}`;
}

export function formatZonedDateTimeRange({
  start,
  end,
  timeZone,
  startPattern = "MMM d, yyyy · h:mm a",
  endPattern = "h:mm a",
  showTimeZone = true,
}) {
  const targetZone = timeZone || getBrowserTimeZone();
  const startDate = toDate(start);
  if (!startDate) return "";
  const endDate = toDate(end);
  const startLabel = formatInTimeZone(startDate, targetZone, startPattern);
  const endLabel = endDate ? formatInTimeZone(endDate, targetZone, endPattern) : null;
  const abbr = showTimeZone ? getTimeZoneAbbr(startDate, targetZone) : "";

  if (!endLabel) {
    return abbr ? `${startLabel} ${abbr}` : startLabel;
  }

  return abbr ? `${startLabel} - ${endLabel} ${abbr}` : `${startLabel} - ${endLabel}`;
}
