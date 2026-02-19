import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import {
  RANKED_TIE_BREAK_METHODS,
  applyRankedChoiceTieBreaker,
  resolveRankedFinalRound,
  resolveRankedPriorTieBreakerRounds,
} from "./ranked-choice-tie-break";

const require = createRequire(import.meta.url);
const functionsTieBreak = require("../../../../functions/src/basic-polls/ranked-choice-tie-break.js");

describe("web ranked-choice tie-break helpers", () => {
  test("Borda scores all options, not only tied finalists", () => {
    const next = applyRankedChoiceTieBreaker({
      finalResults: {
        voteType: "RANKED_CHOICE",
        rounds: [{ round: 1 }, { round: 2 }],
        winnerIds: [],
        tiedIds: ["goat", "dragon"],
      },
      optionIds: ["goat", "dragon", "lich"],
      votes: [
        { rankings: ["goat", "lich", "dragon"] },
        { rankings: ["dragon", "lich", "goat"] },
        { rankings: ["lich", "goat", "dragon"] },
        { rankings: ["lich", "dragon", "goat"] },
      ],
      method: RANKED_TIE_BREAK_METHODS.BORDA,
    });

    expect(next.winnerIds).toEqual(["lich"]);
    expect(next.tieBreakerRounds[0]).toEqual(
      expect.objectContaining({
        type: "BORDA",
        sourceTiedIds: ["goat", "dragon"],
      })
    );
  });

  test("random tie-break picks only from current tie pool", () => {
    const next = applyRankedChoiceTieBreaker({
      finalResults: {
        voteType: "RANKED_CHOICE",
        rounds: [{ round: 1 }],
        winnerIds: [],
        tiedIds: ["x", "y", "z"],
      },
      optionIds: ["x", "y", "z", "w"],
      votes: [],
      method: RANKED_TIE_BREAK_METHODS.RANDOM,
      randomInt: () => 2,
    });

    expect(next.winnerIds).toEqual(["z"]);
    expect(next.tieBreakerRounds).toHaveLength(1);
    expect(next.tieBreakerRounds[0]).toEqual(
      expect.objectContaining({
        type: "RANDOM",
        sourceTiedIds: ["x", "y", "z"],
      })
    );
  });

  test("prior tie-break rounds exclude the final resolving round", () => {
    const finalResults = {
      voteType: "RANKED_CHOICE",
      rounds: [{ round: 1 }, { round: 2 }],
      winnerIds: ["a"],
      tiedIds: [],
      tieBreakerRounds: [
        { round: 3, type: "BORDA", counts: { a: 4, b: 4 }, winnerIds: [], tiedIds: ["a", "b"] },
        { round: 4, type: "RANDOM", counts: { a: 1, b: 0 }, winnerIds: ["a"], tiedIds: [] },
      ],
    };

    expect(resolveRankedFinalRound(finalResults)).toEqual(
      expect.objectContaining({
        source: "TIE_BREAK",
        round: expect.objectContaining({ type: "RANDOM" }),
      })
    );
    expect(resolveRankedPriorTieBreakerRounds(finalResults)).toEqual([
      expect.objectContaining({ type: "BORDA" }),
    ]);
  });
});

describe("web tie-break parity with functions implementation", () => {
  test("applyRankedChoiceTieBreaker parity", () => {
    const input = {
      finalResults: {
        voteType: "RANKED_CHOICE",
        rounds: [{ round: 1 }],
        winnerIds: [],
        tiedIds: ["alpha", "beta"],
      },
      optionIds: ["alpha", "beta", "gamma"],
      votes: [
        { rankings: ["alpha", "gamma", "beta"] },
        { rankings: ["beta", "gamma", "alpha"] },
        { rankings: ["gamma", "alpha", "beta"] },
      ],
      method: "BORDA",
      randomInt: () => 0,
    };

    expect(applyRankedChoiceTieBreaker(input)).toEqual(
      functionsTieBreak.applyRankedChoiceTieBreaker(input)
    );
  });
});
