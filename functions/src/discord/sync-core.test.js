import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRequire } from "module";

let syncCore;
let enqueueMock;
let taskQueueMock;

describe("discord sync core helpers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    enqueueMock = vi.fn().mockResolvedValue(undefined);
    taskQueueMock = vi.fn(() => ({ enqueue: enqueueMock }));

    const require = createRequire(import.meta.url);
    require.cache[require.resolve("firebase-admin/functions")] = {
      exports: {
        getFunctions: () => ({
          taskQueue: (...args) => taskQueueMock(...args),
        }),
      },
    };

    syncCore = await import("./sync-core.js");
  });

  test("createSyncHash changes when payload changes", () => {
    const hashA = syncCore.createSyncHash({ pollId: "p1", voteCount: 1 });
    const hashB = syncCore.createSyncHash({ pollId: "p1", voteCount: 2 });
    expect(hashA).not.toBe(hashB);
  });

  test("buildTaskQueueName uses bare name in us-central1", () => {
    expect(syncCore.buildTaskQueueName("us-central1", "processDiscordBasicPollUpdate")).toBe(
      "processDiscordBasicPollUpdate"
    );
  });

  test("buildTaskQueueName prefixes non-default regions", () => {
    expect(syncCore.buildTaskQueueName("europe-west1", "queueName")).toBe(
      "locations/europe-west1/functions/queueName"
    );
  });

  test("buildDiscordMessageUrl returns null when args are incomplete", () => {
    expect(syncCore.buildDiscordMessageUrl("guild", "channel", "")).toBeNull();
  });

  test("enqueueSyncTask enqueues payload with delay on derived queue", async () => {
    await syncCore.enqueueSyncTask({
      region: "europe-west1",
      queueName: "processDiscordSchedulerUpdate",
      payload: { schedulerId: "sched-1" },
      scheduleDelaySeconds: 4,
    });

    expect(taskQueueMock).toHaveBeenCalledWith(
      "locations/europe-west1/functions/processDiscordSchedulerUpdate"
    );
    expect(enqueueMock).toHaveBeenCalledWith(
      { schedulerId: "sched-1" },
      { scheduleDelaySeconds: 4 }
    );
  });
});
