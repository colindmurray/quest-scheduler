import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { computeInstantRunoffResults } from "./irv";

const require = createRequire(import.meta.url);
const { computeInstantRunoffResults: computeFunctionsIrv } = require("../../../../functions/src/basic-polls/irv.js");

const currentDir = dirname(fileURLToPath(import.meta.url));
const fixturesPath = resolve(currentDir, "../../../../docs/fixtures/basic-polls-irv-fixtures.json");
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));

describe("computeInstantRunoffResults contract fixtures", () => {
  test.each(fixtures)("$id", (fixture) => {
    const result = computeInstantRunoffResults({
      optionIds: fixture.optionIds,
      votes: fixture.votes,
    });

    expect(result.winnerIds).toEqual(fixture.expected.winnerIds);
    expect(result.tiedIds).toEqual(fixture.expected.tiedIds);
    expect(result.rounds).toHaveLength(fixture.expected.roundCount);
    expect(result.rounds.map((round) => round.eliminatedIds)).toEqual(
      fixture.expected.eliminatedByRound
    );
    expect(result.rounds.map((round) => round.exhausted)).toEqual(
      fixture.expected.exhaustedByRound
    );
  });
});

describe("computeInstantRunoffResults parity with functions implementation", () => {
  test.each(fixtures)("$id", (fixture) => {
    const webResult = computeInstantRunoffResults({
      optionIds: fixture.optionIds,
      votes: fixture.votes,
    });
    const functionsResult = computeFunctionsIrv({
      optionIds: fixture.optionIds,
      votes: fixture.votes,
    });
    expect(webResult).toEqual(functionsResult);
  });
});
