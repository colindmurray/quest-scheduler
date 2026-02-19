import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const firestoreMocks = {
  addDoc: vi.fn(),
  collection: vi.fn((...args) => ({ path: args.slice(1).join("/") })),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args) => {
    if (args[0] && typeof args[0] === "object" && args[0].path && args.length === 2) {
      return { path: `${args[0].path}/${args[1]}` };
    }
    return { path: args.slice(1).join("/") };
  }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((...args) => ({ orderByArgs: args })),
  query: vi.fn((...args) => ({ queryArgs: args })),
  serverTimestamp: vi.fn(() => "server-time"),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn((...args) => ({ whereArgs: args })),
  writeBatch: vi.fn(),
};

vi.mock("firebase/firestore", () => firestoreMocks);
vi.mock("../firebase", () => ({ db: { name: "db" } }));

let basicPolls;

beforeAll(async () => {
  basicPolls = await import("./basicPolls");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("basicPolls data layer", () => {
  test("createBasicPoll creates a poll with default OPEN status", async () => {
    firestoreMocks.addDoc.mockResolvedValueOnce({ id: "poll-1" });

    const pollId = await basicPolls.createBasicPoll("group-1", { title: "Snack vote" });

    expect(pollId).toBe("poll-1");
    expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
      { path: "questingGroups/group-1/basicPolls" },
      expect.objectContaining({
        title: "Snack vote",
        status: "OPEN",
        hideVoterIdentities: false,
        createdAt: "server-time",
        updatedAt: "server-time",
      })
    );
  });

  test("updateBasicPoll writes updates and refreshed timestamp", async () => {
    await basicPolls.updateBasicPoll("group-1", "poll-1", { title: "Updated title" });

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { path: "questingGroups/group-1/basicPolls/poll-1" },
      {
        title: "Updated title",
        updatedAt: "server-time",
      }
    );
  });

  test("normalizes hideVoterIdentities on updates", async () => {
    await basicPolls.updateBasicPoll("group-1", "poll-1", {
      hideVoterIdentities: "true",
    });

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { path: "questingGroups/group-1/basicPolls/poll-1" },
      {
        hideVoterIdentities: false,
        updatedAt: "server-time",
      }
    );
  });

  test("fetchGroupBasicPolls returns mapped poll docs", async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ id: "poll-1", data: () => ({ title: "A" }) }],
    });

    const polls = await basicPolls.fetchGroupBasicPolls("group-1");

    expect(polls).toEqual([{ id: "poll-1", title: "A" }]);
    expect(firestoreMocks.getDocs).toHaveBeenCalledWith({
      path: "questingGroups/group-1/basicPolls",
    });
  });

  test("fetchOpenGroupPollsWithoutVote returns only open unvoted polls", async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: "poll-1",
          data: () => ({
            title: "Need vote",
            status: "OPEN",
            settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: false },
          }),
        },
        {
          id: "poll-2",
          data: () => ({
            title: "Already voted",
            status: "OPEN",
            settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: false },
          }),
        },
      ],
    });
    firestoreMocks.getDoc
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ optionIds: ["opt-a"] }),
      });

    const polls = await basicPolls.fetchOpenGroupPollsWithoutVote(["group-1"], "user-1");

    expect(firestoreMocks.where).toHaveBeenCalledWith("status", "==", "OPEN");
    expect(polls).toEqual([
      expect.objectContaining({
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-1",
        title: "Need vote",
      }),
    ]);
  });

  test("fetchDashboardGroupBasicPolls returns vote-state summaries", async () => {
    firestoreMocks.getDocs
      .mockResolvedValueOnce({
        docs: [
          {
            id: "poll-1",
            data: () => ({
              title: "Need vote",
              status: "OPEN",
              settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: false },
            }),
          },
          {
            id: "poll-2",
            data: () => ({
              title: "Already voted",
              status: "OPEN",
              settings: { voteType: "RANKED_CHOICE" },
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: "other-user", data: () => ({ optionIds: ["opt-a"] }) }],
      })
      .mockResolvedValueOnce({
        docs: [{ id: "user-1", data: () => ({ rankings: ["opt-b"] }) }],
      });

    const polls = await basicPolls.fetchDashboardGroupBasicPolls(["group-1"], "user-1");

    expect(polls).toHaveLength(2);
    expect(polls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentType: "group",
          parentId: "group-1",
          pollId: "poll-1",
          hasVoted: false,
          votedCount: 1,
          voterIds: ["other-user"],
        }),
        expect.objectContaining({
          parentType: "group",
          parentId: "group-1",
          pollId: "poll-2",
          hasVoted: true,
          votedCount: 1,
          voterIds: ["user-1"],
        }),
      ])
    );
  });

  test("fetchDashboardGroupBasicPolls falls back to own vote when vote docs are permission denied", async () => {
    firestoreMocks.getDocs
      .mockResolvedValueOnce({
        docs: [
          {
            id: "poll-1",
            data: () => ({
              title: "Hidden poll",
              status: "OPEN",
              settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: false },
            }),
          },
        ],
      })
      .mockRejectedValueOnce({ code: "permission-denied" });
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: "user-1",
      data: () => ({ optionIds: ["opt-a"] }),
    });

    const polls = await basicPolls.fetchDashboardGroupBasicPolls(["group-1"], "user-1");

    expect(polls).toEqual([
      expect.objectContaining({
        pollId: "poll-1",
        hasVoted: true,
        votedCount: 1,
        voterIds: ["user-1"],
      }),
    ]);
  });

  test("fetchDashboardEmbeddedBasicPolls returns scheduler poll summaries", async () => {
    firestoreMocks.getDocs
      .mockResolvedValueOnce({
        docs: [
          {
            id: "embedded-1",
            data: () => ({
              title: "Embedded vote",
              required: true,
              status: "OPEN",
              settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: true },
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: "user-1", data: () => ({ optionIds: ["opt-a"] }) }],
      });

    const polls = await basicPolls.fetchDashboardEmbeddedBasicPolls(["sched-1"], "user-1");

    expect(polls).toEqual([
      expect.objectContaining({
        parentType: "scheduler",
        parentId: "sched-1",
        pollId: "embedded-1",
        required: true,
        hasVoted: true,
        votedCount: 1,
        voterIds: ["user-1"],
      }),
    ]);
  });

  test("finalizeBasicPoll sets FINALIZED status", async () => {
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: false },
        options: [
          { id: "opt-1", label: "Option 1", order: 0 },
          { id: "opt-2", label: "Option 2", order: 1 },
        ],
      }),
    });
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ id: "user-1", data: () => ({ optionIds: ["opt-1"] }) }],
    });

    await basicPolls.finalizeBasicPoll("group-1", "poll-1");

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { path: "questingGroups/group-1/basicPolls/poll-1" },
      expect.objectContaining({
        status: "FINALIZED",
        finalizedAt: "server-time",
        finalResults: expect.objectContaining({
          voteType: "MULTIPLE_CHOICE",
          winnerIds: ["opt-1"],
          voterCount: 1,
          rows: expect.arrayContaining([
            expect.objectContaining({ key: "opt-1", count: 1, percentage: 100 }),
            expect.objectContaining({ key: "opt-2", count: 0, percentage: 0 }),
          ]),
        }),
        updatedAt: "server-time",
      })
    );
  });

  test("reopenBasicPoll sets OPEN status", async () => {
    await basicPolls.reopenBasicPoll("group-1", "poll-1");

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { path: "questingGroups/group-1/basicPolls/poll-1" },
      {
        status: "OPEN",
        updatedAt: "server-time",
      }
    );
  });

  test("finalizeEmbeddedBasicPoll sets FINALIZED status for scheduler poll", async () => {
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: false },
        options: [
          { id: "opt-1", label: "Option 1", order: 0 },
          { id: "opt-2", label: "Option 2", order: 1 },
        ],
      }),
    });
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ id: "user-1", data: () => ({ optionIds: ["opt-2"] }) }],
    });

    await basicPolls.finalizeEmbeddedBasicPoll("sched-1", "poll-embedded-1");

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { path: "schedulers/sched-1/basicPolls/poll-embedded-1" },
      expect.objectContaining({
        status: "FINALIZED",
        finalizedAt: "server-time",
        finalResults: expect.objectContaining({
          voteType: "MULTIPLE_CHOICE",
          winnerIds: ["opt-2"],
          voterCount: 1,
        }),
        updatedAt: "server-time",
      })
    );
  });

  test("reopenEmbeddedBasicPoll sets OPEN status for scheduler poll", async () => {
    await basicPolls.reopenEmbeddedBasicPoll("sched-1", "poll-embedded-1");

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { path: "schedulers/sched-1/basicPolls/poll-embedded-1" },
      {
        status: "OPEN",
        updatedAt: "server-time",
      }
    );
  });

  test("createEmbeddedBasicPoll creates scheduler embedded poll doc", async () => {
    firestoreMocks.addDoc.mockResolvedValueOnce({ id: "embedded-1" });

    const pollId = await basicPolls.createEmbeddedBasicPoll("sched-1", {
      title: "Embedded",
      order: 0,
    });

    expect(pollId).toBe("embedded-1");
    expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
      { path: "schedulers/sched-1/basicPolls" },
      expect.objectContaining({
        title: "Embedded",
        order: 0,
        createdAt: "server-time",
        updatedAt: "server-time",
      })
    );
  });

  test("updateEmbeddedBasicPoll writes updates and refreshed timestamp", async () => {
    await basicPolls.updateEmbeddedBasicPoll("sched-1", "poll-1", { required: true });

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { path: "schedulers/sched-1/basicPolls/poll-1" },
      {
        required: true,
        updatedAt: "server-time",
      }
    );
  });

  test("fetchEmbeddedBasicPolls returns mapped scheduler poll docs", async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ id: "embedded-1", data: () => ({ title: "Embedded A" }) }],
    });

    const polls = await basicPolls.fetchEmbeddedBasicPolls("sched-1");

    expect(polls).toEqual([{ id: "embedded-1", title: "Embedded A" }]);
    expect(firestoreMocks.getDocs).toHaveBeenCalledWith({
      path: "schedulers/sched-1/basicPolls",
    });
  });

  test("fetchRequiredEmbeddedPollsWithoutVote returns required unvoted polls only", async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: "poll-required",
          data: () => ({
            title: "Required poll",
            required: true,
            settings: { voteType: "RANKED_CHOICE" },
          }),
        },
        {
          id: "poll-with-vote",
          data: () => ({
            title: "Already voted",
            required: true,
            settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: false },
          }),
        },
      ],
    });
    firestoreMocks.getDoc
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ optionIds: ["opt-a"] }),
      });

    const polls = await basicPolls.fetchRequiredEmbeddedPollsWithoutVote(
      ["sched-1"],
      "user-1"
    );

    expect(firestoreMocks.where).toHaveBeenCalledWith("required", "==", true);
    expect(polls).toEqual([
      expect.objectContaining({
        parentType: "scheduler",
        parentId: "sched-1",
        pollId: "poll-required",
        title: "Required poll",
      }),
    ]);
  });

  test("deleteBasicPoll deletes vote docs and poll doc in a batch", async () => {
    const batch = {
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    firestoreMocks.writeBatch.mockReturnValueOnce(batch);
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ ref: { path: "vote-1" } }, { ref: { path: "vote-2" } }],
    });

    await basicPolls.deleteBasicPoll("group-1", "poll-1");

    expect(firestoreMocks.getDocs).toHaveBeenCalledWith({
      path: "questingGroups/group-1/basicPolls/poll-1/votes",
    });
    expect(batch.delete).toHaveBeenCalledWith({ path: "vote-1" });
    expect(batch.delete).toHaveBeenCalledWith({ path: "vote-2" });
    expect(batch.delete).toHaveBeenCalledWith({
      path: "questingGroups/group-1/basicPolls/poll-1",
    });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  test("deleteEmbeddedBasicPoll deletes scheduler vote docs and poll doc in a batch", async () => {
    const batch = {
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    firestoreMocks.writeBatch.mockReturnValueOnce(batch);
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ ref: { path: "scheduler-vote-1" } }],
    });

    await basicPolls.deleteEmbeddedBasicPoll("sched-1", "poll-1");

    expect(firestoreMocks.getDocs).toHaveBeenCalledWith({
      path: "schedulers/sched-1/basicPolls/poll-1/votes",
    });
    expect(batch.delete).toHaveBeenCalledWith({ path: "scheduler-vote-1" });
    expect(batch.delete).toHaveBeenCalledWith({ path: "schedulers/sched-1/basicPolls/poll-1" });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  test("resetBasicPollVotes deletes only vote docs in a batch", async () => {
    const batch = {
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    firestoreMocks.writeBatch.mockReturnValueOnce(batch);
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ ref: { path: "group-vote-1" } }, { ref: { path: "group-vote-2" } }],
    });

    await basicPolls.resetBasicPollVotes("group", "group-1", "poll-1");

    expect(firestoreMocks.getDocs).toHaveBeenCalledWith({
      path: "questingGroups/group-1/basicPolls/poll-1/votes",
    });
    expect(batch.delete).toHaveBeenCalledWith({ path: "group-vote-1" });
    expect(batch.delete).toHaveBeenCalledWith({ path: "group-vote-2" });
    expect(batch.delete).not.toHaveBeenCalledWith({
      path: "questingGroups/group-1/basicPolls/poll-1",
    });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  test("reorderEmbeddedBasicPolls writes order updates in batch", async () => {
    const batch = {
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    firestoreMocks.writeBatch.mockReturnValueOnce(batch);

    await basicPolls.reorderEmbeddedBasicPolls("sched-1", ["poll-3", "poll-1", "poll-2"]);

    expect(batch.update).toHaveBeenNthCalledWith(
      1,
      { path: "schedulers/sched-1/basicPolls/poll-3" },
      { order: 0, updatedAt: "server-time" }
    );
    expect(batch.update).toHaveBeenNthCalledWith(
      2,
      { path: "schedulers/sched-1/basicPolls/poll-1" },
      { order: 1, updatedAt: "server-time" }
    );
    expect(batch.update).toHaveBeenNthCalledWith(
      3,
      { path: "schedulers/sched-1/basicPolls/poll-2" },
      { order: 2, updatedAt: "server-time" }
    );
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  test("subscribeToGroupPolls emits mapped poll docs", async () => {
    const unsubscribe = vi.fn();
    const onUpdate = vi.fn();
    firestoreMocks.onSnapshot.mockImplementationOnce((pollsQuery, onNext) => {
      onNext({
        docs: [
          { id: "poll-1", data: () => ({ title: "A" }) },
          { id: "poll-2", data: () => ({ title: "B" }) },
        ],
      });
      return unsubscribe;
    });

    const returnedUnsubscribe = basicPolls.subscribeToGroupPolls("group-1", onUpdate);

    expect(firestoreMocks.query).toHaveBeenCalled();
    expect(firestoreMocks.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(onUpdate).toHaveBeenCalledWith([
      { id: "poll-1", title: "A" },
      { id: "poll-2", title: "B" },
    ]);
    expect(returnedUnsubscribe).toBe(unsubscribe);
  });

  test("subscribeToBasicPoll emits poll data and null when missing", async () => {
    const onUpdate = vi.fn();
    const unsubscribe = vi.fn();
    firestoreMocks.onSnapshot
      .mockImplementationOnce((ref, onNext) => {
        onNext({
          exists: () => true,
          id: "poll-1",
          data: () => ({ title: "A" }),
        });
        return unsubscribe;
      })
      .mockImplementationOnce((ref, onNext) => {
        onNext({
          exists: () => false,
        });
        return unsubscribe;
      });

    basicPolls.subscribeToBasicPoll("group-1", "poll-1", onUpdate);
    basicPolls.subscribeToBasicPoll("group-1", "poll-2", onUpdate);

    expect(onUpdate).toHaveBeenNthCalledWith(1, { id: "poll-1", title: "A" });
    expect(onUpdate).toHaveBeenNthCalledWith(2, null);
  });

  test("subscribeToEmbeddedBasicPolls emits mapped poll docs", async () => {
    const onUpdate = vi.fn();
    const unsubscribe = vi.fn();
    firestoreMocks.onSnapshot.mockImplementationOnce((pollsQuery, onNext) => {
      onNext({
        docs: [
          { id: "embedded-1", data: () => ({ title: "A", order: 0 }) },
          { id: "embedded-2", data: () => ({ title: "B", order: 1 }) },
        ],
      });
      return unsubscribe;
    });

    const returnedUnsubscribe = basicPolls.subscribeToEmbeddedBasicPolls("sched-1", onUpdate);

    expect(firestoreMocks.orderBy).toHaveBeenCalledWith("order", "asc");
    expect(onUpdate).toHaveBeenCalledWith([
      { id: "embedded-1", title: "A", order: 0 },
      { id: "embedded-2", title: "B", order: 1 },
    ]);
    expect(returnedUnsubscribe).toBe(unsubscribe);
  });

  test("cloneEmbeddedBasicPolls clones poll docs and copies submitted user votes", async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: "poll-1",
          data: () => ({
            title: "Food",
            required: true,
            order: 0,
            settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: true },
            finalResults: { winnerIds: ["opt-a"] },
          }),
        },
        {
          id: "poll-2",
          data: () => ({
            title: "DM Style",
            order: 1,
            settings: { voteType: "RANKED_CHOICE" },
          }),
        },
      ],
    });

    await basicPolls.cloneEmbeddedBasicPolls("sched-1", "sched-2", {
      clearVotes: false,
      userId: "user-1",
      votesByPollId: {
        "poll-1": { id: "user-1", optionIds: ["opt-a"], otherText: "Soup", source: "web" },
        "poll-2": { id: "user-1", rankings: [] },
      },
    });

    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      { path: "schedulers/sched-2/basicPolls/poll-1" },
      expect.objectContaining({
        title: "Food",
        required: true,
        order: 0,
        updatedAt: "server-time",
      })
    );
    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      { path: "schedulers/sched-2/basicPolls/poll-2" },
      expect.objectContaining({
        title: "DM Style",
        order: 1,
        updatedAt: "server-time",
      })
    );
    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      { path: "schedulers/sched-2/basicPolls/poll-1/votes/user-1" },
      expect.objectContaining({
        optionIds: ["opt-a"],
        otherText: "Soup",
        source: "web",
        updatedAt: "server-time",
      }),
      { merge: true }
    );
    expect(firestoreMocks.setDoc).not.toHaveBeenCalledWith(
      { path: "schedulers/sched-2/basicPolls/poll-2/votes/user-1" },
      expect.anything(),
      expect.anything()
    );
  });

  test("invalid ids short-circuit without firestore calls", async () => {
    const onUpdate = vi.fn();

    expect(await basicPolls.createBasicPoll(null, { title: "Ignored" })).toBeNull();
    expect(await basicPolls.fetchOpenGroupPollsWithoutVote([], null)).toEqual([]);
    expect(await basicPolls.fetchRequiredEmbeddedPollsWithoutVote([], null)).toEqual([]);
    await basicPolls.updateBasicPoll(null, "poll-1", { title: "Ignored" });
    await basicPolls.finalizeBasicPoll(null, "poll-1");
    await basicPolls.reopenBasicPoll(null, "poll-1");
    await basicPolls.finalizeEmbeddedBasicPoll(null, "poll-1");
    await basicPolls.reopenEmbeddedBasicPoll(null, "poll-1");
    await basicPolls.deleteBasicPoll(null, "poll-1");
    await basicPolls.createEmbeddedBasicPoll(null, { title: "Ignored" });
    await basicPolls.updateEmbeddedBasicPoll(null, "poll-1", { title: "Ignored" });
    await basicPolls.deleteEmbeddedBasicPoll(null, "poll-1");
    await basicPolls.fetchRequiredEmbeddedPollFinalizeSummary(null);
    await basicPolls.cloneEmbeddedBasicPolls(null, "sched-1");
    await basicPolls.resetBasicPollVotes(null, "group-1", "poll-1");
    await basicPolls.reorderEmbeddedBasicPolls(null, ["poll-1"]);
    const unsubscribeGroup = basicPolls.subscribeToGroupPolls(null, onUpdate);
    const unsubscribePoll = basicPolls.subscribeToBasicPoll("group-1", null, onUpdate);
    const unsubscribeEmbedded = basicPolls.subscribeToEmbeddedBasicPolls(null, onUpdate);

    expect(onUpdate).toHaveBeenCalledWith([]);
    expect(onUpdate).toHaveBeenCalledWith(null);
    expect(typeof unsubscribeGroup).toBe("function");
    expect(typeof unsubscribePoll).toBe("function");
    expect(typeof unsubscribeEmbedded).toBe("function");
    expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
    expect(firestoreMocks.getDocs).not.toHaveBeenCalled();
  });

  test("submitBasicPollVote writes merged vote data for both parent types", async () => {
    await basicPolls.submitBasicPollVote("group", "group-1", "poll-1", "user-1", {
      optionIds: ["opt-a"],
    });
    await basicPolls.submitBasicPollVote("scheduler", "sched-1", "poll-2", "user-2", {
      rankings: ["opt-z", "opt-a"],
      source: "web",
    });

    expect(firestoreMocks.setDoc).toHaveBeenNthCalledWith(
      1,
      { path: "questingGroups/group-1/basicPolls/poll-1/votes/user-1" },
      {
        optionIds: ["opt-a"],
        updatedAt: "server-time",
      },
      { merge: true }
    );
    expect(firestoreMocks.setDoc).toHaveBeenNthCalledWith(
      2,
      { path: "schedulers/sched-1/basicPolls/poll-2/votes/user-2" },
      {
        rankings: ["opt-z", "opt-a"],
        source: "web",
        updatedAt: "server-time",
      },
      { merge: true }
    );
  });

  test("deleteBasicPollVote deletes the vote doc", async () => {
    await basicPolls.deleteBasicPollVote("group", "group-1", "poll-1", "user-1");

    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith({
      path: "questingGroups/group-1/basicPolls/poll-1/votes/user-1",
    });
  });

  test("subscribeToBasicPollVotes emits mapped vote docs", async () => {
    const onUpdate = vi.fn();
    const unsubscribe = vi.fn();
    firestoreMocks.onSnapshot.mockImplementationOnce((ref, onNext) => {
      onNext({
        docs: [
          { id: "u1", data: () => ({ optionIds: ["a"] }) },
          { id: "u2", data: () => ({ optionIds: ["b"] }) },
        ],
      });
      return unsubscribe;
    });

    const returnedUnsubscribe = basicPolls.subscribeToBasicPollVotes(
      "group",
      "group-1",
      "poll-1",
      onUpdate
    );

    expect(onUpdate).toHaveBeenCalledWith([
      { id: "u1", optionIds: ["a"] },
      { id: "u2", optionIds: ["b"] },
    ]);
    expect(returnedUnsubscribe).toBe(unsubscribe);
  });

  test("subscribeToMyBasicPollVote emits vote doc and null for missing vote", async () => {
    const onUpdate = vi.fn();
    firestoreMocks.onSnapshot
      .mockImplementationOnce((ref, onNext) => {
        onNext({
          exists: () => true,
          id: "user-1",
          data: () => ({ optionIds: ["a"] }),
        });
        return () => {};
      })
      .mockImplementationOnce((ref, onNext) => {
        onNext({
          exists: () => false,
        });
        return () => {};
      });

    basicPolls.subscribeToMyBasicPollVote("group", "group-1", "poll-1", "user-1", onUpdate);
    basicPolls.subscribeToMyBasicPollVote("group", "group-1", "poll-1", "user-2", onUpdate);

    expect(onUpdate).toHaveBeenNthCalledWith(1, { id: "user-1", optionIds: ["a"] });
    expect(onUpdate).toHaveBeenNthCalledWith(2, null);
  });
});
