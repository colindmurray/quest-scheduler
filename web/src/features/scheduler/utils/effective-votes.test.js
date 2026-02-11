import { describe, expect, test } from "vitest";
import { buildEffectiveTallies, buildUserBlockInfo } from "./effective-votes";

describe("buildEffectiveTallies", () => {
  test("includes votes when autoBlockConflicts is disabled", () => {
    const schedulerId = "sched-open";
    const slots = [
      { id: "slot1", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
    ];
    const voteDocs = [
      {
        id: "user1",
        userEmail: "u1@example.com",
        userAvatar: null,
        noTimesWork: false,
        votes: { slot1: "PREFERRED" },
      },
    ];
    const profilesById = {
      user1: {
        autoBlockConflicts: false,
        busyWindows: [
          {
            startUtc: "2026-02-10T21:00:00.000Z",
            endUtc: "2026-02-10T23:00:00.000Z",
            sourceSchedulerId: "other",
            priorityAtMs: 1,
          },
        ],
      },
    };

    const { tallies } = buildEffectiveTallies({
      schedulerId,
      schedulerStatus: "OPEN",
      slots,
      voteDocs,
      profilesById,
    });

    expect(tallies.slot1).toEqual({ feasible: 1, preferred: 1 });
  });

  test("excludes votes that overlap a user's busy windows when autoBlockConflicts is enabled", () => {
    const schedulerId = "sched-open";
    const slots = [
      {
        id: "slot1",
        start: "2026-02-10T20:00:00.000Z",
        end: "2026-02-10T22:00:00.000Z",
      },
    ];
    const voteDocs = [
      {
        id: "user1",
        userEmail: "u1@example.com",
        userAvatar: null,
        noTimesWork: false,
        votes: { slot1: "PREFERRED" },
      },
      {
        id: "user2",
        userEmail: "u2@example.com",
        userAvatar: null,
        noTimesWork: false,
        votes: { slot1: "FEASIBLE" },
      },
    ];
    const profilesById = {
      user1: {
        autoBlockConflicts: true,
        busyWindows: [
          {
            startUtc: "2026-02-10T21:00:00.000Z",
            endUtc: "2026-02-10T23:00:00.000Z",
            sourceSchedulerId: "other",
            priorityAtMs: 1,
          },
        ],
      },
      user2: { autoBlockConflicts: false, busyWindows: [] },
    };

    const { tallies } = buildEffectiveTallies({
      schedulerId,
      schedulerStatus: "OPEN",
      slots,
      voteDocs,
      profilesById,
    });

    expect(tallies.slot1).toEqual({ feasible: 1, preferred: 0 });
  });

  test("excludes votes for FINALIZED polls when blocked by an earlier finalized session", () => {
    const schedulerId = "sched-finalized-later";
    const slots = [
      { id: "slot1", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
    ];
    const voteDocs = [
      { id: "user1", userEmail: "u1@example.com", userAvatar: null, noTimesWork: false, votes: { slot1: "FEASIBLE" } },
    ];
    const profilesById = {
      user1: {
        autoBlockConflicts: true,
        busyWindows: [
          {
            startUtc: "2026-02-10T21:00:00.000Z",
            endUtc: "2026-02-10T23:00:00.000Z",
            sourceSchedulerId: "sched-finalized-earlier",
            priorityAtMs: 1000,
          },
        ],
      },
    };

    const { tallies } = buildEffectiveTallies({
      schedulerId,
      schedulerStatus: "FINALIZED",
      pollPriorityAtMs: 2000,
      slots,
      voteDocs,
      profilesById,
    });

    expect(tallies.slot1).toBe(undefined);
  });

  test("does not exclude votes for FINALIZED polls when the blocking session is later priority", () => {
    const schedulerId = "sched-finalized-earlier";
    const slots = [
      { id: "slot1", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
    ];
    const voteDocs = [
      { id: "user1", userEmail: "u1@example.com", userAvatar: null, noTimesWork: false, votes: { slot1: "FEASIBLE" } },
    ];
    const profilesById = {
      user1: {
        autoBlockConflicts: true,
        busyWindows: [
          {
            startUtc: "2026-02-10T21:00:00.000Z",
            endUtc: "2026-02-10T23:00:00.000Z",
            sourceSchedulerId: "sched-finalized-later",
            priorityAtMs: 3000,
          },
        ],
      },
    };

    const { tallies } = buildEffectiveTallies({
      schedulerId,
      schedulerStatus: "FINALIZED",
      pollPriorityAtMs: 2000,
      slots,
      voteDocs,
      profilesById,
    });

    expect(tallies.slot1).toEqual({ feasible: 1, preferred: 0 });
  });

  test("excludes vote docs with noTimesWork enabled from tallies", () => {
    const schedulerId = "sched-open";
    const slots = [
      { id: "slot1", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
    ];
    const voteDocs = [
      { id: "user1", userEmail: "u1@example.com", userAvatar: null, noTimesWork: true, votes: { slot1: "PREFERRED" } },
    ];

    const { tallies } = buildEffectiveTallies({
      schedulerId,
      schedulerStatus: "OPEN",
      slots,
      voteDocs,
      profilesById: {},
    });

    expect(tallies.slot1).toBe(undefined);
  });
});

describe("buildUserBlockInfo", () => {
  test("returns blocking info per slot for the current user", () => {
    const schedulerId = "sched-open";
    const slots = [
      { id: "slot1", start: "2026-02-10T20:00:00.000Z", end: "2026-02-10T22:00:00.000Z" },
      { id: "slot2", start: "2026-02-11T20:00:00.000Z", end: "2026-02-11T22:00:00.000Z" },
    ];
    const userProfile = {
      autoBlockConflicts: true,
      busyWindows: [
        {
          startUtc: "2026-02-10T21:00:00.000Z",
          endUtc: "2026-02-10T23:00:00.000Z",
          sourceSchedulerId: "other",
          sourceWinningSlotId: "busy-slot",
          priorityAtMs: 1,
        },
      ],
    };

    const { infoBySlotId } = buildUserBlockInfo({
      schedulerId,
      schedulerStatus: "OPEN",
      slots,
      userProfile,
    });

    expect(infoBySlotId.slot1).toEqual(expect.objectContaining({ sourceSchedulerId: "other" }));
    expect(infoBySlotId.slot2).toBe(undefined);
  });
});
