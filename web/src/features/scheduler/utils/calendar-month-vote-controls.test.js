import { describe, expect, test } from "vitest";
import {
  formatCompactDuration,
  getNextCycleVoteValue,
} from "./calendar-month-vote-controls";

describe("formatCompactDuration", () => {
  test("formats minute-only durations", () => {
    expect(formatCompactDuration(15)).toBe("15m");
    expect(formatCompactDuration(59)).toBe("59m");
  });

  test("formats hour-only durations", () => {
    expect(formatCompactDuration(60)).toBe("1h");
    expect(formatCompactDuration(180)).toBe("3h");
  });

  test("formats mixed hour-minute durations", () => {
    expect(formatCompactDuration(90)).toBe("1h30m");
    expect(formatCompactDuration(185)).toBe("3h5m");
  });

  test("handles non-finite and negative values", () => {
    expect(formatCompactDuration(-5)).toBe("0m");
    expect(formatCompactDuration(Number.NaN)).toBe("0m");
    expect(formatCompactDuration(undefined)).toBe("0m");
  });
});

describe("getNextCycleVoteValue", () => {
  test("cycles none to feasible", () => {
    expect(getNextCycleVoteValue(null)).toBe("FEASIBLE");
    expect(getNextCycleVoteValue(undefined)).toBe("FEASIBLE");
  });

  test("cycles feasible to preferred", () => {
    expect(getNextCycleVoteValue("FEASIBLE")).toBe("PREFERRED");
    expect(getNextCycleVoteValue("feasible")).toBe("PREFERRED");
  });

  test("cycles preferred to none", () => {
    expect(getNextCycleVoteValue("PREFERRED")).toBe(null);
    expect(getNextCycleVoteValue("preferred")).toBe(null);
  });
});
