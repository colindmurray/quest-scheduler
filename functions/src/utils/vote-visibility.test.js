const {
  DEFAULT_HIDE_VOTER_IDENTITIES,
  DEFAULT_VOTE_VISIBILITY,
  VOTE_VISIBILITY,
  canViewVoterIdentities,
  canViewOtherVotesPublicly,
  resolveHideVoterIdentities,
  resolveVoteVisibility,
} = require("./vote-visibility");

describe("vote visibility helper", () => {
  test("resolveVoteVisibility defaults to full visibility", () => {
    expect(resolveVoteVisibility("invalid")).toBe(DEFAULT_VOTE_VISIBILITY);
    expect(resolveVoteVisibility(VOTE_VISIBILITY.HIDDEN)).toBe(VOTE_VISIBILITY.HIDDEN);
  });

  test("hide voter identities defaults false and normalizes values", () => {
    expect(DEFAULT_HIDE_VOTER_IDENTITIES).toBe(false);
    expect(resolveHideVoterIdentities(true)).toBe(true);
    expect(resolveHideVoterIdentities(false)).toBe(false);
    expect(resolveHideVoterIdentities(undefined)).toBe(false);
    expect(resolveHideVoterIdentities("true")).toBe(false);
  });

  test("creator can always view identities while others follow hide setting", () => {
    expect(canViewVoterIdentities({ isCreator: true, hideVoterIdentities: true })).toBe(true);
    expect(canViewVoterIdentities({ isCreator: false, hideVoterIdentities: false })).toBe(true);
    expect(canViewVoterIdentities({ isCreator: false, hideVoterIdentities: true })).toBe(false);
  });

  test("public visibility only unlocks global-safe modes", () => {
    expect(
      canViewOtherVotesPublicly({
        voteVisibility: VOTE_VISIBILITY.FULL,
        allParticipantsVoted: false,
        isFinalized: false,
      })
    ).toBe(true);

    expect(
      canViewOtherVotesPublicly({
        voteVisibility: VOTE_VISIBILITY.HIDDEN_WHILE_VOTING,
        allParticipantsVoted: true,
        isFinalized: true,
      })
    ).toBe(false);

    expect(
      canViewOtherVotesPublicly({
        voteVisibility: VOTE_VISIBILITY.HIDDEN_UNTIL_ALL_VOTED,
        allParticipantsVoted: true,
        isFinalized: false,
      })
    ).toBe(true);

    expect(
      canViewOtherVotesPublicly({
        voteVisibility: VOTE_VISIBILITY.HIDDEN_UNTIL_FINALIZED,
        allParticipantsVoted: false,
        isFinalized: true,
      })
    ).toBe(true);
  });
});
