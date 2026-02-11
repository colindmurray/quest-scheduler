import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DashboardPage from "./DashboardPage";
import {
  pollInviteNotificationId,
  pollInviteLegacyNotificationId,
} from "../../lib/data/notifications";

const acceptInviteMock = vi.fn();
const declineInviteMock = vi.fn();
const removeLocalMock = vi.fn();
const fetchOpenGroupPollsWithoutVoteMock = vi.fn();
const fetchRequiredEmbeddedPollsWithoutVoteMock = vi.fn();

let authState;
let userSettingsState;
let questingGroupsState;
let pollInvitesState;
let schedulersByCreatorState;
let schedulersByGroupIdsState;
let schedulersByParticipantState;
let userProfilesState;
let userProfilesByIdsState;
let schedulerAttendanceState;

vi.mock("../../app/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("../../hooks/useUserSettings", () => ({
  useUserSettings: () => userSettingsState,
}));

vi.mock("../../hooks/useQuestingGroups", () => ({
  useQuestingGroups: () => questingGroupsState,
}));

vi.mock("../../hooks/usePollInvites", () => ({
  usePollInvites: () => pollInvitesState,
}));

vi.mock("../../hooks/useNotifications", () => ({
  useNotifications: () => ({ removeLocal: removeLocalMock }),
}));

vi.mock("../../hooks/useSchedulers", () => ({
  useSchedulersByCreator: () => schedulersByCreatorState,
  useSchedulersByGroupIds: () => schedulersByGroupIdsState,
  useSchedulersByParticipant: () => schedulersByParticipantState,
}));

vi.mock("../../hooks/useUserProfiles", () => ({
  useUserProfiles: () => userProfilesState,
  useUserProfilesByIds: () => userProfilesByIdsState,
}));

vi.mock("./hooks/useSchedulerAttendance", () => ({
  useSchedulerAttendance: () => schedulerAttendanceState,
}));

vi.mock("../../lib/data/basicPolls", () => ({
  fetchOpenGroupPollsWithoutVote: (...args) => fetchOpenGroupPollsWithoutVoteMock(...args),
  fetchRequiredEmbeddedPollsWithoutVote: (...args) =>
    fetchRequiredEmbeddedPollsWithoutVoteMock(...args),
}));

describe("DashboardPage pending invite actions", () => {
  beforeEach(() => {
    authState = { user: { uid: "user-1", email: "invitee@example.com" } };
    userSettingsState = { archivedPolls: [], loading: false, settings: {} };
    questingGroupsState = { groups: [], getGroupColor: () => null };
    pollInvitesState = {
      pendingInvites: [
        {
          id: "sched-1",
          title: "Invite Poll",
          creatorEmail: "creator@example.com",
          pendingInviteMeta: {
            "invitee@example.com": { invitedByEmail: "inviter@example.com" },
          },
        },
      ],
      loading: false,
      acceptInvite: acceptInviteMock,
      declineInvite: declineInviteMock,
    };
    schedulersByCreatorState = { data: [], loading: false };
    schedulersByGroupIdsState = { data: [], loading: false, error: null };
    schedulersByParticipantState = { data: [], loading: false };
    userProfilesState = {
      enrichUsers: (emails = []) => emails.map((email) => ({ email })),
    };
    userProfilesByIdsState = { profiles: {}, loading: false };
    schedulerAttendanceState = {
      slotsByScheduler: {},
      votesByScheduler: {},
      votersByScheduler: {},
    };

    acceptInviteMock.mockResolvedValue(undefined);
    declineInviteMock.mockResolvedValue(undefined);
    removeLocalMock.mockReset();
    acceptInviteMock.mockClear();
    declineInviteMock.mockClear();
    fetchOpenGroupPollsWithoutVoteMock.mockResolvedValue([]);
    fetchRequiredEmbeddedPollsWithoutVoteMock.mockResolvedValue([]);
    fetchOpenGroupPollsWithoutVoteMock.mockClear();
    fetchRequiredEmbeddedPollsWithoutVoteMock.mockClear();
  });

  test("accept button accepts invite without redirect", async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /accept invite/i }));

    await waitFor(() => {
      expect(acceptInviteMock).toHaveBeenCalledWith("sched-1");
      expect(removeLocalMock).toHaveBeenCalledWith(
        pollInviteNotificationId("sched-1", "invitee@example.com")
      );
      expect(removeLocalMock).toHaveBeenCalledWith(
        pollInviteLegacyNotificationId("sched-1")
      );
    });
  });

  test("decline button declines invite without redirect", async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /decline invite/i }));

    await waitFor(() => {
      expect(declineInviteMock).toHaveBeenCalledWith("sched-1");
      expect(removeLocalMock).toHaveBeenCalledWith(
        pollInviteNotificationId("sched-1", "invitee@example.com")
      );
      expect(removeLocalMock).toHaveBeenCalledWith(
        pollInviteLegacyNotificationId("sched-1")
      );
    });
  });

  test("renders polls to vote on with group and embedded poll links", async () => {
    pollInvitesState = {
      pendingInvites: [],
      loading: false,
      acceptInvite: acceptInviteMock,
      declineInvite: declineInviteMock,
    };
    questingGroupsState = {
      groups: [{ id: "group-1", name: "Fellowship", memberIds: ["user-1"] }],
      getGroupColor: () => null,
    };
    schedulersByParticipantState = {
      data: [
        {
          id: "sched-open",
          title: "Sunday Session",
          status: "OPEN",
          participantIds: ["user-1"],
          pendingInvites: [],
        },
      ],
      loading: false,
    };
    fetchOpenGroupPollsWithoutVoteMock.mockResolvedValueOnce([
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-g1",
        title: "Snack Vote",
        settings: {
          voteType: "MULTIPLE_CHOICE",
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    ]);
    fetchRequiredEmbeddedPollsWithoutVoteMock.mockResolvedValueOnce([
      {
        parentType: "scheduler",
        parentId: "sched-open",
        pollId: "poll-s1",
        title: "DM Style",
        required: true,
        settings: {
          voteType: "RANKED_CHOICE",
          deadlineAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      },
    ]);

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await screen.findByText("Polls to vote on");
    expect(screen.getByText("in Fellowship")).toBeTruthy();
    expect(screen.getByText("in Sunday Session")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Snack Vote/i }).getAttribute("href")).toBe(
      "/groups/group-1/polls/poll-g1"
    );
    expect(screen.getByRole("link", { name: /DM Style/i }).getAttribute("href")).toBe(
      "/scheduler/sched-open?poll=poll-s1"
    );
    expect(screen.getByText("Multiple choice")).toBeTruthy();
    expect(screen.getByText("Ranked choice")).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
  });

  test("does not render polls-to-vote section when no unvoted polls exist", async () => {
    pollInvitesState = {
      pendingInvites: [],
      loading: false,
      acceptInvite: acceptInviteMock,
      declineInvite: declineInviteMock,
    };

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(fetchOpenGroupPollsWithoutVoteMock).toHaveBeenCalled();
      expect(fetchRequiredEmbeddedPollsWithoutVoteMock).toHaveBeenCalled();
    });
    expect(screen.queryByText("Polls to vote on")).toBeNull();
  });
});
