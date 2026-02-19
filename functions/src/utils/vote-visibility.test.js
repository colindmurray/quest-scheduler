const {
  DEFAULT_VOTE_ANONYMIZATION,
  DEFAULT_HIDE_VOTER_IDENTITIES,
  DEFAULT_VOTE_VISIBILITY,
  VOTE_ANONYMIZATION,
  VOTE_VISIBILITY,
  canViewVoterIdentities,
  canViewOtherVotesPublicly,
  resolveVoteAnonymization,
  resolveHideVoterIdentities,
  resolveHideVoterIdentitiesForVisibility,
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

  test("vote anonymization defaults unknown values", () => {
    expect(resolveVoteAnonymization("invalid")).toBe(DEFAULT_VOTE_ANONYMIZATION);
    expect(resolveVoteAnonymization(VOTE_ANONYMIZATION.CREATOR_EXCLUDED)).toBe(
      VOTE_ANONYMIZATION.CREATOR_EXCLUDED
    );
  });

  test("hide voter identities is forced off for full visibility", () => {
    expect(resolveHideVoterIdentitiesForVisibility(true, VOTE_VISIBILITY.FULL)).toBe(false);
    expect(resolveHideVoterIdentitiesForVisibility(true, VOTE_VISIBILITY.HIDDEN)).toBe(true);
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
