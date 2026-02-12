import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { GroupBasicPollModal } from "./group-basic-poll-modal";

const onCloseMock = vi.fn();
const deleteBasicPollMock = vi.fn();
const subscribeToBasicPollMock = vi.fn();
const subscribeToBasicPollVotesMock = vi.fn();
const subscribeToMyBasicPollVoteMock = vi.fn();

let authState;
let questingGroupsState;
let userSettingsState;
let userProfilesState;

vi.mock("../../../app/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("../../../hooks/useQuestingGroups", () => ({
  useQuestingGroups: () => questingGroupsState,
}));

vi.mock("../../../hooks/useUserSettings", () => ({
  useUserSettings: () => userSettingsState,
}));

vi.mock("../../../hooks/useUserProfiles", () => ({
  useUserProfilesByIds: () => userProfilesState,
}));

vi.mock("../../../components/ui/dropdown-menu", () => ({
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

vi.mock("../../../lib/data/basicPolls", () => ({
  deleteBasicPoll: (...args) => deleteBasicPollMock(...args),
  deleteBasicPollVote: vi.fn(),
  finalizeBasicPoll: vi.fn(),
  reopenBasicPoll: vi.fn(),
  submitBasicPollVote: vi.fn(),
  subscribeToBasicPoll: (...args) => subscribeToBasicPollMock(...args),
  subscribeToBasicPollVotes: (...args) => subscribeToBasicPollVotesMock(...args),
  subscribeToMyBasicPollVote: (...args) => subscribeToMyBasicPollVoteMock(...args),
}));

vi.mock("../../../lib/data/discord", () => ({
  nudgeDiscordBasicPoll: vi.fn(),
}));

describe("GroupBasicPollModal", () => {
  beforeEach(() => {
    authState = { user: { uid: "user-1", email: "owner@example.com" } };
    questingGroupsState = {
      loading: false,
      groups: [
        {
          id: "group-1",
          name: "Fellowship",
          creatorId: "user-1",
          memberIds: ["user-1", "user-2"],
        },
      ],
    };
    userSettingsState = {
      archivedPolls: [],
      archivePoll: vi.fn(),
      unarchivePoll: vi.fn(),
    };
    userProfilesState = {
      profiles: {
        "user-1": { id: "user-1", email: "owner@example.com", displayName: "Owner" },
        "user-2": { id: "user-2", email: "member@example.com", displayName: "Member" },
      },
    };
    deleteBasicPollMock.mockResolvedValue(undefined);
    deleteBasicPollMock.mockClear();
    onCloseMock.mockClear();

    subscribeToBasicPollMock.mockImplementation((_groupId, _pollId, onUpdate) => {
      onUpdate({
        id: "poll-1",
        title: "Snack Vote",
        creatorId: "user-1",
        status: "OPEN",
        options: [
          { id: "opt-1", label: "Pizza", order: 0 },
          { id: "opt-2", label: "Tacos", order: 1 },
        ],
        settings: {
          voteType: "MULTIPLE_CHOICE",
          allowMultiple: false,
          allowWriteIn: false,
        },
      });
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
  });

  test("deletes poll via confirmation dialog", async () => {
    render(
      <GroupBasicPollModal groupId="group-1" pollId="poll-1" onClose={onCloseMock} />
    );

    await screen.findByRole("heading", { name: "Snack Vote", level: 2 });
    fireEvent.click(screen.getByRole("button", { name: "General poll actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(await screen.findByText('Delete "Snack Vote"?')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete poll" }));

    await waitFor(() => {
      expect(deleteBasicPollMock).toHaveBeenCalledWith("group-1", "poll-1", { useServer: true });
      expect(onCloseMock).toHaveBeenCalled();
    });
  });
});
