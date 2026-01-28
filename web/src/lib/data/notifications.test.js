import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ensureGroupInviteNotification,
  groupInviteNotificationId,
  ensureFriendRequestNotification,
  ensurePollInviteNotification,
  createSessionJoinNotification,
  createSessionInviteNotification,
  createVoteSubmittedNotification,
  createGroupMemberChangeNotification,
  createVoteReminderNotification,
  createGroupInviteAcceptedNotification,
  createNotification,
  markNotificationRead,
  dismissNotification,
  markAllNotificationsRead,
  dismissAllNotifications,
  deleteNotification,
} from "./notifications";
import { setDoc, writeBatch, deleteDoc, updateDoc } from "firebase/firestore";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn((_, __, ___, notificationId) => ({ id: notificationId })),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock("../firebase", () => ({ db: {} }));

describe("ensureGroupInviteNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "uuid_1" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates or updates a notification payload", async () => {
    const id = await ensureGroupInviteNotification("user_1", {
      groupId: "group_1",
      groupName: "Party One",
      inviterEmail: "inviter@example.com",
    });

    expect(id).toBe(groupInviteNotificationId("group_1"));
    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});

describe("ensure friend/poll invite notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates friend request notification", async () => {
    const id = await ensureFriendRequestNotification("user_1", {
      requestId: "req_1",
      fromEmail: "friend@example.com",
      fromUserId: "friend_1",
    });

    expect(id).toBe("friendRequest:req_1");
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("creates poll invite notification", async () => {
    const id = await ensurePollInviteNotification("user_1", {
      schedulerId: "poll_1",
      schedulerTitle: "Session",
      inviterEmail: "host@example.com",
    });

    expect(id).toBe("pollInvite:poll_1");
    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});

describe("session notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "uuid_2" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a join notification", async () => {
    await createSessionJoinNotification("creator_1", {
      schedulerId: "poll_1",
      schedulerTitle: "Weekly Game",
      participantEmail: "player@example.com",
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("creates a vote submitted notification", async () => {
    await createVoteSubmittedNotification("creator_1", {
      schedulerId: "poll_2",
      schedulerTitle: "Monthly Game",
      voterEmail: "voter@example.com",
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("creates a session invite notification", async () => {
    await createSessionInviteNotification("user_1", {
      schedulerId: "poll_3",
      schedulerTitle: "Oneshot",
      inviterEmail: "host@example.com",
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("creates a vote reminder notification", async () => {
    await createVoteReminderNotification("user_1", {
      schedulerId: "poll_4",
      schedulerTitle: "Monthly Game",
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("creates group member change notification", async () => {
    await createGroupMemberChangeNotification("user_1", {
      groupId: "group_1",
      groupName: "Heroes",
      action: "added",
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("creates group invite accepted notification", async () => {
    await createGroupInviteAcceptedNotification("user_1", {
      groupId: "group_2",
      groupName: "Party",
      memberEmail: "member@example.com",
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});

describe("notification helpers", () => {
  let batch;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "notif_1" });
    batch = { update: vi.fn(), commit: vi.fn() };
    writeBatch.mockReturnValue(batch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a notification with generated id", async () => {
    const id = await createNotification("user_1", { title: "Hi" });
    expect(id).toBe("notif_1");
    expect(setDoc).toHaveBeenCalled();
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
