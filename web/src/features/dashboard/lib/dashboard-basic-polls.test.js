import { describe, expect, test } from "vitest";
import {
  buildBasicPollArchiveKey,
  buildUsersFromIds,
  canManageGroupPoll,
  deriveDashboardBasicPollItems,
} from "./dashboard-basic-polls";

describe("dashboard-basic-polls", () => {
  test("derives poll dashboard fields, state, and ordering", () => {
    const nowMs = Date.parse("2026-02-12T10:00:00.000Z");
    const sourceItems = [
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "group-open",
        title: "Alpha vote",
        status: "OPEN",
        hasVoted: false,
        voterIds: ["u1"],
        settings: { deadlineAt: "2026-02-13T10:00:00.000Z" },
      },
      {
        parentType: "scheduler",
        parentId: "sched-1",
        pollId: "sched-open-voted",
        title: "Beta vote",
        status: "OPEN",
        hasVoted: true,
        voterIds: ["u1"],
        settings: { deadlineAt: "2026-02-14T10:00:00.000Z" },
      },
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "group-closed",
        title: "Gamma vote",
        status: "FINALIZED",
        hasVoted: true,
        voterIds: ["u1", "u2"],
      },
    ];
    const schedulerMetaById = new Map([
      [
        "sched-1",
        {
          title: "Session One",
          status: "OPEN",
          participantIds: ["u1", "u3"],
          questingGroupId: "group-1",
          creatorId: "owner-1",
        },
      ],
    ]);
    const groupsById = {
      "group-1": {
        id: "group-1",
        name: "Alpha Group",
        creatorId: "owner-1",
        memberIds: ["u1", "u2"],
      },
    };
    const archivedPolls = [buildBasicPollArchiveKey(sourceItems[1])];

    const items = deriveDashboardBasicPollItems({
      basicPollSourceItems: sourceItems,
      archivedPolls,
      schedulerMetaById,
      groupsById,
      groupNameById: new Map([["group-1", "Alpha Group"]]),
      getGroupColor: () => "#112233",
      userId: "owner-1",
      nowMs,
    });

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.state)).toEqual(["NEEDS_VOTE", "CLOSED", "ARCHIVED"]);
    expect(items[0].contextLabel).toBe("in Alpha Group");
    expect(items[0].pendingIds).toEqual(["u2"]);
    expect(items[0].accentColor).toBe("#112233");
    expect(items[0].canManage).toBe(true);
    expect(items[1].pollStatus).toBe("FINALIZED");
    expect(items[2].contextLabel).toBe("in Session One");
    expect(items[2].voteLink).toBe("/scheduler/sched-1?poll=sched-open-voted");
  });

  test("applies selected questing group filter to group and scheduler polls", () => {
    const items = deriveDashboardBasicPollItems({
      basicPollSourceItems: [
        {
          parentType: "group",
          parentId: "group-a",
          pollId: "poll-1",
          title: "A",
          status: "OPEN",
        },
        {
          parentType: "scheduler",
          parentId: "sched-b",
          pollId: "poll-2",
          title: "B",
          status: "OPEN",
        },
      ],
      selectedGroupFilterId: "group-a",
      schedulerMetaById: new Map([
        [
          "sched-b",
          {
            title: "Session B",
            status: "OPEN",
            participantIds: [],
            questingGroupId: "group-b",
          },
        ],
      ]),
      groupsById: { "group-a": { memberIds: [] } },
      groupNameById: new Map(),
      getGroupColor: () => null,
      userId: "u1",
    });

    expect(items).toHaveLength(1);
    expect(items[0].pollId).toBe("poll-1");
  });

  test("canManageGroupPoll respects creator, member-managed, and manager permissions", () => {
    expect(canManageGroupPoll({ creatorId: "u1" }, "u1")).toBe(true);
    expect(
      canManageGroupPoll({ memberManaged: true, memberIds: ["u2"] }, "u2")
    ).toBe(true);
    expect(
      canManageGroupPoll(
        {
          memberPermissionsEnabled: true,
          memberPermissions: { u3: { isManager: true } },
        },
        "u3"
      )
    ).toBe(true);
    expect(canManageGroupPoll({ creatorId: "u1", memberIds: [] }, "u9")).toBe(false);
  });

  test("buildUsersFromIds maps profiles and keeps fallbacks", () => {
    const users = buildUsersFromIds(["u1", "u2"], {
      u1: { displayName: "Alice", email: "alice@example.com", photoURL: "a.png" },
    });

    expect(users).toEqual([
      {
        id: "u1",
        displayName: "Alice",
        email: "alice@example.com",
        avatar: "a.png",
      },
      {
        id: "u2",
        displayName: "u2",
        email: "user:u2",
        avatar: null,
      },
    ]);
  });
});
