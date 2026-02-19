import { describe, expect, test } from "vitest";
import { hasSubmittedSchedulerVote } from "./vote-utils";

describe("hasSubmittedSchedulerVote", () => {
  test("returns false for missing docs", () => {
    expect(hasSubmittedSchedulerVote(null)).toBe(false);
    expect(hasSubmittedSchedulerVote(undefined)).toBe(false);
  });

  test("returns true for noTimesWork votes", () => {
    expect(hasSubmittedSchedulerVote({ noTimesWork: true, votes: {} })).toBe(true);
  });

  test("returns true when at least one attending slot vote exists", () => {
    expect(
      hasSubmittedSchedulerVote({
        noTimesWork: false,
        votes: { slot1: "FEASIBLE" },
      })
    ).toBe(true);
    expect(
      hasSubmittedSchedulerVote({
        noTimesWork: false,
        votes: { slot1: "PREFERRED" },
      })
    ).toBe(true);
  });

  test("returns false for empty or non-attending vote maps", () => {
    expect(hasSubmittedSchedulerVote({ noTimesWork: false, votes: {} })).toBe(false);
    expect(
      hasSubmittedSchedulerVote({
        noTimesWork: false,
        votes: { slot1: null },
      })
    ).toBe(false);
  });
});
