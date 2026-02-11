import { describe, expect, test } from "vitest";
import { buildCopyVotePlan } from "./copy-votes";

describe("buildCopyVotePlan", () => {
  test("marks destination slots as none when there is no overlap", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const sourceSlots = [
      {
        id: "s1",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
    ];
    const destinationSlots = [
      {
        id: "d1",
        start: "2026-02-11T20:00:00.000Z",
        end: "2026-02-11T22:00:00.000Z",
      },
    ];

    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes: { s1: "PREFERRED" },
      destinationSlots,
      nowMs,
    });

    expect(plan.prefilledVotes).toEqual({});
    expect(plan.matchInfoBySlotId.d1.type).toBe("none");
  });

  test("filters out past-dated destination slots", () => {
    const nowMs = Date.parse("2026-02-10T22:01:00.000Z");
    const sourceSlots = [
      {
        id: "s1",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
    ];
    const destinationSlots = [
      {
        id: "past",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
      {
        id: "future",
        start: "2026-02-11T20:00:00.000Z",
        end: "2026-02-11T22:00:00.000Z",
      },
    ];

    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes: { s1: "PREFERRED" },
      destinationSlots,
      nowMs,
    });

    expect(plan.futureDestinationSlots.map((s) => s.id)).toEqual(["future"]);
    expect(plan.matchInfoBySlotId.past).toBe(undefined);
  });

  test("ignores past-dated source votes", () => {
    const nowMs = Date.parse("2026-02-10T22:01:00.000Z");
    const sourceSlots = [
      {
        id: "s1",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
    ];
    const destinationSlots = [
      {
        id: "d1",
        start: "2026-02-10T21:00:00.000Z",
        end: "2026-02-10T23:00:00.000Z",
      },
    ];

    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes: { s1: "PREFERRED" },
      destinationSlots,
      nowMs,
    });

    expect(plan.sourceWindows).toEqual([]);
    expect(plan.prefilledVotes).toEqual({});
    expect(plan.matchInfoBySlotId.d1.type).toBe("none");
  });

  test("copies votes when destination slot fully contained in a source voted window", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const sourceSlots = [
      {
        id: "s1",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
    ];
    const destinationSlots = [
      {
        id: "d1",
        start: "2026-02-10T20:30:00.000Z",
        end: "2026-02-10T21:30:00.000Z",
      },
    ];

    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes: { s1: "PREFERRED" },
      destinationSlots,
      nowMs,
    });

    expect(plan.prefilledVotes).toEqual({ d1: "PREFERRED" });
    expect(plan.matchInfoBySlotId.d1.type).toBe("copied");
  });

  test("chooses the smallest containing source window when multiple windows contain the destination", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const sourceSlots = [
      {
        id: "small",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
      {
        id: "large",
        start: "2026-02-10T19:00:00.000Z",
        end: "2026-02-10T23:00:00.000Z",
      },
    ];
    const destinationSlots = [
      {
        id: "d1",
        start: "2026-02-10T20:30:00.000Z",
        end: "2026-02-10T21:30:00.000Z",
      },
    ];

    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes: { small: "PREFERRED", large: "FEASIBLE" },
      destinationSlots,
      nowMs,
    });

    expect(plan.prefilledVotes).toEqual({ d1: "PREFERRED" });
    expect(plan.matchInfoBySlotId.d1.sourceSlotId).toBe("small");
  });

  test("copies votes and warns when destination extends past source end", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const sourceSlots = [
      {
        id: "s1",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
    ];
    const destinationSlots = [
      {
        id: "d1",
        start: "2026-02-10T21:00:00.000Z",
        end: "2026-02-10T23:00:00.000Z",
      },
    ];

    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes: { s1: "FEASIBLE" },
      destinationSlots,
      nowMs,
    });

    expect(plan.prefilledVotes).toEqual({ d1: "FEASIBLE" });
    expect(plan.matchInfoBySlotId.d1.type).toBe("copied-extends");
    expect(plan.matchInfoBySlotId.d1.overageMinutes).toBe(60);
  });

  test("includes an overageLabel for copy-extends warnings", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const sourceSlots = [
      {
        id: "s1",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
    ];
    const destinationSlots = [
      {
        id: "d1",
        start: "2026-02-10T21:00:00.000Z",
        end: "2026-02-10T23:05:00.000Z",
      },
    ];

    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes: { s1: "PREFERRED" },
      destinationSlots,
      nowMs,
    });

    expect(plan.matchInfoBySlotId.d1.type).toBe("copied-extends");
    expect(plan.matchInfoBySlotId.d1.overageMinutes).toBe(65);
    expect(plan.matchInfoBySlotId.d1.overageLabel).toBe("1h 5m");
  });

  test("chooses the lowest overage source window when destination extends past multiple overlapping source windows", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const sourceSlots = [
      {
        id: "short",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T21:30:00.000Z",
      },
      {
        id: "long",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
    ];
    const destinationSlots = [
      {
        id: "d1",
        start: "2026-02-10T21:00:00.000Z",
        end: "2026-02-10T22:30:00.000Z",
      },
    ];

    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes: { short: "PREFERRED", long: "FEASIBLE" },
      destinationSlots,
      nowMs,
    });

    // Destination start is within both windows; choose the one with the least overage (the longer window).
    expect(plan.prefilledVotes).toEqual({ d1: "FEASIBLE" });
    expect(plan.matchInfoBySlotId.d1.type).toBe("copied-extends");
    expect(plan.matchInfoBySlotId.d1.sourceSlotId).toBe("long");
  });

  test("does not copy votes when destination starts before source but overlaps", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const sourceSlots = [
      {
        id: "s1",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
    ];
    const destinationSlots = [
      {
        id: "d1",
        start: "2026-02-10T19:30:00.000Z",
        end: "2026-02-10T20:30:00.000Z",
      },
    ];

    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes: { s1: "PREFERRED" },
      destinationSlots,
      nowMs,
    });

    expect(plan.prefilledVotes).toEqual({});
    expect(plan.matchInfoBySlotId.d1.type).toBe("overlap-review");
    expect(plan.matchInfoBySlotId.d1.sourceVote).toBe("PREFERRED");
  });

  test("does not copy votes when the source vote doc is noTimesWork", () => {
    const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const sourceSlots = [
      {
        id: "s1",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
    ];
    const destinationSlots = [
      {
        id: "d1",
        start: "2026-02-10T20:30:00.000Z",
        end: "2026-02-10T21:30:00.000Z",
      },
    ];

    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes: { s1: "PREFERRED" },
      sourceNoTimesWork: true,
      destinationSlots,
      nowMs,
    });

    expect(plan.sourceWindows).toEqual([]);
    expect(plan.prefilledVotes).toEqual({});
    expect(plan.matchInfoBySlotId.d1.type).toBe("none");
  });
});
