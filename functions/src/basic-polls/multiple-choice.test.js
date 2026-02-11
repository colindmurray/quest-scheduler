import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { computeMultipleChoiceTallies } = require("./multiple-choice");
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webTalliesPath = path.resolve(currentDir, "../../../web/src/lib/basic-polls/multiple-choice.js");

const fixtures = [
  {
    id: "single-select",
    input: {
      options: [
        { id: "a", label: "A", order: 0 },
        { id: "b", label: "B", order: 1 },
      ],
      votes: [
        { id: "u1", optionIds: ["a"] },
        { id: "u2", optionIds: ["a"] },
        { id: "u3", optionIds: ["b"] },
      ],
    },
  },
  {
    id: "multi-select",
    input: {
      options: [
        { id: "a", label: "A", order: 0 },
        { id: "b", label: "B", order: 1 },
      ],
      votes: [
        { id: "u1", optionIds: ["a", "b"] },
        { id: "u2", optionIds: ["b"] },
        { id: "u3", optionIds: ["a"] },
      ],
    },
  },
  {
    id: "write-ins",
    input: {
      options: [{ id: "a", label: "A", order: 0 }],
      allowWriteIn: true,
      votes: [
        { id: "u1", optionIds: [], otherText: "Tacos" },
        { id: "u2", optionIds: [], otherText: " tacos " },
        { id: "u3", optionIds: [], otherText: "Sushi" },
      ],
    },
  },
  {
    id: "zero-votes",
    input: {
      options: [
        { id: "a", label: "A", order: 0 },
        { id: "b", label: "B", order: 1 },
      ],
      votes: [],
    },
  },
];

describe("functions basic-polls multiple-choice tallies", () => {
  test("computes single-select counts and percentages", () => {
    const result = computeMultipleChoiceTallies({
      options: [
        { id: "a", label: "A", order: 0 },
        { id: "b", label: "B", order: 1 },
      ],
      votes: [
        { id: "u1", optionIds: ["a"] },
        { id: "u2", optionIds: ["a"] },
        { id: "u3", optionIds: ["b"] },
      ],
    });

    expect(result.totalVoters).toBe(3);
    expect(result.rows.map((row) => row.key)).toEqual(["a", "b"]);
    expect(result.rows.map((row) => row.count)).toEqual([2, 1]);
    expect(result.rows.map((row) => row.percentage)).toEqual([67, 33]);
  });

  test("uses voter denominator for multi-select percentages", () => {
    const result = computeMultipleChoiceTallies({
      options: [
        { id: "a", label: "A", order: 0 },
        { id: "b", label: "B", order: 1 },
      ],
      votes: [
        { id: "u1", optionIds: ["a", "b"] },
        { id: "u2", optionIds: ["b"] },
        { id: "u3", optionIds: ["a"] },
      ],
    });

    expect(result.totalVoters).toBe(3);
    expect(result.rows.map((row) => row.count)).toEqual([2, 2]);
    expect(result.rows.map((row) => row.percentage)).toEqual([67, 67]);
  });

  test("groups write-ins case-insensitively with trim", () => {
    const result = computeMultipleChoiceTallies({
      options: [{ id: "a", label: "A", order: 0 }],
      allowWriteIn: true,
      votes: [
        { id: "u1", optionIds: [], otherText: "Tacos" },
        { id: "u2", optionIds: [], otherText: " tacos " },
        { id: "u3", optionIds: [], otherText: "Sushi" },
      ],
    });

    const writeInRows = result.rows.filter((row) => row.key.startsWith("write-in:"));
    expect(writeInRows).toHaveLength(2);
    expect(writeInRows.find((row) => row.label === "Tacos")?.count).toBe(2);
    expect(writeInRows.find((row) => row.label === "Sushi")?.count).toBe(1);
  });

  test("breaks ties by option order and handles zero votes", () => {
    const tieResult = computeMultipleChoiceTallies({
      options: [
        { id: "later", label: "Later", order: 5 },
        { id: "earlier", label: "Earlier", order: 2 },
      ],
      votes: [
        { id: "u1", optionIds: ["later"] },
        { id: "u2", optionIds: ["earlier"] },
      ],
    });
    expect(tieResult.rows.map((row) => row.key)).toEqual(["earlier", "later"]);

    const zeroVotes = computeMultipleChoiceTallies({
      options: [{ id: "a", label: "A", order: 0 }],
      votes: [],
    });
    expect(zeroVotes.totalVoters).toBe(0);
    expect(zeroVotes.rows).toEqual([
      expect.objectContaining({ key: "a", count: 0, percentage: 0 }),
    ]);
  });
});

describe("functions basic-polls multiple-choice parity with web", () => {
  test.each(fixtures)("$id", async ({ input }) => {
    const webModule = await import(webTalliesPath);
    const webResult = webModule.computeMultipleChoiceTallies(input);
    const functionsResult = computeMultipleChoiceTallies(input);
    expect(functionsResult).toEqual(webResult);
  });
});
