import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createFriendRequest,
  acceptFriendRequest,
  acceptFriendInviteLink,
} from "./friends";
import { setDoc, updateDoc, getDoc } from "firebase/firestore";
import { createFriendAcceptedNotification } from "./notifications";
import { findUserIdByEmail } from "./users";
import { resolveIdentifier } from "../identifiers";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn((_, __, id) => ({ id })),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock("firebase/functions", () => {
  const callable = vi.fn(async () => ({ data: { requestId: "req_1" } }));
  return {
    getFunctions: vi.fn(),
    httpsCallable: vi.fn(() => callable),
  };
});

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("./notifications", () => ({
  createFriendAcceptedNotification: vi.fn(),
  ensureFriendRequestNotification: vi.fn(),
  deleteNotification: vi.fn(),
  friendRequestNotificationId: vi.fn((requestId) => `friendRequest:${requestId}`),
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

    expect(setDoc).toHaveBeenCalled();
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
    expect(createFriendAcceptedNotification).toHaveBeenCalledWith("sender_1", {
      requestId: "req_1",
      friendEmail: "friend@example.com",
      friendUserId: "friend_1",
    });
  });

  it("accepts a friend invite link by creating and accepting request", async () => {
    await acceptFriendInviteLink("invite_code", {
      userId: "friend_1",
      userEmail: "friend@example.com",
    });
    expect(setDoc).not.toHaveBeenCalled();
  });
});
