import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  groupInviteNotificationId,
  friendRequestNotificationId,
  pollInviteNotificationId,
  notificationDedupeId,
  friendRequestLegacyNotificationId,
  pollInviteLegacyNotificationId,
  groupInviteLegacyNotificationId,
  markNotificationRead,
  dismissNotification,
  markAllNotificationsRead,
  dismissAllNotifications,
  deleteNotification,
} from "./notifications";
import { writeBatch, deleteDoc, updateDoc } from "firebase/firestore";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn((_, __, ___, notificationId) => ({ id: notificationId })),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock("../firebase", () => ({ db: {} }));

describe("notification ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds stable notification ids", () => {
    expect(notificationDedupeId("demo")).toBe("dedupe:demo");
    expect(friendRequestNotificationId("req_1")).toBe("dedupe:friend:req_1");
    expect(friendRequestLegacyNotificationId("req_1")).toBe("friendRequest:req_1");
    expect(pollInviteNotificationId("poll_1", "Invitee@Example.com")).toBe(
      "dedupe:poll:poll_1:invite:invitee@example.com"
    );
    expect(pollInviteLegacyNotificationId("poll_1")).toBe("pollInvite:poll_1");
    expect(groupInviteNotificationId("group_1", "invitee@example.com")).toBe(
      "dedupe:group:group_1:invite:invitee@example.com"
    );
    expect(groupInviteLegacyNotificationId("group_1")).toBe("groupInvite:group_1");
  });
});

describe("notification helpers", () => {
  let batch;
  beforeEach(() => {
    vi.clearAllMocks();
    batch = { update: vi.fn(), commit: vi.fn() };
    writeBatch.mockReturnValue(batch);
  });

  it("marks all notifications read using batch", async () => {
    const notifications = [
      { id: "n1", read: false },
      { id: "n2", read: true },
    ];
    await markAllNotificationsRead("user_1", notifications);

    expect(batch.update).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("dismisses all notifications using batch", async () => {
    await dismissAllNotifications("user_1", [
      { id: "n1" },
      { id: "n2" },
    ]);

    expect(batch.update).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("deletes a notification", async () => {
    await deleteNotification("user_1", "n1");
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it("marks a notification read", async () => {
    await markNotificationRead("user_1", "n2");
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it("dismisses a notification", async () => {
    await dismissNotification("user_1", "n3");
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });
});
