import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  ensureFriendInviteCode,
  acceptFriendInviteLink,
  revokeFriendRequest,
  normalizeFriendRequestId,
} from "./friends";
import { setDoc, updateDoc, getDoc, deleteDoc } from "firebase/firestore";
import { findUserIdByEmail } from "./users";
import { resolveIdentifier } from "../identifiers";
import { emitNotificationEvent } from "./notification-events";
import {
  dismissNotification,
  dismissNotificationsByResource,
  deleteNotification,
  friendRequestNotificationId,
  friendRequestLegacyNotificationId,
} from "./notifications";
import { httpsCallable } from "firebase/functions";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn((_, __, id) => ({ id })),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  waitForPendingWrites: vi.fn().mockResolvedValue(),
}));

vi.mock("firebase/functions", () => {
  const callable = vi.fn(async () => ({ data: { requestId: "req_1" } }));
  return {
    getFunctions: vi.fn(),
    httpsCallable: vi.fn(() => callable),
  };
});

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("./notification-events", () => ({
  emitNotificationEvent: vi.fn(),
  buildNotificationActor: vi.fn((user) => user),
}));

vi.mock("./notifications", () => ({
  dismissNotification: vi.fn(),
  dismissNotificationsByResource: vi.fn(),
  deleteNotification: vi.fn(),
  friendRequestNotificationId: vi.fn((requestId) => `dedupe:friend:${requestId}`),
  friendRequestLegacyNotificationId: vi.fn(
    (requestId) => `friendRequest:${requestId}`
  ),
}));

vi.mock("./users", () => ({
  findUserIdByEmail: vi.fn(),
}));

vi.mock("../identifiers", () => ({
  resolveIdentifier: vi.fn(async (input) => ({
    email: String(input || "").toLowerCase(),
    userId: null,
    userData: null,
  })),
}));

