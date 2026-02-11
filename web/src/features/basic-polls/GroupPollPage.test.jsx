import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GroupPollPage from "./GroupPollPage";

const mockUseAuth = vi.fn();
const mockUseQuestingGroups = vi.fn();
const mockSubscribeToBasicPoll = vi.fn();
const mockSubscribeToBasicPollVotes = vi.fn();
const mockSubscribeToMyBasicPollVote = vi.fn();
const mockSubmitBasicPollVote = vi.fn();
const mockDeleteBasicPollVote = vi.fn();
const mockUpdateBasicPoll = vi.fn();
const mockResetBasicPollVotes = vi.fn();
const mockUseUserProfilesByIds = vi.fn();

vi.mock("../../app/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../../hooks/useQuestingGroups", () => ({
  useQuestingGroups: () => mockUseQuestingGroups(),
}));

vi.mock("../../lib/data/basicPolls", () => ({
  subscribeToBasicPoll: (...args) => mockSubscribeToBasicPoll(...args),
  subscribeToBasicPollVotes: (...args) => mockSubscribeToBasicPollVotes(...args),
  subscribeToMyBasicPollVote: (...args) => mockSubscribeToMyBasicPollVote(...args),
  submitBasicPollVote: (...args) => mockSubmitBasicPollVote(...args),
  deleteBasicPollVote: (...args) => mockDeleteBasicPollVote(...args),
  updateBasicPoll: (...args) => mockUpdateBasicPoll(...args),
  resetBasicPollVotes: (...args) => mockResetBasicPollVotes(...args),
}));

vi.mock("../../hooks/useUserProfiles", () => ({
  useUserProfilesByIds: (...args) => mockUseUserProfilesByIds(...args),
}));

