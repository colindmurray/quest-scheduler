const GOOGLE_CALENDAR_EVENT_URL_BASE = "https://calendar.google.com/calendar/event?eid=";

function encodeBase64(value) {
  if (typeof globalThis?.btoa === "function") {
    return globalThis.btoa(value);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }
  return null;
}

export function buildGoogleCalendarEventUrl({ calendarId, eventId } = {}) {
  if (!calendarId || !eventId) {
    return null;
  }

  const encoded = encodeBase64(`${calendarId}/${eventId}`);
  if (!encoded) {
    return null;
  }

  return `${GOOGLE_CALENDAR_EVENT_URL_BASE}${encoded}`;
}

