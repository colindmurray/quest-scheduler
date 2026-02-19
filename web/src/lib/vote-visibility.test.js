import { describe, expect, test } from "vitest";
import {
  DEFAULT_VOTE_VISIBILITY,
  VOTE_VISIBILITY,
  canViewOtherVotesForUser,
  canViewOtherVotesPublicly,
  resolveVoteVisibility,
} from "./vote-visibility";

describe("vote visibility helpers", () => {
  test("resolveVoteVisibility defaults unknown values", () => {
    expect(resolveVoteVisibility("unknown_mode")).toBe(DEFAULT_VOTE_VISIBILITY);
    expect(resolveVoteVisibility(VOTE_VISIBILITY.HIDDEN)).toBe(VOTE_VISIBILITY.HIDDEN);
  });

  test("creator can always view other votes", () => {
    Object.values(VOTE_VISIBILITY).forEach((mode) => {
      expect(
        canViewOtherVotesForUser({
          voteVisibility: mode,
          isCreator: true,
          hasVoted: false,
          allParticipantsVoted: false,
          isFinalized: false,
        })
      ).toBe(true);
    });
  });

  test("hidden_while_voting unlocks only after user votes", () => {
    expect(
      canViewOtherVotesForUser({
        voteVisibility: VOTE_VISIBILITY.HIDDEN_WHILE_VOTING,
        hasVoted: false,
      })
    ).toBe(false);
    expect(
      canViewOtherVotesForUser({
        voteVisibility: VOTE_VISIBILITY.HIDDEN_WHILE_VOTING,
        hasVoted: true,
      })
    ).toBe(true);
  });

  test("hidden_until_all_voted requires allParticipantsVoted", () => {
    expect(
      canViewOtherVotesForUser({
        voteVisibility: VOTE_VISIBILITY.HIDDEN_UNTIL_ALL_VOTED,
        allParticipantsVoted: false,
      })
    ).toBe(false);
    expect(
      canViewOtherVotesForUser({
        voteVisibility: VOTE_VISIBILITY.HIDDEN_UNTIL_ALL_VOTED,
        allParticipantsVoted: true,
      })
    ).toBe(true);
  });

  test("hidden_until_finalized requires finalized status", () => {
    expect(
      canViewOtherVotesForUser({
        voteVisibility: VOTE_VISIBILITY.HIDDEN_UNTIL_FINALIZED,
        isFinalized: false,
      })
    ).toBe(false);
    expect(
      canViewOtherVotesForUser({
        voteVisibility: VOTE_VISIBILITY.HIDDEN_UNTIL_FINALIZED,
        isFinalized: true,
      })
    ).toBe(true);
  });

  test("public visibility remains hidden for per-user gating mode", () => {
    expect(
      canViewOtherVotesPublicly({
        voteVisibility: VOTE_VISIBILITY.HIDDEN_WHILE_VOTING,
        allParticipantsVoted: true,
        isFinalized: true,
      })
    ).toBe(false);
  });
});
