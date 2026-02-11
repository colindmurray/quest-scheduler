import { describe, expect, test } from "vitest";
import { canUserCopyVotes } from "./copy-votes-eligibility";

describe("canUserCopyVotes", () => {
  test("returns false when there is no vote doc", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const slots = [
      { id: "s1", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
    ];
    expect(canUserCopyVotes({ slots, userVoteDoc: null, nowMs })).toBe(false);
  });

  test("returns false when the poll has no future slots", () => {
    const nowMs = Date.parse("2026-02-10T23:00:00.000Z");
    const slots = [
      { id: "s1", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
    ];
    const userVoteDoc = { noTimesWork: true, votes: {} };
    expect(canUserCopyVotes({ slots, userVoteDoc, nowMs })).toBe(false);
  });

  test("returns true when noTimesWork is true and there are future slots", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const slots = [
      { id: "s1", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
    ];
    const userVoteDoc = { noTimesWork: true, votes: {} };
    expect(canUserCopyVotes({ slots, userVoteDoc, nowMs })).toBe(true);
  });

  test("returns false when the user only voted on past-dated slots", () => {
    const nowMs = Date.parse("2026-02-10T23:00:00.000Z");
    const slots = [
      { id: "past", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
      { id: "future", start: "2026-02-11T20:00:00.000Z", end: "2026-02-11T22:00:00.000Z" },
    ];
    const userVoteDoc = { noTimesWork: false, votes: { past: "PREFERRED" } };
    expect(canUserCopyVotes({ slots, userVoteDoc, nowMs })).toBe(false);
  });

  test("returns true when the user has at least one future-dated vote", () => {
    const nowMs = Date.parse("2026-02-10T23:00:00.000Z");
    const slots = [
      { id: "past", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
      { id: "future", start: "2026-02-11T20:00:00.000Z", end: "2026-02-11T22:00:00.000Z" },
    ];
    const userVoteDoc = { noTimesWork: false, votes: { past: "FEASIBLE", future: "PREFERRED" } };
    expect(canUserCopyVotes({ slots, userVoteDoc, nowMs })).toBe(true);
  });

  test("ignores non-attending vote values when determining eligibility", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const slots = [
      { id: "s1", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
    ];
    const userVoteDoc = { noTimesWork: false, votes: { s1: null } };
    expect(canUserCopyVotes({ slots, userVoteDoc, nowMs })).toBe(false);
  });
});

