import { describe, it, expect, vi, beforeEach } from "vitest";
import { inviteMemberToGroup } from "./questingGroups";
import { updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { createGroupInviteNotification } from "./notifications";

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

describe("inviteMemberToGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds pending invite and creates in-app notification when user id is provided", async () => {
    await inviteMemberToGroup(
      "group_1",
      "The Heroes",
      "inviter@example.com",
      "Invitee@Example.com",
      "user_123"
    );

    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      pendingInvites: { __arrayUnion: "invitee@example.com" },
      "pendingInviteMeta.invitee@example.com": {
        invitedByEmail: "inviter@example.com",
        invitedByUserId: null,
        invitedAt: "ts",
      },
      updatedAt: "ts",
    });

    expect(createGroupInviteNotification).toHaveBeenCalledWith("user_123", {
      groupId: "group_1",
      groupName: "The Heroes",
      inviterEmail: "inviter@example.com",
    });

    expect(arrayUnion).toHaveBeenCalledWith("invitee@example.com");
    expect(serverTimestamp).toHaveBeenCalled();
  });

  it("adds pending invite without notification when user id is missing", async () => {
    await inviteMemberToGroup(
      "group_1",
      "The Heroes",
      "inviter@example.com",
      "invitee@example.com",
      null
    );

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(createGroupInviteNotification).not.toHaveBeenCalled();
  });
});
