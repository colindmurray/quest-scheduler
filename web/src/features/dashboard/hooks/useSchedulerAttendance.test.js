import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSchedulerAttendance } from "./useSchedulerAttendance";

vi.mock("../../../lib/data/schedulers", () => ({
  fetchSchedulerSlots: vi.fn(),
  fetchSchedulerVotes: vi.fn(),
  fetchUserSchedulerVote: vi.fn(),
}));

import {
  fetchSchedulerSlots,
  fetchSchedulerVotes,
  fetchUserSchedulerVote,
} from "../../../lib/data/schedulers";

const mockFetchSchedulerSlots = vi.mocked(fetchSchedulerSlots);
const mockFetchSchedulerVotes = vi.mocked(fetchSchedulerVotes);
const mockFetchUserSchedulerVote = vi.mocked(fetchUserSchedulerVote);

describe("useSchedulerAttendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchUserSchedulerVote.mockResolvedValue(null);
  });

  it("filters out empty scheduler vote docs from vote and voter summaries", async () => {
    mockFetchSchedulerSlots.mockResolvedValue([
      { id: "slot-1", start: "2026-02-20T18:00:00.000Z", end: "2026-02-20T20:00:00.000Z" },
    ]);
    mockFetchSchedulerVotes.mockResolvedValue([
      { id: "user-submitted", userEmail: "submitted@example.com", votes: { "slot-1": "FEASIBLE" }, noTimesWork: false },
      { id: "user-pending", userEmail: "pending@example.com", votes: {}, noTimesWork: false },
      { id: "user-unavailable", userEmail: "unavailable@example.com", votes: {}, noTimesWork: true },
    ]);

    const { result } = renderHook(() => useSchedulerAttendance([{ id: "sched-1" }]));

    await waitFor(() => {
      expect(result.current.votesByScheduler["sched-1"]).toBeDefined();
    });

    expect(result.current.votesByScheduler["sched-1"].map((entry) => entry.id).sort()).toEqual(
      ["user-submitted", "user-unavailable"].sort()
    );
    expect(result.current.votersByScheduler["sched-1"].map((entry) => entry.id).sort()).toEqual(
      ["user-submitted", "user-unavailable"].sort()
    );
  });

  it("returns only the current user's submitted vote when visibility blocks global vote reads", async () => {
    mockFetchSchedulerSlots.mockResolvedValue([
      { id: "slot-1", start: "2026-02-20T18:00:00.000Z", end: "2026-02-20T20:00:00.000Z" },
    ]);
    mockFetchUserSchedulerVote.mockResolvedValue({
      id: "viewer-1",
      userEmail: "viewer@example.com",
      votes: { "slot-1": "FEASIBLE" },
      noTimesWork: false,
    });

    const { result } = renderHook(() =>
      useSchedulerAttendance(
        [
          {
            id: "sched-hidden",
            voteVisibility: "hidden",
            status: "OPEN",
          },
        ],
        "viewer-1"
      )
    );

    await waitFor(() => {
      expect(result.current.votesByScheduler["sched-hidden"]).toBeDefined();
    });

    expect(mockFetchSchedulerVotes).not.toHaveBeenCalled();
    expect(result.current.votesByScheduler["sched-hidden"].map((entry) => entry.id)).toEqual([
      "viewer-1",
    ]);
  });

  it("unlocks hidden_while_voting once the viewer has submitted", async () => {
    mockFetchSchedulerSlots.mockResolvedValue([
      { id: "slot-1", start: "2026-02-20T18:00:00.000Z", end: "2026-02-20T20:00:00.000Z" },
    ]);
    mockFetchUserSchedulerVote.mockResolvedValue({
      id: "viewer-1",
      userEmail: "viewer@example.com",
      votes: { "slot-1": "FEASIBLE" },
      noTimesWork: false,
    });
    mockFetchSchedulerVotes.mockResolvedValue([
      { id: "viewer-1", userEmail: "viewer@example.com", votes: { "slot-1": "FEASIBLE" }, noTimesWork: false },
      { id: "other-1", userEmail: "other@example.com", votes: { "slot-1": "PREFERRED" }, noTimesWork: false },
    ]);

    const { result } = renderHook(() =>
      useSchedulerAttendance(
        [
          {
            id: "sched-hidden-while",
            voteVisibility: "hidden_while_voting",
            status: "OPEN",
          },
        ],
        "viewer-1"
      )
    );

    await waitFor(() => {
      expect(result.current.votesByScheduler["sched-hidden-while"]).toBeDefined();
    });

    expect(mockFetchSchedulerVotes).toHaveBeenCalledWith("sched-hidden-while");
    expect(
      result.current.votesByScheduler["sched-hidden-while"].map((entry) => entry.id).sort()
    ).toEqual(["other-1", "viewer-1"].sort());
  });
});
