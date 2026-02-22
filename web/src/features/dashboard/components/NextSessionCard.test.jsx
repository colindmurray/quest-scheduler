// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { buildGoogleCalendarEventUrl } from "../../../lib/google-calendar";
import { NextSessionCard } from "./NextSessionCard";

const safeNavigateMock = vi.fn();

vi.mock("../../../hooks/useSafeNavigate", () => ({
  useSafeNavigate: () => safeNavigateMock,
}));

vi.mock("../../../hooks/useUserProfiles", () => ({
  useUserProfiles: () => ({
    enrichUsers: (emails) =>
      (emails || []).map((email) =>
        typeof email === "string" ? { email } : email
      ),
  }),
}));

function decodeBase64(value) {
  if (typeof globalThis?.atob === "function") {
    return globalThis.atob(value);
  }
  return Buffer.from(value, "base64").toString("utf8");
}

function extractCalendarHref(markup) {
  const hrefMatch = markup.match(/href=\"([^\"]+)\"/);
  if (!hrefMatch) return null;
  return hrefMatch[1].replace(/&amp;/g, "&");
}

describe("buildGoogleCalendarEventUrl", () => {
  test("builds eid from base64(calendarId/eventId)", () => {
    const url = buildGoogleCalendarEventUrl({
      calendarId: "party@example.com",
      eventId: "abc123def456",
    });

    const eid = new URL(url).searchParams.get("eid");
    expect(decodeBase64(eid)).toBe("party@example.com/abc123def456");
  });

  test("returns null when calendarId or eventId is missing", () => {
    expect(
      buildGoogleCalendarEventUrl({
        calendarId: "party@example.com",
        eventId: null,
      })
    ).toBeNull();
    expect(
      buildGoogleCalendarEventUrl({
        calendarId: null,
        eventId: "abc123def456",
      })
    ).toBeNull();
    expect(buildGoogleCalendarEventUrl({})).toBeNull();
    expect(buildGoogleCalendarEventUrl()).toBeNull();
  });
});

describe("NextSessionCard", () => {
  beforeEach(() => {
    safeNavigateMock.mockReset();
  });

  test("renders Google Calendar link when calendar + event ids are present", () => {
    const markup = renderToStaticMarkup(
      <NextSessionCard
        scheduler={{
          id: "sched-1",
          title: "Weekly Session",
          googleCalendarId: "party@example.com",
          googleEventId: "abc123def456",
        }}
        winningSlot={{
          start: "2026-03-10T18:00:00.000Z",
          end: "2026-03-10T21:00:00.000Z",
        }}
      />
    );

    const href = extractCalendarHref(markup);
    const eid = new URL(href).searchParams.get("eid");
    expect(decodeBase64(eid)).toBe("party@example.com/abc123def456");
  });

  test("does not render Google Calendar link without calendarId", () => {
    const markup = renderToStaticMarkup(
      <NextSessionCard
        scheduler={{
          id: "sched-1",
          title: "Weekly Session",
          googleCalendarId: null,
          googleEventId: "abc123def456",
        }}
        winningSlot={{
          start: "2026-03-10T18:00:00.000Z",
          end: "2026-03-10T21:00:00.000Z",
        }}
      />
    );

    expect(markup).not.toContain(">Calendar</a>");
  });
});
