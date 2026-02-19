import { describe, expect, test } from "vitest";
import {
  DEFAULT_HIDE_VOTER_IDENTITIES,
  DEFAULT_VOTE_VISIBILITY,
  VOTE_VISIBILITY,
  canViewVoterIdentities,
  canViewOtherVotesForUser,
  canViewOtherVotesPublicly,
  resolveHideVoterIdentities,
  resolveHideVoterIdentitiesForVisibility,
  resolveVoteVisibility,
} from "./vote-visibility";

describe("vote visibility helpers", () => {
  test("resolveVoteVisibility defaults unknown values", () => {
    expect(resolveVoteVisibility("unknown_mode")).toBe(DEFAULT_VOTE_VISIBILITY);
    expect(resolveVoteVisibility(VOTE_VISIBILITY.HIDDEN)).toBe(VOTE_VISIBILITY.HIDDEN);
  });

  test("hide voter identities defaults to false and normalizes booleans", () => {
    expect(DEFAULT_HIDE_VOTER_IDENTITIES).toBe(false);
    expect(resolveHideVoterIdentities(true)).toBe(true);
    expect(resolveHideVoterIdentities(false)).toBe(false);
    expect(resolveHideVoterIdentities(undefined)).toBe(false);
    expect(resolveHideVoterIdentities("true")).toBe(false);
  });

  test("hide voter identities is forced off for full visibility", () => {
    expect(resolveHideVoterIdentitiesForVisibility(true, VOTE_VISIBILITY.FULL)).toBe(false);
    expect(resolveHideVoterIdentitiesForVisibility(true, VOTE_VISIBILITY.HIDDEN)).toBe(true);
  });

  test("creator can always view voter identities", () => {
    expect(canViewVoterIdentities({ isCreator: true, hideVoterIdentities: true })).toBe(true);
  });

  test("non-creator identity visibility follows hideVoterIdentities", () => {
    expect(canViewVoterIdentities({ isCreator: false, hideVoterIdentities: false })).toBe(true);
    expect(canViewVoterIdentities({ isCreator: false, hideVoterIdentities: true })).toBe(false);
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
