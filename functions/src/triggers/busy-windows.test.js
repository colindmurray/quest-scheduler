import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRequire } from "module";

let busyTriggers;

const userDocs = new Map();
let schedulerDocData;
let schedulerSlotsById;

describe("busy windows triggers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    userDocs.clear();
    schedulerDocData = {};
    schedulerSlotsById = {
      slot1: {
        start: "2026-03-01T20:00:00.000Z",
        end: "2026-03-01T22:00:00.000Z",
      },
      slot2: {
        start: "2026-03-02T20:00:00.000Z",
        end: "2026-03-02T22:00:00.000Z",
      },
    };

    const require = createRequire(import.meta.url);

    require.cache[require.resolve("firebase-functions/v2/firestore")] = {
      exports: {
        onDocumentWritten: (opts, handler) => {
          const fn = (event) => handler(event);
          fn.run = handler;
          return fn;
        },
      },
    };
    require.cache[require.resolve("firebase-functions")] = {
      exports: {
        logger: {
          warn: vi.fn(),
          info: vi.fn(),
          error: vi.fn(),
        },
      },
    };

    const votesDocs = [
      {
        id: "user1",
        data: () => ({
          noTimesWork: false,
          votes: { slot1: "FEASIBLE", slot2: "PREFERRED" },
        }),
      },
      { id: "user2", data: () => ({ noTimesWork: false, votes: { slot1: null } }) },
    ];

    const schedulerRef = {
      collection: vi.fn((name) => {
        if (name === "votes") {
          return { get: vi.fn(async () => ({ docs: votesDocs })) };
        }
        if (name === "slots") {
          return {
            doc: vi.fn((slotId) => ({
              get: vi.fn(async () => {
                const data = schedulerSlotsById[slotId] || null;
                if (!data) return { exists: false, data: () => ({}) };
                return { exists: true, data: () => data };
              }),
            })),
          };
        }
        return { get: vi.fn(async () => ({ docs: [] })) };
      }),
      get: vi.fn(async () => ({ exists: true, data: () => schedulerDocData })),
    };

    const usersPublicCollection = {
      doc: vi.fn((userId) => ({
        get: vi.fn(async () => {
          const data = userDocs.get(userId) || null;
          if (!data) return { exists: false, data: () => ({}) };
          return { exists: true, data: () => data };
        }),
        set: vi.fn(async (updates) => {
          const existing = userDocs.get(userId) || {};
          userDocs.set(userId, { ...existing, ...(updates || {}) });
        }),
      })),
    };

    const schedulersCollection = {
      doc: vi.fn(() => ({
        ...schedulerRef,
        get: vi.fn(async () => ({ exists: true, data: () => schedulerDocData })),
      })),
    };

    const firestoreDb = {
      collection: vi.fn((name) => {
        if (name === "usersPublic") return usersPublicCollection;
        if (name === "schedulers") return schedulersCollection;
        return { doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })) };
      }),
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => firestoreDb,
    };
    require.cache[require.resolve("firebase-admin")] = { exports: adminMock };

    busyTriggers = await import("./busy-windows");
  });

  test("scheduler FINALIZED adds busy windows for attending voters", async () => {
    const after = {
      status: "FINALIZED",
      winningSlotId: "slot1",
      finalizedAtMs: 1000,
      finalizedSlotPriorityAtMs: { slot1: 500 },
    };
    schedulerDocData = after;

    await busyTriggers.syncBusyWindowsOnSchedulerWrite.run({
      params: { schedulerId: "schedA" },
      data: {
        before: { data: () => ({ status: "OPEN", winningSlotId: null }) },
        after: { data: () => after },
      },
    });

    const user1 = userDocs.get("user1");
    const user2 = userDocs.get("user2");
    expect(user1.busyWindows).toEqual([
      expect.objectContaining({ sourceSchedulerId: "schedA", sourceWinningSlotId: "slot1" }),
    ]);
    expect(user2.busyWindows || []).toEqual([]);
  });

  test("scheduler OPEN removes busy windows for the scheduler", async () => {
    userDocs.set("user1", {
      busyWindows: [
        {
          startUtc: "2026-03-01T20:00:00.000Z",
          endUtc: "2026-03-01T22:00:00.000Z",
          sourceSchedulerId: "schedA",
          sourceWinningSlotId: "slot1",
          priorityAtMs: 500,
        },
      ],
    });

    await busyTriggers.syncBusyWindowsOnSchedulerWrite.run({
      params: { schedulerId: "schedA" },
      data: {
        before: { data: () => ({ status: "FINALIZED", winningSlotId: "slot1" }) },
        after: { data: () => ({ status: "OPEN", winningSlotId: null }) },
      },
    });

    expect(userDocs.get("user1").busyWindows || []).toEqual([]);
  });

  test("scheduler CANCELLED removes busy windows for the scheduler", async () => {
    userDocs.set("user1", {
      busyWindows: [
        {
          startUtc: "2026-03-01T20:00:00.000Z",
          endUtc: "2026-03-01T22:00:00.000Z",
          sourceSchedulerId: "schedA",
          sourceWinningSlotId: "slot1",
          priorityAtMs: 500,
        },
      ],
    });

    schedulerDocData = { status: "CANCELLED", winningSlotId: null };
    await busyTriggers.syncBusyWindowsOnSchedulerWrite.run({
      params: { schedulerId: "schedA" },
      data: {
        before: { data: () => ({ status: "FINALIZED", winningSlotId: "slot1" }) },
        after: { data: () => ({ status: "CANCELLED", winningSlotId: null }) },
      },
    });

    expect(userDocs.get("user1").busyWindows || []).toEqual([]);
  });

  test("scheduler FINALIZED updates busy windows when the winning slot changes", async () => {
    schedulerDocData = {
      status: "FINALIZED",
      winningSlotId: "slot2",
      finalizedAtMs: 1000,
      finalizedSlotPriorityAtMs: { slot2: 700 },
    };

    await busyTriggers.syncBusyWindowsOnSchedulerWrite.run({
      params: { schedulerId: "schedA" },
      data: {
        before: { data: () => ({ status: "FINALIZED", winningSlotId: "slot1" }) },
        after: { data: () => schedulerDocData },
      },
    });

    const user1 = userDocs.get("user1");
    expect(user1.busyWindows).toEqual([
      expect.objectContaining({
        sourceSchedulerId: "schedA",
        sourceWinningSlotId: "slot2",
        startUtc: schedulerSlotsById.slot2.start,
        endUtc: schedulerSlotsById.slot2.end,
      }),
    ]);
  });

  test("vote deletion removes busy windows for that scheduler", async () => {
    userDocs.set("user1", {
      busyWindows: [
        {
          startUtc: "2026-03-01T20:00:00.000Z",
          endUtc: "2026-03-01T22:00:00.000Z",
          sourceSchedulerId: "schedA",
          sourceWinningSlotId: "slot1",
          priorityAtMs: 500,
        },
      ],
    });

    await busyTriggers.syncBusyWindowsOnVoteWrite.run({
      params: { schedulerId: "schedA", userId: "user1" },
      data: {
        before: { data: () => ({ votes: { slot1: "FEASIBLE" } }) },
        after: { data: () => null },
      },
    });

    expect(userDocs.get("user1").busyWindows || []).toEqual([]);
  });

  test("vote update removes busy windows when the voter is no longer attending the winning slot", async () => {
    schedulerDocData = { status: "FINALIZED", winningSlotId: "slot1", finalizedAtMs: 1000 };
    userDocs.set("user1", {
      busyWindows: [
        {
          startUtc: schedulerSlotsById.slot1.start,
          endUtc: schedulerSlotsById.slot1.end,
          sourceSchedulerId: "schedA",
          sourceWinningSlotId: "slot1",
          priorityAtMs: 500,
        },
      ],
    });

    await busyTriggers.syncBusyWindowsOnVoteWrite.run({
      params: { schedulerId: "schedA", userId: "user1" },
      data: {
        before: { data: () => ({ noTimesWork: false, votes: { slot1: "FEASIBLE" } }) },
        after: { data: () => ({ noTimesWork: true, votes: { slot1: "FEASIBLE" } }) },
      },
    });

    expect(userDocs.get("user1").busyWindows || []).toEqual([]);
  });
});
