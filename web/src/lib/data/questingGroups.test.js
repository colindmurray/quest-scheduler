import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  inviteMemberToGroup,
  createQuestingGroup,
  acceptGroupInvitation,
  declineGroupInvitation,
  revokeGroupInvite,
  deleteQuestingGroup,
  removeMemberFromGroup,
  leaveGroup,
  getDefaultGroupColor,
  getPollsUsingGroup,
  removeMemberFromGroupPolls,
} from "./questingGroups";
import { httpsCallable } from "firebase/functions";
import { deleteDoc, getDocs, getDoc, getDocFromServer, updateDoc, setDoc } from "firebase/firestore";
import {
  dismissNotification,
  dismissNotificationsByResource,
  deleteNotification,
  groupInviteNotificationId,
  groupInviteLegacyNotificationId,
} from "./notifications";

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
  getDocFromServer: vi.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({ pendingInvites: [] }),
  }),
  deleteField: vi.fn(() => "deleteField"),
  waitForPendingWrites: vi.fn().mockResolvedValue(),
}));

vi.mock("../firebase", () => ({ db: {} }));

const basicPollsMocks = {
  fetchGroupBasicPolls: vi.fn(),
  deleteBasicPoll: vi.fn(),
};
vi.mock("./basicPolls", () => ({
  fetchGroupBasicPolls: (...args) => basicPollsMocks.fetchGroupBasicPolls(...args),
  deleteBasicPoll: (...args) => basicPollsMocks.deleteBasicPoll(...args),
}));

const emitNotificationEventMock = vi.fn();
const buildNotificationActorMock = vi.fn((user) => user);
vi.mock("./notification-events", () => ({
  emitNotificationEvent: (...args) => emitNotificationEventMock(...args),
  buildNotificationActor: (...args) => buildNotificationActorMock(...args),
}));

vi.mock("./notifications", () => ({
  dismissNotification: vi.fn(),
  dismissNotificationsByResource: vi.fn(),
  deleteNotification: vi.fn(),
  groupInviteNotificationId: vi.fn(
    (groupId, email) => `dedupe:group:${groupId}:invite:${email}`
  ),
  groupInviteLegacyNotificationId: vi.fn((groupId) => `groupInvite:${groupId}`),
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
  getDocFromServer.mockResolvedValue({
    exists: () => true,
    data: () => ({ pendingInvites: [] }),
  });
});

  it("invokes the group invite callable", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { added: true, inviteeUserId: "user_123" } });
    httpsCallable.mockReturnValue(callable);

    await inviteMemberToGroup(
      "group_1",
      "The Heroes",
      "inviter@example.com",
      "Invitee@Example.com",
      "user_123"
    );

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "sendGroupInvite");
    expect(callable).toHaveBeenCalledWith({
      groupId: "group_1",
      inviteeEmail: "invitee@example.com",
    });
  });

  it("handles invite when invitee user id is missing", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { added: true, inviteeUserId: null } });
    httpsCallable.mockReturnValue(callable);

    await inviteMemberToGroup(
      "group_1",
      "The Heroes",
      "inviter@example.com",
      "invitee@example.com",
      null
    );
    expect(callable).toHaveBeenCalledWith({
      groupId: "group_1",
      inviteeEmail: "invitee@example.com",
    });
  });

  it("suppresses blocked invites without throwing", async () => {
    httpsCallable.mockReturnValue(async () => ({
      data: { added: false, reason: "blocked" },
    }));

    const result = await inviteMemberToGroup(
      "group_1",
      "The Heroes",
      "inviter@example.com",
      "invitee@example.com",
      null
    );

    expect(result).toEqual({ suppressed: true });
  });
});

