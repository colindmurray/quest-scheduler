import { describe, expect, it } from "vitest";
import { getTimeZoneAbbr } from "./time-utils";

describe("discord time utils", () => {
  it("returns UTC for UTC timezone", () => {
    const label = getTimeZoneAbbr(new Date("2026-01-01T12:00:00Z"), "UTC");
    expect(label).toBe("UTC");
  });

  it("does not collapse Pacific/Auckland into plain GMT", () => {
    const label = getTimeZoneAbbr(new Date("2026-01-01T12:00:00Z"), "Pacific/Auckland");
    expect(label).not.toBe("GMT");
    expect(label).toMatch(/^(NZDT|NZST|GMT[+-]\d{1,2}(?::\d{2})?)$/);
  });
});
