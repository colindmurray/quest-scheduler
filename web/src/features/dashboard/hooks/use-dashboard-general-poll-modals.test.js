import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useDashboardGeneralPollModals } from "./use-dashboard-general-poll-modals";

describe("useDashboardGeneralPollModals", () => {
  test("opens group poll modal and uses safe navigation for scheduler poll links", () => {
    const safeNavigate = vi.fn();
    const refreshBasicPolls = vi.fn();
    const { result } = renderHook(() =>
      useDashboardGeneralPollModals({
        initialGroupPollModal: null,
        safeNavigate,
        refreshBasicPolls,
      })
    );

    act(() => {
      result.current.handleOpenBasicPoll({
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-1",
        voteLink: "/groups/group-1/polls/poll-1",
      });
    });
    expect(result.current.activeGroupPollModal).toEqual({ groupId: "group-1", pollId: "poll-1" });
    expect(safeNavigate).not.toHaveBeenCalled();

    act(() => {
      result.current.handleOpenBasicPoll({
        parentType: "scheduler",
        parentId: "scheduler-1",
        pollId: "poll-2",
        voteLink: "/scheduler/scheduler-1?poll=poll-2",
      });
    });
    expect(safeNavigate).toHaveBeenCalledWith("/scheduler/scheduler-1?poll=poll-2", {
      compareMode: "pathname+search",
    });
  });

  test("edit flow sets editing state and closes create/group modal", () => {
    const { result } = renderHook(() =>
      useDashboardGeneralPollModals({
        initialGroupPollModal: null,
        safeNavigate: vi.fn(),
        refreshBasicPolls: vi.fn(),
      })
    );

    act(() => {
      result.current.handleOpenBasicPoll({
        parentType: "group",
        parentId: "group-seed",
        pollId: "poll-seed",
        voteLink: "/groups/group-seed/polls/poll-seed",
      });
      result.current.setCreateGeneralPollOpen(true);
      result.current.handleEditBasicPoll({
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-1",
        title: "General poll",
      });
    });

    expect(result.current.createGeneralPollOpen).toBe(false);
    expect(result.current.activeGroupPollModal).toBeNull();
    expect(result.current.editingGeneralPoll).toMatchObject({
      groupId: "group-1",
      pollId: "poll-1",
    });
  });

  test("created/edited handlers refresh and route to active modal", () => {
    const refreshBasicPolls = vi.fn();
    const { result } = renderHook(() =>
      useDashboardGeneralPollModals({
        initialGroupPollModal: null,
        safeNavigate: vi.fn(),
        refreshBasicPolls,
      })
    );

    act(() => {
      result.current.handleCreatedGeneralPoll("poll-1", "group-1");
    });
    expect(refreshBasicPolls).toHaveBeenCalledTimes(1);
    expect(result.current.activeGroupPollModal).toEqual({ groupId: "group-1", pollId: "poll-1" });

    act(() => {
      result.current.handleGroupModalEditPoll({
        groupId: "group-2",
        pollId: "poll-2",
        poll: { title: "Edited" },
      });
    });
    expect(result.current.editingGeneralPoll).toMatchObject({
      groupId: "group-2",
      pollId: "poll-2",
    });

    act(() => {
      result.current.handleEditedGeneralPoll("poll-3", "group-3");
    });
    expect(refreshBasicPolls).toHaveBeenCalledTimes(2);
    expect(result.current.editingGeneralPoll).toBeNull();
    expect(result.current.activeGroupPollModal).toEqual({ groupId: "group-3", pollId: "poll-3" });
  });
});
