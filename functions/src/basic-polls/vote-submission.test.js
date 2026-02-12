import { describe, expect, test } from "vitest";

import {
  hasSubmittedVote,
  hasSubmittedVoteForPoll,
  hasVotePayloadChanged,
  normalizeVoteIdList,
  normalizeVoteOptionIds,
  normalizeVoteRankings,
  resolveVoteConfigFromPoll,
  resolveVoteType,
} from "./vote-submission";

describe("basic poll vote submission helpers", () => {
  test("normalizes vote id lists and vote doc arrays", () => {
    expect(normalizeVoteIdList([" a ", "", null, "b"])).toEqual(["a", "b"]);
    expect(normalizeVoteOptionIds({ optionIds: [" opt-1 ", ""] })).toEqual(["opt-1"]);
    expect(normalizeVoteRankings({ rankings: [" rank-1 ", undefined] })).toEqual(["rank-1"]);
  });

  test("resolves vote type and write-in config from poll settings", () => {
    expect(resolveVoteType("RANKED_CHOICE")).toBe("RANKED_CHOICE");
    expect(resolveVoteType("INVALID")).toBe("MULTIPLE_CHOICE");
    expect(resolveVoteConfigFromPoll({ settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: true } })).toEqual({
      voteType: "MULTIPLE_CHOICE",
      allowWriteIn: true,
    });
    expect(resolveVoteConfigFromPoll({ settings: { voteType: "RANKED_CHOICE", allowWriteIn: true } })).toEqual({
      voteType: "RANKED_CHOICE",
      allowWriteIn: false,
    });
  });

  test("detects submitted votes for multiple choice and ranked choice", () => {
    expect(hasSubmittedVote("RANKED_CHOICE", false, { rankings: ["opt-1"] })).toBe(true);
    expect(hasSubmittedVote("RANKED_CHOICE", false, { rankings: [] })).toBe(false);
    expect(hasSubmittedVote("MULTIPLE_CHOICE", false, { optionIds: ["opt-1"] })).toBe(true);
    expect(hasSubmittedVote("MULTIPLE_CHOICE", true, { optionIds: [], otherText: " custom " })).toBe(true);
    expect(hasSubmittedVote("MULTIPLE_CHOICE", true, { optionIds: [], otherText: "   " })).toBe(false);
  });

  test("detects submitted votes from poll object config", () => {
    const multiplePoll = { settings: { voteType: "MULTIPLE_CHOICE", allowWriteIn: false } };
    const rankedPoll = { settings: { voteType: "RANKED_CHOICE" } };

    expect(hasSubmittedVoteForPoll(multiplePoll, { optionIds: ["opt-1"] })).toBe(true);
    expect(hasSubmittedVoteForPoll(multiplePoll, { optionIds: [] })).toBe(false);
    expect(hasSubmittedVoteForPoll(rankedPoll, { rankings: ["opt-1"] })).toBe(true);
    expect(hasSubmittedVoteForPoll(rankedPoll, { optionIds: ["opt-1"] })).toBe(false);
  });

  test("detects payload changes using normalized arrays and trimmed text", () => {
    expect(
      hasVotePayloadChanged(
        { optionIds: [" opt-1 "], rankings: [" rank-1 "], otherText: " Text " },
        { optionIds: ["opt-1"], rankings: ["rank-1"], otherText: "Text" }
      )
    ).toBe(false);

    expect(
      hasVotePayloadChanged(
        { optionIds: ["opt-1"], rankings: ["rank-1"], otherText: "Text" },
        { optionIds: ["opt-2"], rankings: ["rank-1"], otherText: "Text" }
      )
    ).toBe(true);
  });
});
