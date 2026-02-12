import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BasicPollVotingCard } from "./basic-poll-voting-card";
import { BASIC_POLL_STATUSES, BASIC_POLL_VOTE_TYPES } from "../../lib/basic-polls/constants";

function makePoll(overrides = {}) {
  return {
    id: "poll-1",
    title: "Snack Vote",
    status: BASIC_POLL_STATUSES.OPEN,
    required: false,
    description: "Pick snacks",
    options: [
      { id: "opt-1", label: "Pizza", order: 0, note: "Classic choice" },
      { id: "opt-2", label: "Tacos", order: 1 },
    ],
    settings: {
      voteType: BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE,
      allowMultiple: false,
      allowWriteIn: true,
    },
    ...overrides,
  };
}

describe("BasicPollVotingCard", () => {
  test("renders multiple-choice controls and triggers option and note actions", () => {
    const onSelectOption = vi.fn();
    const onViewOptionNote = vi.fn();
    const onSubmitVote = vi.fn();
    const onClearVote = vi.fn();

    render(
      <BasicPollVotingCard
        poll={makePoll()}
        participantCount={2}
        voteCount={1}
        canVote
        draft={{ optionIds: ["opt-1"], otherText: "" }}
        onSelectOption={onSelectOption}
        onViewOptionNote={onViewOptionNote}
        onSubmitVote={onSubmitVote}
        onClearVote={onClearVote}
      />
    );

    expect(screen.getByText("Snack Vote")).toBeTruthy();
    expect(screen.getByText("1/2 voted")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("View note for Pizza"));
    expect(onViewOptionNote).toHaveBeenCalledWith("Snack Vote", expect.objectContaining({ id: "opt-1" }));

    fireEvent.click(screen.getByRole("radio", { name: /Tacos/i }));
    expect(onSelectOption).toHaveBeenCalledWith("opt-2");

    fireEvent.click(screen.getByRole("button", { name: "Submit vote" }));
    expect(onSubmitVote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear vote" }));
    expect(onClearVote).toHaveBeenCalledTimes(1);
  });

  test("renders ranked-choice controls and invokes ranking callbacks", () => {
    const onMoveRankedOption = vi.fn();
    const onAddRankedOption = vi.fn();
    const onRemoveRankedOption = vi.fn();

    render(
      <BasicPollVotingCard
        poll={makePoll({
          options: [
            { id: "opt-1", label: "Pizza", order: 0 },
            { id: "opt-2", label: "Tacos", order: 1 },
            { id: "opt-3", label: "Curry", order: 2 },
          ],
          settings: { voteType: BASIC_POLL_VOTE_TYPES.RANKED_CHOICE },
        })}
        canVote
        draft={{ rankings: ["opt-1", "opt-2"] }}
        onMoveRankedOption={onMoveRankedOption}
        onAddRankedOption={onAddRankedOption}
        onRemoveRankedOption={onRemoveRankedOption}
        onSubmitVote={vi.fn()}
        onClearVote={vi.fn()}
      />
    );

    expect(screen.getByText("Ranked")).toBeTruthy();
    expect(screen.getByText("Unranked")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Down" })[0]);
    expect(onMoveRankedOption).toHaveBeenCalledWith("opt-1", "down");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(onRemoveRankedOption).toHaveBeenCalledWith("opt-1");
    fireEvent.click(screen.getByRole("button", { name: "Rank" }));
    expect(onAddRankedOption).toHaveBeenCalledWith("opt-3");
  });

  test("shows finalized results when voting is closed", () => {
    render(
      <BasicPollVotingCard
        poll={makePoll({
          status: BASIC_POLL_STATUSES.FINALIZED,
          settings: { voteType: BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE },
          finalResults: {
            voteType: BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE,
            rows: [
              { key: "opt-1", label: "Pizza", count: 3, percentage: 75 },
              { key: "opt-2", label: "Tacos", count: 1, percentage: 25 },
            ],
          },
        })}
        canVote={false}
        myVote={{ optionIds: ["opt-1"] }}
      />
    );

    expect(screen.getByText("Voting is closed for this poll.")).toBeTruthy();
    expect(screen.getByText("3 votes (75%)")).toBeTruthy();
    expect(screen.getByText("1 vote (25%)")).toBeTruthy();
    expect(screen.getByText("Your vote is on record.")).toBeTruthy();
  });
});