describe("friends data helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "req_1" });
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a friend request and sends notification when recipient exists", async () => {
    findUserIdByEmail.mockResolvedValue("user_2");
    resolveIdentifier.mockResolvedValue({
      email: "friend@example.com",
      userId: "user_2",
      userData: null,
    });

    await createFriendRequest({
      fromUserId: "user_1",
      fromEmail: "Sender@Example.com",
      toEmail: "Friend@Example.com",
      fromDisplayName: "Sender",
    });

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "sendFriendRequest");
    const callable = httpsCallable.mock.results[0]?.value;
    expect(callable).toHaveBeenCalledWith({
      toEmail: "friend@example.com",
      fromDisplayName: "Sender",
      sendEmail: true,
    });
  });

  it("returns null when friend request is suppressed", async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { suppressed: true } });
    httpsCallable.mockReturnValueOnce(callable);

    const result = await createFriendRequest({
      fromUserId: "user_1",
      fromEmail: "Sender@Example.com",
      toEmail: "blocked@example.com",
      fromDisplayName: "Sender",
    });

    expect(result).toBeNull();
  });

  it("throws when trying to friend yourself", async () => {
    resolveIdentifier.mockResolvedValue({
      email: "self@example.com",
      userId: null,
      userData: null,
    });

    await expect(
      createFriendRequest({
        fromUserId: "user_1",
        fromEmail: "self@example.com",
        toIdentifier: "self@example.com",
      })
    ).rejects.toThrow("You cannot add yourself as a friend.");
  });

  it("skips email queue when sendEmail is false", async () => {
    await createFriendRequest(
      {
        fromUserId: "user_1",
        fromEmail: "sender@example.com",
        toIdentifier: "friend@example.com",
      },
      { sendEmail: false }
    );

    const callable = httpsCallable.mock.results[0]?.value;
    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({ sendEmail: false })
    );
  });

  it("accepts a pending friend request and notifies sender", async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        toEmail: "friend@example.com",
        status: "pending",
        fromUserId: "sender_1",
        fromEmail: "sender@example.com",
      }),
    });

    await acceptFriendRequest("req_1", {
      userId: "friend_1",
      userEmail: "friend@example.com",
    });

    expect(updateDoc).toHaveBeenCalled();
    expect(emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "FRIEND_REQUEST_ACCEPTED",
        resource: { type: "friend", id: "req_1", title: "Friend Request" },
        recipients: { userIds: ["sender_1"], emails: [] },
      })
    );
    expect(friendRequestNotificationId).toHaveBeenCalledWith("req_1");
    expect(friendRequestLegacyNotificationId).toHaveBeenCalledWith("req_1");
    expect(dismissNotification).toHaveBeenCalledWith("friend_1", "dedupe:friend:req_1");
    expect(dismissNotification).toHaveBeenCalledWith("friend_1", "friendRequest:req_1");
    expect(deleteNotification).toHaveBeenCalledWith("friend_1", "dedupe:friend:req_1");
    expect(deleteNotification).toHaveBeenCalledWith("friend_1", "friendRequest:req_1");
    expect(dismissNotificationsByResource).toHaveBeenCalledWith("friend_1", "req_1", [
      "FRIEND_REQUEST_SENT",
      "FRIEND_REQUEST",
    ]);
  });

  it("accepts request by resolving sender id when missing", async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        toEmail: "friend@example.com",
        status: "pending",
        fromEmail: "sender@example.com",
      }),
    });
    findUserIdByEmail.mockResolvedValue("sender_2");

    await acceptFriendRequest("req_2", {
      userId: "friend_1",
      userEmail: "friend@example.com",
    });

    expect(emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "FRIEND_REQUEST_ACCEPTED",
        resource: { type: "friend", id: "req_2", title: "Friend Request" },
        recipients: { userIds: ["sender_2"], emails: [] },
      })
    );
  });

  it("declines request and removes notification", async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        toEmail: "friend@example.com",
        status: "pending",
      }),
    });

    await declineFriendRequest("req_3", {
      userId: "friend_1",
      userEmail: "friend@example.com",
    });

    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "declined" })
    );
    expect(emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "FRIEND_REQUEST_DECLINED",
        resource: { type: "friend", id: "req_3", title: "Friend Request" },
      })
    );
    expect(friendRequestNotificationId).toHaveBeenCalledWith("req_3");
    expect(friendRequestLegacyNotificationId).toHaveBeenCalledWith("req_3");
    expect(dismissNotification).toHaveBeenCalledWith("friend_1", "dedupe:friend:req_3");
    expect(dismissNotification).toHaveBeenCalledWith("friend_1", "friendRequest:req_3");
    expect(deleteNotification).toHaveBeenCalledWith("friend_1", "dedupe:friend:req_3");
    expect(deleteNotification).toHaveBeenCalledWith("friend_1", "friendRequest:req_3");
    expect(dismissNotificationsByResource).toHaveBeenCalledWith("friend_1", "req_3", [
      "FRIEND_REQUEST_SENT",
      "FRIEND_REQUEST",
    ]);
  });

  it("removes accepted friend requests and legacy ids", async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        status: "accepted",
        fromEmail: "a@example.com",
        toEmail: "b@example.com",
      }),
    });

    await removeFriend("req_4", { userEmail: "a@example.com" });

    expect(deleteDoc).toHaveBeenCalledTimes(3);
  });

  it("returns existing invite code without writing", async () => {
    getDoc.mockResolvedValue({
      data: () => ({ friendInviteCode: "code-123" }),
    });

    const code = await ensureFriendInviteCode({
      userId: "user_1",
      email: "user@example.com",
    });

    expect(code).toBe("code-123");
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("accepts a friend invite link by creating and accepting request", async () => {
    await acceptFriendInviteLink("invite_code", {
      userId: "friend_1",
      userEmail: "friend@example.com",
    });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("revokes a friend request via callable", async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { ok: true } });
    httpsCallable.mockReturnValueOnce(callable);

    await revokeFriendRequest("req_9");

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "revokeFriendRequest");
    expect(callable).toHaveBeenCalledWith({ requestId: "req_9" });
  });

  it("normalizes legacy friend request ids", () => {
    expect(normalizeFriendRequestId("friendRequest:foo@bar.com__a@b.com")).toContain(
      "friendRequest:"
    );
    expect(normalizeFriendRequestId(null)).toBeNull();
  });
});