function renderWithRoute(pathname) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/groups/:groupId/polls/:pollId" element={<GroupPollPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("GroupPollPage", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseQuestingGroups.mockReset();
    mockSubscribeToBasicPoll.mockReset();
    mockSubscribeToBasicPollVotes.mockReset();
    mockSubscribeToMyBasicPollVote.mockReset();
    mockSubmitBasicPollVote.mockReset();
    mockDeleteBasicPollVote.mockReset();
    mockUpdateBasicPoll.mockReset();
    mockResetBasicPollVotes.mockReset();
    mockUseUserProfilesByIds.mockReset();
    mockUseAuth.mockReturnValue({ user: { uid: "user-1", email: "member@example.com" } });
    mockUseQuestingGroups.mockReturnValue({ groups: [], loading: false });
    mockSubscribeToBasicPoll.mockReturnValue(() => {});
    mockSubscribeToBasicPollVotes.mockImplementation((_type, _groupId, _pollId, onUpdate) => {
      onUpdate([]);
      return () => {};
    });
    mockSubscribeToMyBasicPollVote.mockImplementation(
      (_type, _groupId, _pollId, _userId, onUpdate) => {
        onUpdate(null);
        return () => {};
      }
    );
    mockUseUserProfilesByIds.mockReturnValue({ profiles: {}, loading: false });
    mockSubmitBasicPollVote.mockResolvedValue(undefined);
    mockDeleteBasicPollVote.mockResolvedValue(undefined);
    mockUpdateBasicPoll.mockResolvedValue(undefined);
    mockResetBasicPollVotes.mockResolvedValue(undefined);
  });

  test("renders poll shell for a group member", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Where should we play?",
        description: "Pick one setting.",
        status: "OPEN",
        settings: { voteType: "MULTIPLE_CHOICE" },
        options: [{ id: "opt-1", label: "Option 1", order: 0 }],
      });
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Where should we play?" })).toBeTruthy();
    });
    expect(screen.getByText("Questing group: The Guild")).toBeTruthy();
    expect(mockSubscribeToBasicPoll).toHaveBeenCalledWith(
      "group-1",
      "poll-1",
      expect.any(Function),
      expect.any(Function)
    );
    expect(screen.getByText("Cast your vote")).toBeTruthy();
  });

  test("renders poll description markdown in read mode", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Markdown poll",
        description: "**Bold description** with _formatting_.",
        status: "OPEN",
        settings: { voteType: "MULTIPLE_CHOICE" },
        options: [{ id: "opt-1", label: "Option 1", order: 0 }],
      });
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Markdown poll" })).toBeTruthy()
    );
    const boldText = screen.getByText("Bold description");
    expect(boldText.tagName).toBe("STRONG");
  });

  test("opens a rendered option-note modal from vote rows", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Option notes poll",
        status: "OPEN",
        settings: { voteType: "MULTIPLE_CHOICE", allowMultiple: false },
        options: [
          { id: "opt-1", label: "Pizza", order: 0, note: "Use **advantage** here." },
          { id: "opt-2", label: "Burgers", order: 1, note: "" },
        ],
      });
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "View note for Pizza" })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "View note for Pizza" }));

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Option note for Pizza" })).toBeTruthy()
    );
    const markdownText = screen.getByText("advantage");
    expect(markdownText.tagName).toBe("STRONG");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Option note for Pizza" })).toBeNull()
    );
  });

  test("shows access denied for non-members", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "another-group", name: "Other Group" }],
      loading: false,
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => {
      expect(screen.getByText("Access denied")).toBeTruthy();
    });
    expect(screen.getByText("You don't have access to this group poll.")).toBeTruthy();
    expect(mockSubscribeToBasicPoll).not.toHaveBeenCalled();
  });

  test("submits and updates a single-choice vote", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Vote for a setting",
        status: "OPEN",
        settings: { voteType: "MULTIPLE_CHOICE", allowMultiple: false },
        options: [
          { id: "opt-1", label: "Option 1", order: 0 },
          { id: "opt-2", label: "Option 2", order: 1 },
        ],
      });
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByText("Option 1")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Option 1"));
    fireEvent.click(screen.getByRole("button", { name: "Submit vote" }));

    await waitFor(() => expect(mockSubmitBasicPollVote).toHaveBeenCalledTimes(1));
    expect(mockSubmitBasicPollVote).toHaveBeenNthCalledWith(1, "group", "group-1", "poll-1", "user-1", {
      optionIds: ["opt-1"],
      otherText: "",
      source: "web",
    });

    fireEvent.click(screen.getByLabelText("Option 2"));
    fireEvent.click(screen.getByRole("button", { name: "Submit vote" }));

    await waitFor(() => expect(mockSubmitBasicPollVote).toHaveBeenCalledTimes(2));
    expect(mockSubmitBasicPollVote).toHaveBeenNthCalledWith(2, "group", "group-1", "poll-1", "user-1", {
      optionIds: ["opt-2"],
      otherText: "",
      source: "web",
    });
  });

  test("clears an existing vote", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Vote for a setting",
        status: "OPEN",
        settings: { voteType: "MULTIPLE_CHOICE" },
        options: [{ id: "opt-1", label: "Option 1", order: 0 }],
      });
      return () => {};
    });
    mockSubscribeToMyBasicPollVote.mockImplementation(
      (_type, _groupId, _pollId, _userId, onUpdate) => {
        onUpdate({
          id: "user-1",
          optionIds: ["opt-1"],
        });
        return () => {};
      }
    );

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByRole("button", { name: "Clear vote" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Clear vote" }));

    await waitFor(() => expect(mockDeleteBasicPollVote).toHaveBeenCalledTimes(1));
    expect(mockDeleteBasicPollVote).toHaveBeenCalledWith(
      "group",
      "group-1",
      "poll-1",
      "user-1"
    );
  });

  test("updates live results as vote snapshots change", async () => {
    let votesListener = null;
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Vote for a setting",
        status: "OPEN",
        settings: { voteType: "MULTIPLE_CHOICE", allowMultiple: false },
        options: [
          { id: "opt-1", label: "Option 1", order: 0 },
          { id: "opt-2", label: "Option 2", order: 1 },
        ],
      });
      return () => {};
    });
    mockSubscribeToBasicPollVotes.mockImplementation((_type, _groupId, _pollId, onUpdate) => {
      votesListener = onUpdate;
      onUpdate([]);
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByText("No votes yet.")).toBeTruthy());

    act(() => {
      votesListener([
        { id: "user-1", optionIds: ["opt-1"] },
        { id: "user-2", optionIds: ["opt-1"] },
        { id: "user-3", optionIds: ["opt-2"] },
      ]);
    });

    await waitFor(() => {
      expect(screen.getByText("2 votes (67%)")).toBeTruthy();
      expect(screen.getByText("1 vote (33%)")).toBeTruthy();
    });
  });

  test("submits a partial ranked-choice vote and supports arrow reordering", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Rank campaign choices",
        status: "OPEN",
        settings: { voteType: "RANKED_CHOICE" },
        options: [
          { id: "opt-1", label: "Option 1", order: 0 },
          { id: "opt-2", label: "Option 2", order: 1 },
          { id: "opt-3", label: "Option 3", order: 2 },
        ],
      });
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByText("Rank your choices")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Rank Option 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Rank Option 2" }));
    expect(screen.getByRole("button", { name: "Drag Option 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Drag Option 2" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Move Option 2 up" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit ranking" }));

    await waitFor(() => expect(mockSubmitBasicPollVote).toHaveBeenCalledTimes(1));
    expect(mockSubmitBasicPollVote).toHaveBeenCalledWith("group", "group-1", "poll-1", "user-1", {
      rankings: ["opt-2", "opt-1"],
      source: "web",
    });
  });

  test("updates live first-choice ranked results from vote snapshots", async () => {
    let votesListener = null;
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Rank campaign choices",
        status: "OPEN",
        settings: { voteType: "RANKED_CHOICE" },
        options: [
          { id: "opt-1", label: "Option 1", order: 0 },
          { id: "opt-2", label: "Option 2", order: 1 },
        ],
      });
      return () => {};
    });
    mockSubscribeToBasicPollVotes.mockImplementation((_type, _groupId, _pollId, onUpdate) => {
      votesListener = onUpdate;
      onUpdate([]);
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByText("Live first-choice results")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("No votes yet.")).toBeTruthy());

    act(() => {
      votesListener([
        { id: "user-1", rankings: ["opt-1", "opt-2"] },
        { id: "user-2", rankings: ["opt-1"] },
        { id: "user-3", rankings: ["opt-2", "opt-1"] },
      ]);
    });

    await waitFor(() => {
      expect(screen.getByText("2 first-choice votes (67%)")).toBeTruthy();
      expect(screen.getByText("1 first-choice vote (33%)")).toBeTruthy();
    });
  });

  test("groups write-ins case-insensitively and highlights winners", async () => {
    let votesListener = null;
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Food vote",
        status: "OPEN",
        settings: {
          voteType: "MULTIPLE_CHOICE",
          allowMultiple: true,
          allowWriteIn: true,
        },
        options: [
          { id: "opt-1", label: "Pizza", order: 0 },
          { id: "opt-2", label: "Burgers", order: 1 },
        ],
      });
      return () => {};
    });
    mockSubscribeToBasicPollVotes.mockImplementation((_type, _groupId, _pollId, onUpdate) => {
      votesListener = onUpdate;
      onUpdate([]);
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByText("Live results")).toBeTruthy());

    act(() => {
      votesListener([
        { id: "user-1", optionIds: ["opt-1"], otherText: "Tacos" },
        { id: "user-2", optionIds: ["opt-2"], otherText: " tacos " },
        { id: "user-3", optionIds: ["opt-2"], otherText: "Sushi" },
      ]);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Tacos").length).toBe(1);
      expect(screen.getAllByText("2 of 3 voters (67%)").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Winner").length).toBeGreaterThan(0);
    });
  });

  test("shows read-only finalized multiple-choice results", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Finalized food vote",
        status: "FINALIZED",
        settings: { voteType: "MULTIPLE_CHOICE", allowMultiple: false },
        options: [
          { id: "opt-1", label: "Pizza", order: 0 },
          { id: "opt-2", label: "Burgers", order: 1 },
        ],
      });
      return () => {};
    });
    mockSubscribeToBasicPollVotes.mockImplementation((_type, _groupId, _pollId, onUpdate) => {
      onUpdate([
        { id: "user-1", optionIds: ["opt-2"] },
        { id: "user-2", optionIds: ["opt-2"] },
        { id: "user-3", optionIds: ["opt-1"] },
      ]);
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByText("Voting is closed for this poll.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Submit vote" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByText("Winner").length).toBeGreaterThan(0);
  });

  test("uses finalized multiple-choice snapshot when vote docs are absent", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Snapshot poll",
        status: "FINALIZED",
        settings: { voteType: "MULTIPLE_CHOICE", allowMultiple: false },
        options: [
          { id: "opt-1", label: "Pizza", order: 0 },
          { id: "opt-2", label: "Burgers", order: 1 },
        ],
        finalResults: {
          voteType: "MULTIPLE_CHOICE",
          voterCount: 3,
          winnerIds: ["opt-1"],
          rows: [
            { key: "opt-1", label: "Pizza", order: 0, count: 2, percentage: 67 },
            { key: "opt-2", label: "Burgers", order: 1, count: 1, percentage: 33 },
          ],
        },
      });
      return () => {};
    });
    mockSubscribeToBasicPollVotes.mockImplementation((_type, _groupId, _pollId, onUpdate) => {
      onUpdate([]);
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByText("Final results")).toBeTruthy());
    expect(screen.getByText("2 votes (67%)")).toBeTruthy();
    expect(screen.getByText("1 vote (33%)")).toBeTruthy();
    expect(screen.getAllByText("Winner").length).toBeGreaterThan(0);
  });

  test("uses finalized ranked snapshot when vote docs are absent", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [{ id: "group-1", name: "The Guild" }],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Ranked snapshot poll",
        status: "FINALIZED",
        creatorId: "user-1",
        settings: { voteType: "RANKED_CHOICE" },
        options: [
          { id: "opt-1", label: "Option 1", order: 0 },
          { id: "opt-2", label: "Option 2", order: 1 },
        ],
        finalResults: {
          voteType: "RANKED_CHOICE",
          voterCount: 3,
          winnerIds: ["opt-2"],
          tiedIds: [],
          rounds: [
            {
              round: 1,
              counts: { "opt-1": 1, "opt-2": 2 },
              exhausted: 0,
              nonExhausted: 3,
              eliminatedIds: [],
            },
          ],
        },
      });
      return () => {};
    });
    mockSubscribeToBasicPollVotes.mockImplementation((_type, _groupId, _pollId, onUpdate) => {
      onUpdate([]);
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByText("Final ranked results")).toBeTruthy());
    expect(screen.getByText("Winner:")).toBeTruthy();
    expect(screen.getAllByText("Option 2").length).toBeGreaterThan(0);
    expect(screen.getByText("Round 1")).toBeTruthy();
  });

  test("hides edit mode for non-manager group members", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [
        {
          id: "group-1",
          name: "The Guild",
          creatorId: "creator-1",
          memberManaged: false,
          memberIds: ["creator-1", "user-1"],
        },
      ],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Member-visible poll",
        status: "OPEN",
        settings: { voteType: "MULTIPLE_CHOICE", allowMultiple: false, allowWriteIn: false },
        options: [
          { id: "opt-1", label: "Option 1", order: 0, note: "" },
          { id: "opt-2", label: "Option 2", order: 1, note: "" },
        ],
      });
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Member-visible poll" })).toBeTruthy()
    );
    expect(screen.queryByRole("button", { name: "Edit poll" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Exit edit mode" })).toBeNull();
  });

  test("allows group manager to edit and save poll fields", async () => {
    mockUseQuestingGroups.mockReturnValue({
      groups: [
        {
          id: "group-1",
          name: "The Guild",
          creatorId: "user-1",
          memberManaged: false,
          memberIds: ["user-1"],
        },
      ],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Original title",
        description: "Original description",
        status: "OPEN",
        settings: { voteType: "MULTIPLE_CHOICE", allowMultiple: false, allowWriteIn: false },
        options: [
          { id: "opt-1", label: "Option 1", order: 0, note: "" },
          { id: "opt-2", label: "Option 2", order: 1, note: "" },
        ],
      });
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByRole("button", { name: "Edit poll" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Edit poll" }));
    fireEvent.change(screen.getByDisplayValue("Original title"), {
      target: { value: "Updated title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mockUpdateBasicPoll).toHaveBeenCalledTimes(1));
    expect(mockUpdateBasicPoll).toHaveBeenCalledWith(
      "group-1",
      "poll-1",
      expect.objectContaining({
        title: "Updated title",
      })
    );
  });

  test("prompts for vote reset on unsafe edits when votes exist", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockUseQuestingGroups.mockReturnValue({
      groups: [
        {
          id: "group-1",
          name: "The Guild",
          creatorId: "user-1",
          memberManaged: false,
          memberIds: ["user-1"],
        },
      ],
      loading: false,
    });
    mockSubscribeToBasicPoll.mockImplementation((_groupId, pollId, onUpdate) => {
      onUpdate({
        id: pollId,
        title: "Original title",
        status: "OPEN",
        settings: { voteType: "MULTIPLE_CHOICE", allowMultiple: false, allowWriteIn: false },
        options: [
          { id: "opt-1", label: "Option 1", order: 0, note: "" },
          { id: "opt-2", label: "Option 2", order: 1, note: "" },
        ],
      });
      return () => {};
    });
    mockSubscribeToBasicPollVotes.mockImplementation((_type, _groupId, _pollId, onUpdate) => {
      onUpdate([{ id: "user-2", optionIds: ["opt-1"] }]);
      return () => {};
    });

    renderWithRoute("/groups/group-1/polls/poll-1");

    await waitFor(() => expect(screen.getByRole("button", { name: "Edit poll" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Edit poll" }));
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "RANKED_CHOICE" },
    });

    expect(screen.getAllByRole("button", { name: "Remove" })[0].hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    expect(mockResetBasicPollVotes).toHaveBeenCalledWith("group", "group-1", "poll-1", {
      useServer: true,
    });
    expect(mockUpdateBasicPoll).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});
