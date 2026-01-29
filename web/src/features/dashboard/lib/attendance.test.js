import { describe, expect, test } from "vitest";
import { buildAttendanceSummary } from "./attendance";

describe("buildAttendanceSummary", () => {
  test("returns empty arrays when not finalized", () => {
    const summary = buildAttendanceSummary({
      status: "OPEN",
      winningSlotId: "slot-1",
      voteDocs: [
        { id: "user-1", userEmail: "user@example.com", votes: { "slot-1": "FEASIBLE" } },
      ],
      participantEmailById: new Map(),
    });

    expect(summary).toEqual({ confirmed: [], unavailable: [] });
  });

  test("returns empty arrays when finalized but missing winner", () => {
    const summary = buildAttendanceSummary({
      status: "FINALIZED",
      winningSlotId: null,
      voteDocs: [
        { id: "user-1", userEmail: "user@example.com", votes: { "slot-1": "FEASIBLE" } },
      ],
      participantEmailById: new Map(),
    });

    expect(summary).toEqual({ confirmed: [], unavailable: [] });
  });

  test("classifies confirmed and unavailable voters with legacy vote shapes", () => {
    const participantEmailById = new Map([["user-2", "member@example.com"]]);
    const summary = buildAttendanceSummary({
      status: "FINALIZED",
      winningSlotId: "slot-1",
      participantEmailById,
      voteDocs: [
        { id: "user-1", userEmail: "Feasible@Example.com", votes: { "slot-1": "feasible" } },
        { id: "user-2", votes: { "slot-1": "PREFERRED" } },
        { id: "user-3", userEmail: "legacy@example.com", votes: { "slot-1": true } },
        { id: "user-4", userEmail: "obj@example.com", votes: { "slot-1": { feasible: true } } },
        { id: "user-5", userEmail: "prefobj@example.com", votes: { "slot-1": { preferred: true } } },
        { id: "user-6", userEmail: "novote@example.com", votes: { other: "FEASIBLE" } },
        { id: "user-7", userEmail: "nope@example.com", noTimesWork: true, votes: { "slot-1": "PREFERRED" } },
      ],
    });

    expect(summary.confirmed).toEqual(
      expect.arrayContaining([
        "feasible@example.com",
        "member@example.com",
        "legacy@example.com",
        "obj@example.com",
        "prefobj@example.com",
      ])
    );
    expect(summary.unavailable).toEqual(
      expect.arrayContaining(["novote@example.com", "nope@example.com"])
    );
    expect(summary.confirmed).toHaveLength(5);
    expect(summary.unavailable).toHaveLength(2);
  });

  test("prefers confirmed when duplicate emails exist", () => {
    const summary = buildAttendanceSummary({
      status: "FINALIZED",
      winningSlotId: "slot-1",
      participantEmailById: new Map(),
      voteDocs: [
        { id: "dup-1", userEmail: "dup@example.com", noTimesWork: true },
        { id: "dup-2", userEmail: "dup@example.com", votes: { "slot-1": "FEASIBLE" } },
      ],
    });

    expect(summary.confirmed).toEqual(["dup@example.com"]);
    expect(summary.unavailable).toEqual([]);
  });

  test("handles missing participantEmailById safely", () => {
    const summary = buildAttendanceSummary({
      status: "FINALIZED",
      winningSlotId: "slot-1",
      voteDocs: [
        { id: "user-1", userEmail: "user@example.com", votes: { "slot-1": "FEASIBLE" } },
        { id: "user-2", votes: { "slot-1": "PREFERRED" } },
      ],
    });

    expect(summary.confirmed).toEqual(["user@example.com"]);
    expect(summary.unavailable).toEqual([]);
  });
});
