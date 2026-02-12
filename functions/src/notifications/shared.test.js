import { describe, expect, test, vi } from "vitest";
import { buildMetadata, getPendingNotificationsCollection, hashEmail } from "./shared";

describe("notifications shared helpers", () => {
  test("buildMetadata derives scheduler/group/actor fields without clobbering existing metadata", () => {
    const metadata = buildMetadata({
      resource: { type: "poll", id: "sched-1", title: "Session Poll" },
      actor: { uid: "user-1", email: "user@example.com" },
      payload: { metadata: { schedulerTitle: "Custom title" } },
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        schedulerId: "sched-1",
        schedulerTitle: "Custom title",
        actorUserId: "user-1",
        actorEmail: "user@example.com",
      })
    );
  });

  test("hashEmail is stable for normalized casing/spacing", () => {
    expect(hashEmail("  TEST@example.com ")).toBe(hashEmail("test@example.com"));
  });

  test("getPendingNotificationsCollection resolves pending events collection or null", () => {
    const collectionFn = vi.fn(() => ({ get: vi.fn() }));
    const docFn = vi.fn(() => ({ collection: collectionFn }));
    const db = {
      collection: vi.fn(() => ({ doc: docFn })),
    };

    const pendingRef = getPendingNotificationsCollection(db, "User@example.com");
    expect(pendingRef).toEqual(expect.objectContaining({ get: expect.any(Function) }));
    expect(db.collection).toHaveBeenCalledWith("pendingNotifications");
    expect(docFn).toHaveBeenCalledWith(hashEmail("user@example.com"));
    expect(collectionFn).toHaveBeenCalledWith("events");

    expect(getPendingNotificationsCollection(db, "")).toBeNull();
  });
});
