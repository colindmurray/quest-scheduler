import { describe, expect, test } from "vitest";
import { hasSubmittedSchedulerVote } from "./vote-utils";

describe("hasSubmittedSchedulerVote", () => {
  test("returns false for missing vote docs", () => {
    expect(hasSubmittedSchedulerVote(null)).toBe(false);
    expect(hasSubmittedSchedulerVote(undefined)).toBe(false);
  });

  test("returns true when noTimesWork is true", () => {
    expect(hasSubmittedSchedulerVote({ noTimesWork: true, votes: {} })).toBe(true);
  });

  test("returns true when at least one attending vote exists", () => {
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

  test("returns false when votes map is empty or non-attending", () => {
    expect(hasSubmittedSchedulerVote({ noTimesWork: false, votes: {} })).toBe(false);
    expect(
      hasSubmittedSchedulerVote({
        noTimesWork: false,
        votes: { slot1: null },
      })
    ).toBe(false);
  });
});
