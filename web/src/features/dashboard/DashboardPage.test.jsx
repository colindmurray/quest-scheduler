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
const fetchDashboardGroupBasicPollsMock = vi.fn();
const fetchDashboardEmbeddedBasicPollsMock = vi.fn();
const subscribeToBasicPollMock = vi.fn();
const subscribeToBasicPollVotesMock = vi.fn();
const subscribeToMyBasicPollVoteMock = vi.fn();
const submitBasicPollVoteMock = vi.fn();
const deleteBasicPollVoteMock = vi.fn();
const createBasicPollMock = vi.fn();
const updateBasicPollMock = vi.fn();
const deleteBasicPollMock = vi.fn();
const deleteEmbeddedBasicPollMock = vi.fn();
const finalizeBasicPollForParentMock = vi.fn();
const reopenBasicPollForParentMock = vi.fn();

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

vi.mock("../../components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }) => <>{children}</>,
  DropdownMenuContent: ({ children }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled, className }) => (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
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
  fetchDashboardGroupBasicPolls: (...args) => fetchDashboardGroupBasicPollsMock(...args),
  fetchDashboardEmbeddedBasicPolls: (...args) =>
    fetchDashboardEmbeddedBasicPollsMock(...args),
  createBasicPoll: (...args) => createBasicPollMock(...args),
  subscribeToBasicPoll: (...args) => subscribeToBasicPollMock(...args),
  subscribeToBasicPollVotes: (...args) => subscribeToBasicPollVotesMock(...args),
  subscribeToMyBasicPollVote: (...args) => subscribeToMyBasicPollVoteMock(...args),
  submitBasicPollVote: (...args) => submitBasicPollVoteMock(...args),
  deleteBasicPollVote: (...args) => deleteBasicPollVoteMock(...args),
  updateBasicPoll: (...args) => updateBasicPollMock(...args),
  deleteBasicPoll: (...args) => deleteBasicPollMock(...args),
  deleteEmbeddedBasicPoll: (...args) => deleteEmbeddedBasicPollMock(...args),
  finalizeBasicPollForParent: (...args) => finalizeBasicPollForParentMock(...args),
  reopenBasicPollForParent: (...args) => reopenBasicPollForParentMock(...args),
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
    fetchDashboardGroupBasicPollsMock.mockResolvedValue([]);
    fetchDashboardEmbeddedBasicPollsMock.mockResolvedValue([]);
    fetchDashboardGroupBasicPollsMock.mockClear();
    fetchDashboardEmbeddedBasicPollsMock.mockClear();
    createBasicPollMock.mockClear();
    subscribeToBasicPollMock.mockImplementation((_groupId, _pollId, onUpdate) => {
      onUpdate(null);
      return () => {};
    });
    subscribeToBasicPollVotesMock.mockImplementation((_type, _groupId, _pollId, onUpdate) => {
      onUpdate([]);
      return () => {};
    });
    subscribeToMyBasicPollVoteMock.mockImplementation(
      (_type, _groupId, _pollId, _userId, onUpdate) => {
        onUpdate(null);
        return () => {};
      }
    );
    submitBasicPollVoteMock.mockResolvedValue(undefined);
    deleteBasicPollVoteMock.mockResolvedValue(undefined);
    createBasicPollMock.mockResolvedValue("poll-created");
    updateBasicPollMock.mockResolvedValue(undefined);
    deleteBasicPollMock.mockResolvedValue(undefined);
    deleteEmbeddedBasicPollMock.mockResolvedValue(undefined);
    finalizeBasicPollForParentMock.mockResolvedValue(undefined);
    reopenBasicPollForParentMock.mockResolvedValue(undefined);
    updateBasicPollMock.mockClear();
    deleteBasicPollMock.mockClear();
    deleteEmbeddedBasicPollMock.mockClear();
    finalizeBasicPollForParentMock.mockClear();
    reopenBasicPollForParentMock.mockClear();
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

  test("renders basic poll cards with needs-vote and open-voted tabs", async () => {
    pollInvitesState = {
      pendingInvites: [],
      loading: false,
      acceptInvite: acceptInviteMock,
      declineInvite: declineInviteMock,
    };
    questingGroupsState = {
      groups: [{ id: "group-1", name: "Fellowship", memberIds: ["user-1"], creatorId: "user-1" }],
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
    fetchDashboardGroupBasicPollsMock.mockResolvedValueOnce([
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-g1",
        title: "Snack Vote",
        status: "OPEN",
        hasVoted: false,
        voterIds: [],
        settings: {
          voteType: "MULTIPLE_CHOICE",
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    ]);
    fetchDashboardEmbeddedBasicPollsMock.mockResolvedValueOnce([
      {
        parentType: "scheduler",
        parentId: "sched-open",
        pollId: "poll-s1",
        title: "DM Style",
        required: true,
        status: "OPEN",
        hasVoted: true,
        voterIds: ["user-1"],
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

    await screen.findByText("General Polls");
    expect(screen.getByText("Snack Vote")).toBeTruthy();
    expect(screen.getByText("in Fellowship")).toBeTruthy();
    expect(screen.getByText("Multiple choice")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Open voted \(1\)/i }));
    await screen.findByText("DM Style");
    expect(screen.getByText("in Sunday Session")).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit vote: DM Style" })).toBeTruthy();
  });

  test("shows empty-state copy when no basic polls exist", async () => {
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
      expect(fetchDashboardGroupBasicPollsMock).toHaveBeenCalled();
      expect(fetchDashboardEmbeddedBasicPollsMock).toHaveBeenCalled();
    });
    expect(fetchDashboardGroupBasicPollsMock).toHaveBeenCalledTimes(1);
    expect(fetchDashboardEmbeddedBasicPollsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("General Polls")).toBeTruthy();
    expect(screen.getByText("No open general polls need your vote right now.")).toBeTruthy();
  });

  test("shows general poll create action for questing group members", async () => {
    pollInvitesState = {
      pendingInvites: [],
      loading: false,
      acceptInvite: acceptInviteMock,
      declineInvite: declineInviteMock,
    };
    questingGroupsState = {
      groups: [
        {
          id: "group-1",
          name: "Fellowship",
          memberIds: ["user-1"],
          creatorId: "user-1",
        },
      ],
      getGroupColor: () => null,
    };

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await screen.findByText("General Polls");
    const createButton = screen.getByRole("button", { name: "Create new general poll" });
    expect(createButton).toBeTruthy();
    fireEvent.click(createButton);
    expect(await screen.findByText(/Create a standalone poll for/i)).toBeTruthy();
    expect(screen.getByText("Questing group")).toBeTruthy();
  });

  test("filters session and general poll cards by dashboard questing group selector", async () => {
    pollInvitesState = {
      pendingInvites: [],
      loading: false,
      acceptInvite: acceptInviteMock,
      declineInvite: declineInviteMock,
    };
    questingGroupsState = {
      groups: [
        { id: "group-1", name: "Alpha", memberIds: ["user-1"], creatorId: "user-1" },
        { id: "group-2", name: "Raiders", memberIds: ["user-1"], creatorId: "user-1" },
      ],
      getGroupColor: () => null,
    };
    schedulersByParticipantState = {
      data: [
        {
          id: "sched-1",
          title: "Alpha Session",
          status: "OPEN",
          participantIds: ["user-1"],
          questingGroupId: "group-1",
          pendingInvites: [],
        },
        {
          id: "sched-2",
          title: "Raiders Session",
          status: "OPEN",
          participantIds: ["user-1"],
          questingGroupId: "group-2",
          pendingInvites: [],
        },
      ],
      loading: false,
    };
    fetchDashboardGroupBasicPollsMock.mockResolvedValueOnce([
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-g1",
        title: "Alpha Poll",
        status: "OPEN",
        hasVoted: false,
        voterIds: [],
        settings: {
          voteType: "MULTIPLE_CHOICE",
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
      {
        parentType: "group",
        parentId: "group-2",
        pollId: "poll-g2",
        title: "Raiders Poll",
        status: "OPEN",
        hasVoted: false,
        voterIds: [],
        settings: {
          voteType: "MULTIPLE_CHOICE",
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    ]);
    fetchDashboardEmbeddedBasicPollsMock.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <DashboardPage initialGroupFilterId="group-2" />
      </MemoryRouter>
    );

    await screen.findByText("Raiders Poll");
    expect(screen.queryByText("Alpha Poll")).toBeNull();
    expect(screen.queryByText("Alpha Session")).toBeNull();
    expect(screen.getByText("Raiders Poll")).toBeTruthy();
    expect(screen.getByText("Raiders Session")).toBeTruthy();
  });

  test("applies dashboard text filter to session and general poll titles/descriptions", async () => {
    pollInvitesState = {
      pendingInvites: [],
      loading: false,
      acceptInvite: acceptInviteMock,
      declineInvite: declineInviteMock,
    };
    questingGroupsState = {
      groups: [
        { id: "group-1", name: "Alpha", memberIds: ["user-1"], creatorId: "user-1" },
      ],
      getGroupColor: () => null,
    };
    schedulersByParticipantState = {
      data: [
        {
          id: "sched-1",
          title: "Alpha Session",
          description: "Raid prep details",
          status: "OPEN",
          participantIds: ["user-1"],
          questingGroupId: "group-1",
          pendingInvites: [],
        },
        {
          id: "sched-2",
          title: "Sunday Session",
          description: "Downtime",
          status: "OPEN",
          participantIds: ["user-1"],
          questingGroupId: "group-1",
          pendingInvites: [],
        },
      ],
      loading: false,
    };
    fetchDashboardGroupBasicPollsMock.mockResolvedValueOnce([
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-a",
        title: "Raid Food",
        description: "Pick snacks",
        status: "OPEN",
        hasVoted: false,
        voterIds: [],
        settings: {
          voteType: "MULTIPLE_CHOICE",
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-b",
        title: "Casual Hangout",
        description: "Weekend chatter",
        status: "OPEN",
        hasVoted: false,
        voterIds: [],
        settings: {
          voteType: "MULTIPLE_CHOICE",
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    ]);
    fetchDashboardEmbeddedBasicPollsMock.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <DashboardPage initialSearchText="raid" />
      </MemoryRouter>
    );

    await screen.findByText("Raid Food");
    expect(screen.getByText("Alpha Session")).toBeTruthy();
    expect(screen.queryByText("Sunday Session")).toBeNull();
    expect(screen.queryByText("Casual Hangout")).toBeNull();
  });

  test("applies dashboard status and date filters to sessions and general polls", async () => {
    pollInvitesState = {
      pendingInvites: [],
      loading: false,
      acceptInvite: acceptInviteMock,
      declineInvite: declineInviteMock,
    };
    questingGroupsState = {
      groups: [{ id: "group-1", name: "Alpha", memberIds: ["user-1"], creatorId: "user-1" }],
      getGroupColor: () => null,
    };
    schedulersByParticipantState = {
      data: [
        {
          id: "sched-finalized",
          title: "Upcoming Finalized",
          status: "FINALIZED",
          participantIds: ["user-1"],
          questingGroupId: "group-1",
          pendingInvites: [],
          winningSlotId: "slot-finalized",
        },
        {
          id: "sched-open",
          title: "Open Session",
          status: "OPEN",
          participantIds: ["user-1"],
          questingGroupId: "group-1",
          pendingInvites: [],
        },
      ],
      loading: false,
    };
    schedulerAttendanceState = {
      slotsByScheduler: {
        "sched-finalized": [
          {
            id: "slot-finalized",
            start: "2026-03-10T18:00:00.000Z",
            end: "2026-03-10T21:00:00.000Z",
          },
        ],
        "sched-open": [
          {
            id: "slot-open",
            start: "2026-02-15T18:00:00.000Z",
            end: "2026-02-15T21:00:00.000Z",
          },
        ],
      },
      votesByScheduler: {},
      votersByScheduler: {},
    };
    fetchDashboardGroupBasicPollsMock.mockResolvedValueOnce([
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-finalized",
        title: "Finalized General Poll",
        status: "FINALIZED",
        hasVoted: true,
        voterIds: ["user-1"],
        settings: {
          voteType: "MULTIPLE_CHOICE",
          deadlineAt: new Date("2026-03-12T00:00:00.000Z"),
        },
      },
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-open",
        title: "Open General Poll",
        status: "OPEN",
        hasVoted: false,
        voterIds: [],
        settings: {
          voteType: "MULTIPLE_CHOICE",
          deadlineAt: new Date("2026-02-12T00:00:00.000Z"),
        },
      },
    ]);
    fetchDashboardEmbeddedBasicPollsMock.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <DashboardPage
          initialStatusFilters={["FINALIZED"]}
          initialDateFrom={new Date("2026-03-01T00:00:00.000Z")}
          initialDateTo={new Date("2026-03-31T23:59:59.000Z")}
        />
      </MemoryRouter>
    );

    await screen.findAllByText("Upcoming Finalized");
    expect(screen.queryByText("Open Session")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Closed \(1\)/i }));
    expect(await screen.findByText("Finalized General Poll")).toBeTruthy();
    expect(screen.queryByText("Open General Poll")).toBeNull();
  });

  test("opens group poll in dashboard modal on desktop", async () => {
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
    fetchDashboardGroupBasicPollsMock.mockResolvedValueOnce([
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-g1",
        title: "Snack Vote",
        status: "OPEN",
        hasVoted: false,
        voterIds: [],
        settings: {
          voteType: "MULTIPLE_CHOICE",
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    ]);
    fetchDashboardEmbeddedBasicPollsMock.mockResolvedValueOnce([]);
    subscribeToBasicPollMock.mockImplementation((_groupId, _pollId, onUpdate) => {
      onUpdate({
        id: "poll-g1",
        title: "Snack Vote",
        status: "OPEN",
        required: false,
        options: [
          { id: "opt-1", label: "Pizza", order: 0 },
          { id: "opt-2", label: "Burgers", order: 1 },
        ],
        settings: { voteType: "MULTIPLE_CHOICE", allowMultiple: false },
      });
      return () => {};
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Vote: Snack Vote" }));
    expect(await screen.findByText("Questing group: Fellowship")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close general poll modal" })).toBeTruthy();
  });

  test("deletes group poll via confirm dialog", async () => {
    pollInvitesState = {
      pendingInvites: [],
      loading: false,
      acceptInvite: acceptInviteMock,
      declineInvite: declineInviteMock,
    };
    questingGroupsState = {
      groups: [{ id: "group-1", name: "Fellowship", memberIds: ["user-1"], creatorId: "user-1" }],
      getGroupColor: () => null,
    };
    fetchDashboardGroupBasicPollsMock.mockResolvedValueOnce([
      {
        parentType: "group",
        parentId: "group-1",
        pollId: "poll-g1",
        title: "Snack Vote",
        status: "OPEN",
        hasVoted: false,
        voterIds: [],
        settings: {
          voteType: "MULTIPLE_CHOICE",
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    ]);
    fetchDashboardEmbeddedBasicPollsMock.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await screen.findByText("Snack Vote");
    fireEvent.click(screen.getByRole("button", { name: "General poll actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByText('Delete "Snack Vote"?')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete poll" }));

    await waitFor(() => {
      expect(deleteBasicPollMock).toHaveBeenCalledWith("group-1", "poll-g1", { useServer: true });
    });
  });

});
