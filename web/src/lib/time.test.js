import { describe, expect, it } from "vitest";
import {
  formatZonedTimeRange,
  getTimeZoneAbbr,
  resolveDisplayTimeZone,
  shouldShowTimeZone,
} from "./time";

describe("time utils", () => {
  it("returns a 3-letter abbreviation for UTC", () => {
    const label = getTimeZoneAbbr(new Date("2026-01-01T12:00:00Z"), "UTC");
    expect(label).toBe("UTC");
  });

  it("does not collapse Pacific/Auckland into plain GMT", () => {
    const label = getTimeZoneAbbr(new Date("2026-01-01T12:00:00Z"), "Pacific/Auckland");
    expect(label).not.toBe("GMT");
    expect(label).toMatch(/^(NZDT|NZST|GMT[+-]\d{1,2}(?::\d{2})?)$/);
  });

  it("formats a time range with timezone", () => {
    const label = formatZonedTimeRange({
      start: "2026-01-01T12:00:00Z",
      end: "2026-01-01T13:00:00Z",
      timeZone: "UTC",
    });
    expect(label).toContain("UTC");
    expect(label).toContain("12:00");
    expect(label).toContain("1:00");
  });

  it("prefers user timezone when auto-convert is enabled", () => {
    const settings = {
      timezoneMode: "manual",
      timezone: "America/New_York",
      autoConvertPollTimes: true,
    };
    const display = resolveDisplayTimeZone({
      pollTimeZone: "America/Chicago",
      settings,
    });
    expect(display).toBe("America/New_York");
  });

  it("uses poll timezone when auto-convert is disabled", () => {
    const settings = {
      timezoneMode: "manual",
      timezone: "America/New_York",
      autoConvertPollTimes: false,
    };
    const display = resolveDisplayTimeZone({
      pollTimeZone: "America/Chicago",
      settings,
    });
    expect(display).toBe("America/Chicago");
  });

  it("hides timezone when auto-convert is enabled and hideTimeZone is true", () => {
    const settings = {
      autoConvertPollTimes: true,
      hideTimeZone: true,
    };
    expect(shouldShowTimeZone(settings)).toBe(false);
  });
});
