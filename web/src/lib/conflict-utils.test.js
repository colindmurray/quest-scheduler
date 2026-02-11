import { describe, expect, test } from "vitest";
import { findBlockingWindow, formatOverageMinutes, isUserBlockedForSlot } from "./conflict-utils";

describe("conflict-utils", () => {
  test("formatOverageMinutes formats minutes and hours", () => {
    expect(formatOverageMinutes(0)).toBe("0 min");
    expect(formatOverageMinutes(5)).toBe("5 min");
    expect(formatOverageMinutes(60)).toBe("1h");
    expect(formatOverageMinutes(61)).toBe("1h 1m");
    expect(formatOverageMinutes(125)).toBe("2h 5m");
  });

  test("blocks overlapping windows for OPEN polls", () => {
    const slotStartMs = Date.parse("2026-02-09T20:00:00.000Z");
    const slotEndMs = Date.parse("2026-02-09T22:00:00.000Z");
    const busyWindows = [
      {
        startUtc: "2026-02-09T21:00:00.000Z",
        endUtc: "2026-02-09T23:00:00.000Z",
        sourceSchedulerId: "schedA",
        priorityAtMs: 1000,
      },
    ];

    expect(
      isUserBlockedForSlot({
        autoBlockConflicts: true,
        busyWindows,
        slotStartMs,
        slotEndMs,
        currentSchedulerId: "schedB",
        currentStatus: "OPEN",
      })
    ).toBe(true);
  });

  test("does not block a FINALIZED poll by later priority windows", () => {
    const slotStartMs = Date.parse("2026-02-09T20:00:00.000Z");
    const slotEndMs = Date.parse("2026-02-09T22:00:00.000Z");
    const busyWindows = [
      {
        startUtc: "2026-02-09T20:30:00.000Z",
        endUtc: "2026-02-09T21:30:00.000Z",
        sourceSchedulerId: "schedA",
        priorityAtMs: 2000,
      },
    ];

    const blocker = findBlockingWindow({
      busyWindows,
      slotStartMs,
      slotEndMs,
      currentSchedulerId: "schedB",
      currentStatus: "FINALIZED",
      currentPriorityAtMs: 1000,
    });
    expect(blocker).toBe(null);
  });

  test("blocks a FINALIZED poll by earlier priority windows", () => {
    const slotStartMs = Date.parse("2026-02-09T20:00:00.000Z");
    const slotEndMs = Date.parse("2026-02-09T22:00:00.000Z");
    const busyWindows = [
      {
        startUtc: "2026-02-09T20:30:00.000Z",
        endUtc: "2026-02-09T21:30:00.000Z",
        sourceSchedulerId: "schedA",
        priorityAtMs: 500,
      },
    ];

    const blocker = findBlockingWindow({
      busyWindows,
      slotStartMs,
      slotEndMs,
      currentSchedulerId: "schedB",
      currentStatus: "FINALIZED",
      currentPriorityAtMs: 1000,
    });
    expect(blocker?.sourceSchedulerId).toBe("schedA");
  });

  test("does not block against a busy window from the same scheduler", () => {
    const slotStartMs = Date.parse("2026-02-09T20:00:00.000Z");
    const slotEndMs = Date.parse("2026-02-09T22:00:00.000Z");
    const busyWindows = [
      {
        startUtc: "2026-02-09T21:00:00.000Z",
        endUtc: "2026-02-09T23:00:00.000Z",
        sourceSchedulerId: "schedA",
        priorityAtMs: 1000,
      },
    ];

    expect(
      findBlockingWindow({
        busyWindows,
        slotStartMs,
        slotEndMs,
        currentSchedulerId: "schedA",
        currentStatus: "OPEN",
      })
    ).toBe(null);
  });
});
