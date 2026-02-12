import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useDashboardBasicPollSource } from "./use-dashboard-basic-poll-source";

const fetchDashboardGroupBasicPollsMock = vi.fn();
const fetchDashboardEmbeddedBasicPollsMock = vi.fn();

vi.mock("../../../lib/data/basicPolls", () => ({
  fetchDashboardGroupBasicPolls: (...args) => fetchDashboardGroupBasicPollsMock(...args),
  fetchDashboardEmbeddedBasicPolls: (...args) => fetchDashboardEmbeddedBasicPollsMock(...args),
}));

describe("useDashboardBasicPollSource", () => {
  beforeEach(() => {
    fetchDashboardGroupBasicPollsMock.mockReset();
    fetchDashboardEmbeddedBasicPollsMock.mockReset();
    fetchDashboardGroupBasicPollsMock.mockResolvedValue([]);
    fetchDashboardEmbeddedBasicPollsMock.mockResolvedValue([]);
  });

  test("skips fetch while dashboard dependencies are not ready", () => {
    renderHook(() =>
      useDashboardBasicPollSource({
        userId: "user-1",
        groupIdsKey: "group-1",
        dashboardSchedulerIdsKey: "sched-1",
        isReady: false,
      })
    );

    expect(fetchDashboardGroupBasicPollsMock).not.toHaveBeenCalled();
    expect(fetchDashboardEmbeddedBasicPollsMock).not.toHaveBeenCalled();
  });

  test("fetches and merges group + embedded polls when ready", async () => {
    fetchDashboardGroupBasicPollsMock.mockResolvedValue([{ pollId: "group-poll" }]);
    fetchDashboardEmbeddedBasicPollsMock.mockResolvedValue([{ pollId: "embedded-poll" }]);

    const { result } = renderHook(() =>
      useDashboardBasicPollSource({
        userId: "user-1",
        groupIdsKey: "group-1|group-2",
        dashboardSchedulerIdsKey: "sched-1",
        isReady: true,
      })
    );

    await waitFor(() => expect(result.current.basicPollLoading).toBe(false));
    expect(fetchDashboardGroupBasicPollsMock).toHaveBeenCalledWith(["group-1", "group-2"], "user-1");
    expect(fetchDashboardEmbeddedBasicPollsMock).toHaveBeenCalledWith(["sched-1"], "user-1");
    expect(result.current.basicPollSourceItems).toEqual([
      { pollId: "group-poll" },
      { pollId: "embedded-poll" },
    ]);
  });

  test("clears items and stops loading when fetch fails", async () => {
    fetchDashboardGroupBasicPollsMock.mockRejectedValue(new Error("boom"));
    fetchDashboardEmbeddedBasicPollsMock.mockResolvedValue([{ pollId: "embedded-poll" }]);

    const { result } = renderHook(() =>
      useDashboardBasicPollSource({
        userId: "user-1",
        groupIdsKey: "group-1",
        dashboardSchedulerIdsKey: "sched-1",
        isReady: true,
      })
    );

    await waitFor(() => expect(result.current.basicPollLoading).toBe(false));
    expect(result.current.basicPollSourceItems).toEqual([]);
  });
});
