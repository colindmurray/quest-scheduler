const {
  DEFAULT_VOTE_VISIBILITY,
  VOTE_VISIBILITY,
  canViewOtherVotesPublicly,
  resolveVoteVisibility,
} = require("./vote-visibility");

describe("vote visibility helper", () => {
  test("resolveVoteVisibility defaults to full visibility", () => {
    expect(resolveVoteVisibility("invalid")).toBe(DEFAULT_VOTE_VISIBILITY);
    expect(resolveVoteVisibility(VOTE_VISIBILITY.HIDDEN)).toBe(VOTE_VISIBILITY.HIDDEN);
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
