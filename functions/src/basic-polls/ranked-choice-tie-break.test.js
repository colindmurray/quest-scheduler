import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const {
  RANKED_TIE_BREAK_METHODS,
  applyRankedChoiceTieBreaker,
  resolveRankedFinalRound,
  resolveRankedPriorTieBreakerRounds,
} = require("./ranked-choice-tie-break");
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webTieBreakPath = path.resolve(
  currentDir,
  "../../../web/src/lib/basic-polls/ranked-choice-tie-break.js"
);

describe("ranked-choice tie-break helpers", () => {
  test("Borda can pick a winner outside the IRV tie set", () => {
    const finalResults = {
      voteType: "RANKED_CHOICE",
      rounds: [{ round: 1 }, { round: 2 }],
      winnerIds: [],
      tiedIds: ["goat", "dragon"],
    };
    const votes = [
      { rankings: ["goat", "lich", "dragon"] },
      { rankings: ["dragon", "lich", "goat"] },
      { rankings: ["lich", "goat", "dragon"] },
      { rankings: ["lich", "dragon", "goat"] },
    ];

    const next = applyRankedChoiceTieBreaker({
      finalResults,
      optionIds: ["goat", "dragon", "lich"],
      votes,
      method: RANKED_TIE_BREAK_METHODS.BORDA,
    });

    expect(next.winnerIds).toEqual(["lich"]);
    expect(next.tiedIds).toEqual([]);
    expect(next.tieBreakerRounds).toHaveLength(1);
    expect(next.tieBreakerRounds[0]).toEqual(
      expect.objectContaining({
        type: "BORDA",
        sourceTiedIds: ["goat", "dragon"],
      })
    );
  });

  test("Borda tie can be resolved by random and round helpers order pages correctly", () => {
    const finalResults = {
      voteType: "RANKED_CHOICE",
      rounds: [{ round: 1 }],
      winnerIds: [],
      tiedIds: ["a", "b"],
    };
    const votes = [
      { rankings: ["a", "b", "c"] },
      { rankings: ["b", "a", "c"] },
    ];

    const borda = applyRankedChoiceTieBreaker({
      finalResults,
      optionIds: ["a", "b", "c"],
      votes,
      method: "BORDA",
    });
    expect(borda.winnerIds).toEqual([]);
    expect(borda.tiedIds).toEqual(["a", "b"]);

    const random = applyRankedChoiceTieBreaker({
      finalResults: borda,
      optionIds: ["a", "b", "c"],
      votes,
      method: "RANDOM",
      randomInt: () => 1,
    });

    expect(random.winnerIds).toEqual(["b"]);
    expect(random.tiedIds).toEqual([]);
    expect(random.tieBreakerRounds.map((round) => round.type)).toEqual(["BORDA", "RANDOM"]);
    expect(resolveRankedPriorTieBreakerRounds(random)).toHaveLength(1);
    expect(resolveRankedPriorTieBreakerRounds(random)[0].type).toBe("BORDA");
    expect(resolveRankedFinalRound(random)).toEqual(
      expect.objectContaining({
        source: "TIE_BREAK",
        round: expect.objectContaining({ type: "RANDOM" }),
      })
    );
  });

  test("disallows applying Borda twice in a row", () => {
    const firstPass = {
      voteType: "RANKED_CHOICE",
      rounds: [{ round: 1 }],
      winnerIds: [],
      tiedIds: ["a", "b"],
      tieBreakerRounds: [
        {
          round: 2,
          type: "BORDA",
          counts: { a: 3, b: 3, c: 0 },
          sourceTiedIds: ["a", "b"],
          winnerIds: [],
          tiedIds: ["a", "b"],
        },
      ],
    };

    expect(() =>
      applyRankedChoiceTieBreaker({
        finalResults: firstPass,
        optionIds: ["a", "b", "c"],
        votes: [],
        method: "BORDA",
      })
    ).toThrow("Borda tie-break already applied");
  });
});

describe("ranked-choice tie-break parity with web implementation", () => {
  test("applyRankedChoiceTieBreaker parity", async () => {
    const webModule = await import(webTieBreakPath);
    const input = {
      finalResults: {
        voteType: "RANKED_CHOICE",
        rounds: [{ round: 1 }],
        winnerIds: [],
        tiedIds: ["a", "b"],
      },
      optionIds: ["a", "b", "c"],
      votes: [
        { rankings: ["a", "b", "c"] },
        { rankings: ["b", "a", "c"] },
      ],
      method: "RANDOM",
      randomInt: () => 0,
    };

    const functionsResult = applyRankedChoiceTieBreaker(input);
    const webResult = webModule.applyRankedChoiceTieBreaker(input);
    expect(functionsResult).toEqual(webResult);
  });
});
