import { describe, it, expect, vi, beforeEach } from "vitest";
import { inviteMemberToGroup } from "./questingGroups";
import { createGroupInviteNotification } from "./notifications";
import { httpsCallable } from "firebase/functions";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ __docRef: true })),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  arrayUnion: vi.fn((value) => ({ __arrayUnion: value })),
  arrayRemove: vi.fn((value) => ({ __arrayRemove: value })),
  getDocs: vi.fn(),
}));

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("./notifications", () => ({
  createGroupInviteNotification: vi.fn(),
  createGroupMemberChangeNotification: vi.fn(),
  ensureGroupInviteNotification: vi.fn(),
}));

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

describe("inviteMemberToGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates in-app notification when invite succeeds", async () => {
    httpsCallable.mockReturnValue(async () => ({
      data: { added: true, inviteeUserId: "user_123" },
    }));

    await inviteMemberToGroup(
      "group_1",
      "The Heroes",
      "inviter@example.com",
      "Invitee@Example.com",
      "user_123"
    );

    expect(createGroupInviteNotification).toHaveBeenCalledWith("user_123", {
      groupId: "group_1",
      groupName: "The Heroes",
      inviterEmail: "inviter@example.com",
      inviterUserId: null,
    });
  });

  it("skips notification when invitee user id is missing", async () => {
    httpsCallable.mockReturnValue(async () => ({
      data: { added: true, inviteeUserId: null },
    }));

    await inviteMemberToGroup(
      "group_1",
      "The Heroes",
      "inviter@example.com",
      "invitee@example.com",
      null
    );

    expect(createGroupInviteNotification).not.toHaveBeenCalled();
  });

  it("throws when invite is blocked", async () => {
    httpsCallable.mockReturnValue(async () => ({
      data: { added: false, reason: "blocked" },
    }));

    await expect(
      inviteMemberToGroup(
        "group_1",
        "The Heroes",
        "inviter@example.com",
        "invitee@example.com",
        null
      )
    ).rejects.toThrow("This user is not accepting new invites from you.");
  });
});
