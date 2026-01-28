import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  inviteMemberToGroup,
  createQuestingGroup,
  acceptGroupInvitation,
  declineGroupInvitation,
  removeMemberFromGroup,
  getDefaultGroupColor,
  getPollsUsingGroup,
  removeMemberFromGroupPolls,
} from "./questingGroups";
import {
  createGroupInviteNotification,
  createGroupMemberChangeNotification,
  createGroupInviteAcceptedNotification,
  deleteNotification,
} from "./notifications";
import { httpsCallable } from "firebase/functions";
import { getDocs, getDoc, updateDoc, setDoc } from "firebase/firestore";

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
  getDoc: vi.fn(),
  deleteField: vi.fn(() => "deleteField"),
}));

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("./notifications", () => ({
  createGroupInviteNotification: vi.fn(),
  createGroupMemberChangeNotification: vi.fn(),
  ensureGroupInviteNotification: vi.fn(),
  createGroupInviteAcceptedNotification: vi.fn(),
  deleteNotification: vi.fn(),
  groupInviteNotificationId: vi.fn((groupId) => `groupInvite:${groupId}`),
}));

vi.mock("./users", () => ({
  findUserIdByEmail: vi.fn(),
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

describe("questing group helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "group_1" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a questing group with normalized email", async () => {
    const groupId = await createQuestingGroup({
      name: "Heroes",
      creatorId: "user_1",
      creatorEmail: "Creator@Example.com",
    });

    expect(groupId).toBe("group_1");
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ creatorEmail: "creator@example.com" })
    );
  });

  it("accepts group invitation and notifies inviter", async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        name: "Heroes",
        creatorEmail: "leader@example.com",
      }),
    });
    const { findUserIdByEmail } = await import("./users");
    vi.mocked(findUserIdByEmail).mockResolvedValue("leader_1");

    await acceptGroupInvitation("group_1", "member@example.com", "member_1");

    expect(updateDoc).toHaveBeenCalled();
    expect(deleteNotification).toHaveBeenCalled();
    expect(createGroupInviteAcceptedNotification).toHaveBeenCalledWith("leader_1", {
      groupId: "group_1",
      groupName: "Heroes",
      memberEmail: "member@example.com",
      memberUserId: "member_1",
    });
  });

  it("declines group invitation and removes notification", async () => {
    await declineGroupInvitation("group_1", "member@example.com", "member_1");
    expect(updateDoc).toHaveBeenCalled();
    expect(deleteNotification).toHaveBeenCalled();
  });

  it("removes a member and sends change notification", async () => {
    await removeMemberFromGroup("group_1", "Heroes", "member@example.com", "member_1");
    expect(updateDoc).toHaveBeenCalled();
    expect(createGroupMemberChangeNotification).toHaveBeenCalledWith("member_1", {
      groupId: "group_1",
      groupName: "Heroes",
      action: "removed",
    });
  });

  it("returns default group color", () => {
    expect(getDefaultGroupColor(0)).toBe("#7C3AED");
  });

  it("fetches polls using a group", async () => {
    getDocs.mockResolvedValue({
      docs: [{ id: "poll_1", data: () => ({ title: "Session" }) }],
    });

    const polls = await getPollsUsingGroup("group_1");
    expect(polls).toEqual([{ id: "poll_1", title: "Session" }]);
  });

  it("removes member from group polls via callable", async () => {
    httpsCallable.mockReturnValue(async () => ({ data: {} }));
    await removeMemberFromGroupPolls("group_1", "member@example.com");
    expect(httpsCallable).toHaveBeenCalledWith(undefined, "removeGroupMemberFromPolls");
  });
});
