import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useDashboardBasicPollActions } from "./use-dashboard-basic-poll-actions";

const deleteBasicPollMock = vi.fn();
const deleteEmbeddedBasicPollMock = vi.fn();
const finalizeBasicPollForParentMock = vi.fn();
const reopenBasicPollForParentMock = vi.fn();

vi.mock("../../../lib/data/basicPolls", () => ({
  deleteBasicPoll: (...args) => deleteBasicPollMock(...args),
  deleteEmbeddedBasicPoll: (...args) => deleteEmbeddedBasicPollMock(...args),
  finalizeBasicPollForParent: (...args) => finalizeBasicPollForParentMock(...args),
  reopenBasicPollForParent: (...args) => reopenBasicPollForParentMock(...args),
}));

describe("useDashboardBasicPollActions", () => {
  const archivePoll = vi.fn();
  const unarchivePoll = vi.fn();
  const refreshBasicPolls = vi.fn();

  beforeEach(() => {
    archivePoll.mockReset();
    unarchivePoll.mockReset();
    refreshBasicPolls.mockReset();
    deleteBasicPollMock.mockReset();
    deleteEmbeddedBasicPollMock.mockReset();
    finalizeBasicPollForParentMock.mockReset();
    reopenBasicPollForParentMock.mockReset();

    archivePoll.mockResolvedValue(undefined);
    unarchivePoll.mockResolvedValue(undefined);
    deleteBasicPollMock.mockResolvedValue(undefined);
    deleteEmbeddedBasicPollMock.mockResolvedValue(undefined);
    finalizeBasicPollForParentMock.mockResolvedValue(undefined);
    reopenBasicPollForParentMock.mockResolvedValue(undefined);
  });

  test("archives and unarchives polls while toggling busy state", async () => {
    const { result } = renderHook(() =>
      useDashboardBasicPollActions({ archivePoll, unarchivePoll, refreshBasicPolls })
    );
    const poll = { archiveKey: "basic:group:g1:p1", isArchived: false };

    await act(async () => {
      await result.current.handleToggleBasicPollArchive(poll);
    });

    expect(archivePoll).toHaveBeenCalledWith("basic:group:g1:p1");
    expect(result.current.basicPollArchiveBusy["basic:group:g1:p1"]).toBe(false);

    await act(async () => {
      await result.current.handleToggleBasicPollArchive({ ...poll, isArchived: true });
    });
    expect(unarchivePoll).toHaveBeenCalledWith("basic:group:g1:p1");
  });

  test("finalize and reopen actions call server helpers and refresh", async () => {
    const { result } = renderHook(() =>
      useDashboardBasicPollActions({ archivePoll, unarchivePoll, refreshBasicPolls })
    );
    const poll = {
      archiveKey: "basic:group:g1:p1",
      parentType: "group",
      parentId: "g1",
      pollId: "p1",
    };

    await act(async () => {
      await result.current.handleFinalizeBasicPoll(poll);
    });
    expect(finalizeBasicPollForParentMock).toHaveBeenCalledWith("group", "g1", "p1");
    expect(refreshBasicPolls).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.handleReopenBasicPoll(poll);
    });
    expect(reopenBasicPollForParentMock).toHaveBeenCalledWith("group", "g1", "p1");
    expect(refreshBasicPolls).toHaveBeenCalledTimes(2);
  });

  test("delete flow routes to the correct delete helper", async () => {
    const { result } = renderHook(() =>
      useDashboardBasicPollActions({ archivePoll, unarchivePoll, refreshBasicPolls })
    );
    const groupPoll = {
      archiveKey: "basic:group:g1:p1",
      parentType: "group",
      parentId: "g1",
      pollId: "p1",
    };

    act(() => {
      result.current.handleDeleteBasicPoll(groupPoll);
    });
    expect(result.current.deletePollRequest).toEqual(groupPoll);

    await act(async () => {
      await result.current.confirmDeleteBasicPoll();
    });
    expect(deleteBasicPollMock).toHaveBeenCalledWith("g1", "p1", { useServer: true });
    expect(result.current.deletePollRequest).toBeNull();

    const schedulerPoll = {
      archiveKey: "basic:scheduler:s1:p2",
      parentType: "scheduler",
      parentId: "s1",
      pollId: "p2",
    };
    act(() => {
      result.current.handleDeleteBasicPoll(schedulerPoll);
    });
    await act(async () => {
      await result.current.confirmDeleteBasicPoll();
    });
    expect(deleteEmbeddedBasicPollMock).toHaveBeenCalledWith("s1", "p2", { useServer: true });
    await waitFor(() => expect(refreshBasicPolls).toHaveBeenCalledTimes(2));
  });
});
