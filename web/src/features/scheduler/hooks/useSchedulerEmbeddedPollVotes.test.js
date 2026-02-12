import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useSchedulerEmbeddedPollVotes } from "./useSchedulerEmbeddedPollVotes";

const subscribeToEmbeddedBasicPollsMock = vi.fn();
const subscribeToBasicPollVotesMock = vi.fn();
const subscribeToMyBasicPollVoteMock = vi.fn();

vi.mock("../../../lib/data/basicPolls", () => ({
  subscribeToEmbeddedBasicPolls: (...args) => subscribeToEmbeddedBasicPollsMock(...args),
  subscribeToBasicPollVotes: (...args) => subscribeToBasicPollVotesMock(...args),
  subscribeToMyBasicPollVote: (...args) => subscribeToMyBasicPollVoteMock(...args),
}));

describe("useSchedulerEmbeddedPollVotes", () => {
  beforeEach(() => {
    subscribeToEmbeddedBasicPollsMock.mockReset();
    subscribeToBasicPollVotesMock.mockReset();
    subscribeToMyBasicPollVoteMock.mockReset();
    subscribeToEmbeddedBasicPollsMock.mockReturnValue(() => {});
    subscribeToBasicPollVotesMock.mockReturnValue(() => {});
    subscribeToMyBasicPollVoteMock.mockReturnValue(() => {});
  });

  test("skips subscriptions when scheduler id is missing", () => {
    const { result } = renderHook(() =>
      useSchedulerEmbeddedPollVotes({ schedulerId: null, userId: "user-1" })
    );

    expect(subscribeToEmbeddedBasicPollsMock).not.toHaveBeenCalled();
    expect(subscribeToBasicPollVotesMock).not.toHaveBeenCalled();
    expect(subscribeToMyBasicPollVoteMock).not.toHaveBeenCalled();
    expect(result.current.embeddedPolls).toEqual([]);
    expect(result.current.embeddedPollsLoading).toBe(false);
  });

  test("tracks votes, vote counts, and draft hydration from subscriptions", () => {
    const embeddedPollCallbacks = {};
    const votesCallbacksByPollId = {};
    const myVoteCallbacksByPollId = {};

    subscribeToEmbeddedBasicPollsMock.mockImplementation((schedulerId, onData) => {
      embeddedPollCallbacks.onData = onData;
      return () => {};
    });
    subscribeToBasicPollVotesMock.mockImplementation((scope, schedulerId, pollId, onData) => {
      votesCallbacksByPollId[pollId] = onData;
      return () => {};
    });
    subscribeToMyBasicPollVoteMock.mockImplementation((scope, schedulerId, pollId, userId, onData) => {
      myVoteCallbacksByPollId[pollId] = onData;
      return () => {};
    });

    const { result } = renderHook(() =>
      useSchedulerEmbeddedPollVotes({ schedulerId: "sched-1", userId: "user-1" })
    );

    act(() => {
      embeddedPollCallbacks.onData([
        {
          id: "poll-multi",
          settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: true },
        },
        {
          id: "poll-ranked",
          settings: { voteType: "RANKED_CHOICE" },
        },
      ]);
    });

    act(() => {
      votesCallbacksByPollId["poll-multi"]([
        { id: "a", optionIds: ["opt-1"] },
        { id: "b", otherText: " custom " },
        { id: "c", optionIds: [] },
      ]);
      votesCallbacksByPollId["poll-ranked"]([
        { id: "a", rankings: ["opt-2", "opt-1"] },
        { id: "b", rankings: [] },
      ]);
      myVoteCallbacksByPollId["poll-multi"]({ optionIds: ["opt-1"], otherText: "note" });
      myVoteCallbacksByPollId["poll-ranked"]({ rankings: ["opt-2"] });
    });

    expect(result.current.embeddedPollsLoading).toBe(false);
    expect(result.current.embeddedPollVoteCounts).toEqual({
      "poll-multi": 2,
      "poll-ranked": 1,
    });
    expect(result.current.embeddedVotesByPoll["poll-multi"]).toHaveLength(3);
    expect(result.current.embeddedVotesByPoll["poll-ranked"]).toHaveLength(2);
    expect(result.current.embeddedVoteDrafts).toEqual({
      "poll-multi": { optionIds: ["opt-1"], otherText: "note" },
      "poll-ranked": { rankings: ["opt-2"] },
    });
  });
});
