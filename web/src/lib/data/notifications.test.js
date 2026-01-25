import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ensureGroupInviteNotification,
  groupInviteNotificationId,
  createSessionJoinNotification,
  createSessionInviteNotification,
  createVoteSubmittedNotification,
} from "./notifications";
import { setDoc } from "firebase/firestore";

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
});