describe("revokeGroupInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the revoke group invite callable", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { ok: true } });
    httpsCallable.mockReturnValue(callable);

    await revokeGroupInvite("group_1", "Invitee@Example.com");

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "revokeGroupInvite");
    expect(callable).toHaveBeenCalledWith({
      groupId: "group_1",
      inviteeEmail: "invitee@example.com",
    });
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
    expect(buildNotificationActorMock).toHaveBeenCalledWith({
      uid: "member_1",
      email: "member@example.com",
    });
    expect(emitNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "GROUP_INVITE_ACCEPTED",
        resource: { type: "group", id: "group_1", title: "Heroes" },
        recipients: { userIds: ["leader_1"], emails: [] },
      })
    );
    expect(groupInviteNotificationId).toHaveBeenCalledWith("group_1", "member@example.com");
    expect(groupInviteLegacyNotificationId).toHaveBeenCalledWith("group_1");
    expect(dismissNotification).toHaveBeenCalledWith(
      "member_1",
      "dedupe:group:group_1:invite:member@example.com"
    );
    expect(dismissNotification).toHaveBeenCalledWith("member_1", "groupInvite:group_1");
    expect(deleteNotification).toHaveBeenCalledWith(
      "member_1",
      "dedupe:group:group_1:invite:member@example.com"
    );
    expect(deleteNotification).toHaveBeenCalledWith("member_1", "groupInvite:group_1");
    expect(dismissNotificationsByResource).toHaveBeenCalledWith("member_1", "group_1", [
      "GROUP_INVITE_SENT",
      "GROUP_INVITE",
    ]);
  });

  it("declines group invitation and removes notification", async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        pendingInvites: ["member@example.com"],
        pendingInviteMeta: {
          "member@example.com": { invitedByEmail: "leader@example.com" },
        },
      }),
    });

    await declineGroupInvitation("group_1", "member@example.com", "member_1");
    expect(updateDoc).toHaveBeenCalled();
    expect(emitNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "GROUP_INVITE_DECLINED",
        resource: { type: "group", id: "group_1", title: "Questing Group" },
      })
    );
    expect(groupInviteNotificationId).toHaveBeenCalledWith("group_1", "member@example.com");
    expect(groupInviteLegacyNotificationId).toHaveBeenCalledWith("group_1");
    expect(dismissNotification).toHaveBeenCalledWith(
      "member_1",
      "dedupe:group:group_1:invite:member@example.com"
    );
    expect(dismissNotification).toHaveBeenCalledWith("member_1", "groupInvite:group_1");
    expect(deleteNotification).toHaveBeenCalledWith(
      "member_1",
      "dedupe:group:group_1:invite:member@example.com"
    );
    expect(deleteNotification).toHaveBeenCalledWith("member_1", "groupInvite:group_1");
    expect(dismissNotificationsByResource).toHaveBeenCalledWith("member_1", "group_1", [
      "GROUP_INVITE_SENT",
      "GROUP_INVITE",
    ]);
  });

  it("removes a member and sends change notification", async () => {
    await removeMemberFromGroup(
      "group_1",
      "Heroes",
      "member@example.com",
      "member_1",
      { uid: "admin_1", email: "admin@example.com" }
    );
    expect(updateDoc).toHaveBeenCalled();
    expect(buildNotificationActorMock).toHaveBeenCalledWith({
      uid: "admin_1",
      email: "admin@example.com",
    });
    expect(emitNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "GROUP_MEMBER_REMOVED",
        resource: { type: "group", id: "group_1", title: "Heroes" },
        recipients: { userIds: ["member_1"], emails: [] },
      })
    );
  });

  it("sends a member left notification to the group owner", async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ name: "Heroes", creatorId: "leader_1" }),
    });

    await leaveGroup("group_1", "member@example.com", "member_1", {
      uid: "member_1",
      email: "member@example.com",
    });

    expect(updateDoc).toHaveBeenCalled();
    expect(emitNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "GROUP_MEMBER_LEFT",
        resource: { type: "group", id: "group_1", title: "Heroes" },
        recipients: { userIds: ["leader_1"], emails: [] },
      })
    );
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

  it("deletes group-linked basic polls before deleting the group", async () => {
    basicPollsMocks.fetchGroupBasicPolls.mockResolvedValueOnce([
      { id: "poll_1" },
      { id: "poll_2" },
    ]);

    await deleteQuestingGroup("group_1");

    expect(basicPollsMocks.fetchGroupBasicPolls).toHaveBeenCalledWith("group_1");
    expect(basicPollsMocks.deleteBasicPoll).toHaveBeenCalledWith("group_1", "poll_1");
    expect(basicPollsMocks.deleteBasicPoll).toHaveBeenCalledWith("group_1", "poll_2");
    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ __docRef: true }));
  });
});
