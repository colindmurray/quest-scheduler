import { describe, expect, it } from "vitest";
import { formatSlotRange, getPollStatusLabel, getSlotRange } from "./poll-card-utils";

describe("poll-card-utils", () => {
  it("returns null slot range for empty input", () => {
    expect(getSlotRange()).toBeNull();
    expect(getSlotRange([])).toBeNull();
  });

  it("builds a slot range from earliest to latest slot", () => {
    const range = getSlotRange([
      { start: "2026-01-05T12:00:00Z" },
      { start: "2026-01-03T12:00:00Z" },
      { start: "2026-01-10T12:00:00Z" },
    ]);

    expect(range?.start.toISOString()).toBe("2026-01-03T12:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-01-10T12:00:00.000Z");
  });

  it("formats a single-day range as a single date", () => {
    const range = getSlotRange([
      { start: "2026-01-05T12:00:00Z" },
      { start: "2026-01-05T18:00:00Z" },
    ]);

    expect(formatSlotRange(range, "UTC")).toBe("Jan 5, 2026 UTC");
  });

  it("formats a multi-day range within the same year", () => {
    const range = getSlotRange([
      { start: "2026-01-05T12:00:00Z" },
      { start: "2026-03-10T12:00:00Z" },
    ]);

    expect(formatSlotRange(range, "UTC")).toBe("Jan 5 - Mar 10, 2026 UTC");
  });

  it("formats a multi-year range with both years", () => {
    const range = getSlotRange([
      { start: "2025-12-31T12:00:00Z" },
      { start: "2026-01-02T12:00:00Z" },
    ]);

    expect(formatSlotRange(range, "UTC")).toBe("Dec 31, 2025 - Jan 2, 2026 UTC");
  });

  it("returns the right status label", () => {
    expect(getPollStatusLabel({ status: "OPEN", allVotesIn: false, isCancelled: false })).toBe(
      "Pending votes"
    );
    expect(getPollStatusLabel({ status: "OPEN", allVotesIn: true, isCancelled: false })).toBe(
      "All votes in"
    );
    expect(getPollStatusLabel({ status: "FINALIZED", allVotesIn: false, isCancelled: false })).toBe(
      "Finalized"
    );
    expect(getPollStatusLabel({ status: "FINALIZED", allVotesIn: false, isCancelled: true })).toBe(
      "Cancelled"
    );
  });
});
