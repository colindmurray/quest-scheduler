import { describe, expect, test } from "vitest";
import {
  BASIC_POLL_STATUSES,
  BASIC_POLL_VOTE_TYPES,
  resolveBasicPollStatus,
  resolveBasicPollVoteType,
} from "./constants";

describe("basic poll constants", () => {
  test("vote types and statuses are stable self-keyed constants", () => {
    Object.keys(BASIC_POLL_VOTE_TYPES).forEach((key) => {
      expect(BASIC_POLL_VOTE_TYPES[key]).toBe(key);
    });
    Object.keys(BASIC_POLL_STATUSES).forEach((key) => {
      expect(BASIC_POLL_STATUSES[key]).toBe(key);
    });
  });

  test("resolve helpers normalize unknown values to defaults", () => {
    expect(resolveBasicPollVoteType(BASIC_POLL_VOTE_TYPES.RANKED_CHOICE)).toBe(
      BASIC_POLL_VOTE_TYPES.RANKED_CHOICE
    );
    expect(resolveBasicPollVoteType("UNKNOWN")).toBe(BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE);

    expect(resolveBasicPollStatus(BASIC_POLL_STATUSES.FINALIZED)).toBe(BASIC_POLL_STATUSES.FINALIZED);
    expect(resolveBasicPollStatus(BASIC_POLL_STATUSES.CLOSED)).toBe(BASIC_POLL_STATUSES.CLOSED);
    expect(resolveBasicPollStatus("UNKNOWN")).toBe(BASIC_POLL_STATUSES.OPEN);
  });
});
