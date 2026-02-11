import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
const require = createRequire(import.meta.url);
const { computeInstantRunoffResults } = require("./irv");
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.resolve(currentDir, "../../../docs/fixtures/basic-polls-irv-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
const webIrvPath = path.resolve(currentDir, "../../../web/src/lib/basic-polls/irv.js");

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

describe("computeInstantRunoffResults parity with web implementation", () => {
  test.each(fixtures)("$id", async (fixture) => {
    const webModule = await import(webIrvPath);
    const webResult = webModule.computeInstantRunoffResults({
      optionIds: fixture.optionIds,
      votes: fixture.votes,
    });
    const functionsResult = computeInstantRunoffResults({
      optionIds: fixture.optionIds,
      votes: fixture.votes,
    });
    expect(functionsResult).toEqual(webResult);
  });
});
