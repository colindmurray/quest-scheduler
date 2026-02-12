const DEFAULT_TIME_ZONE = "UTC";

function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function resolveTimeZone(timeZone) {
  return timeZone || DEFAULT_TIME_ZONE;
}

function getIntlTimeZoneName(date, timeZone, timeZoneName) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName,
  }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value || null;
}

function getTimeZoneAbbr(date, timeZone) {
  const value = toDate(date) || new Date();
  const zone = resolveTimeZone(timeZone);

  try {
    const tzName = getIntlTimeZoneName(value, zone, "short");
    if (tzName) {
      return tzName.replace(/\s+/g, " ").trim();
    }
  } catch (err) {
    // ignore and fall back
  }

  if (zone === "UTC" || zone === "Etc/UTC") return "UTC";
  return "UTC";
}

function formatDateTime(iso, timeZone) {
  const date = toDate(iso);
  if (!date) return null;
  const zone = resolveTimeZone(timeZone);
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: zone,
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  });
  const abbr = getTimeZoneAbbr(date, zone);
  return `${datePart} · ${timePart}${abbr ? ` ${abbr}` : ""}`;
}

function formatDateTimeRange(startIso, endIso, timeZone) {
  const start = toDate(startIso);
  if (!start) return null;
  const end = toDate(endIso);
  const zone = resolveTimeZone(timeZone);
  const dateOptions = { month: "short", day: "numeric", year: "numeric", timeZone: zone };
  const timeOptions = { hour: "numeric", minute: "2-digit", timeZone: zone };
  const startDate = start.toLocaleDateString("en-US", dateOptions);
  const startTime = start.toLocaleTimeString("en-US", timeOptions);
  const abbr = getTimeZoneAbbr(start, zone);

  if (!end) {
    return `${startDate} · ${startTime}${abbr ? ` ${abbr}` : ""}`;
  }

  const endDate = end.toLocaleDateString("en-US", dateOptions);
  const endTime = end.toLocaleTimeString("en-US", timeOptions);
  const endLabel = startDate === endDate ? endTime : `${endDate} · ${endTime}`;
  return `${startDate} · ${startTime} - ${endLabel}${abbr ? ` ${abbr}` : ""}`;
}

module.exports = {
  resolveTimeZone,
  getTimeZoneAbbr,
  formatDateTime,
  formatDateTimeRange,
};
