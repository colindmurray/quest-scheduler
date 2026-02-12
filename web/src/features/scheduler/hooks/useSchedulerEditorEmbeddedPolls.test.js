import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useSchedulerEditorEmbeddedPolls } from "./useSchedulerEditorEmbeddedPolls";

const subscribeToEmbeddedBasicPollsMock = vi.fn();
const subscribeToBasicPollVotesMock = vi.fn();

vi.mock("../../../lib/data/basicPolls", () => ({
  subscribeToEmbeddedBasicPolls: (...args) => subscribeToEmbeddedBasicPollsMock(...args),
  subscribeToBasicPollVotes: (...args) => subscribeToBasicPollVotesMock(...args),
}));

describe("useSchedulerEditorEmbeddedPolls", () => {
  beforeEach(() => {
    subscribeToEmbeddedBasicPollsMock.mockReset();
    subscribeToBasicPollVotesMock.mockReset();
    subscribeToEmbeddedBasicPollsMock.mockReturnValue(() => {});
    subscribeToBasicPollVotesMock.mockReturnValue(() => {});
  });

  test("resets state when not editing", () => {
    const { result } = renderHook(() =>
      useSchedulerEditorEmbeddedPolls({ isEditing: false, schedulerId: "sched-1" })
    );

    expect(subscribeToEmbeddedBasicPollsMock).not.toHaveBeenCalled();
    expect(subscribeToBasicPollVotesMock).not.toHaveBeenCalled();
    expect(result.current.embeddedPolls).toEqual([]);
    expect(result.current.embeddedPollsLoading).toBe(false);
    expect(result.current.embeddedPollVoteCounts).toEqual({});
  });

  test("subscribes to poll + vote docs and computes submitted counts", () => {
    const embeddedPollCallbacks = {};
    const votesCallbacksByPoll = {};

    subscribeToEmbeddedBasicPollsMock.mockImplementation((schedulerId, onData) => {
      embeddedPollCallbacks.onData = onData;
      return () => {};
    });
    subscribeToBasicPollVotesMock.mockImplementation((scope, schedulerId, pollId, onData) => {
      votesCallbacksByPoll[pollId] = onData;
      return () => {};
    });

    const { result } = renderHook(() =>
      useSchedulerEditorEmbeddedPolls({ isEditing: true, schedulerId: "sched-1" })
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
      votesCallbacksByPoll["poll-multi"]([
        { optionIds: ["opt-1"] },
        { otherText: " custom " },
        { optionIds: [] },
      ]);
      votesCallbacksByPoll["poll-ranked"]([
        { rankings: ["opt-2", "opt-1"] },
        { rankings: [] },
      ]);
    });

    expect(result.current.embeddedPollsLoading).toBe(false);
    expect(result.current.embeddedPolls).toHaveLength(2);
    expect(result.current.embeddedPollVoteCounts).toEqual({
      "poll-multi": 2,
      "poll-ranked": 1,
    });
  });
});
