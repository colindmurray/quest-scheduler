import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";
import { computeMultipleChoiceTallies } from "./multiple-choice";

const require = createRequire(import.meta.url);
const { computeMultipleChoiceTallies: computeFunctionsTallies } = require(
  "../../../../functions/src/basic-polls/multiple-choice.js"
);

const parityFixtures = [
  {
    id: "single-select",
    input: {
      options: [
        { id: "a", label: "A", order: 0 },
        { id: "b", label: "B", order: 1 },
        { id: "c", label: "C", order: 2 },
      ],
      votes: [
        { id: "u1", optionIds: ["a"] },
        { id: "u2", optionIds: ["a"] },
        { id: "u3", optionIds: ["c"] },
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
        { id: "u2", optionIds: ["a"] },
        { id: "u3", optionIds: ["b"] },
      ],
    },
  },
  {
    id: "write-ins-normalized",
    input: {
      options: [{ id: "a", label: "A", order: 0 }],
      allowWriteIn: true,
      votes: [
        { id: "u1", optionIds: [], otherText: "pizza" },
        { id: "u2", optionIds: [], otherText: " Pizza " },
        { id: "u3", optionIds: [], otherText: "Burritos" },
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

describe("computeMultipleChoiceTallies", () => {
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
    const tacos = writeInRows.find((row) => row.label === "Tacos");
    const sushi = writeInRows.find((row) => row.label === "Sushi");
    expect(tacos?.count).toBe(2);
    expect(sushi?.count).toBe(1);
  });

  test("breaks ties by option order", () => {
    const result = computeMultipleChoiceTallies({
      options: [
        { id: "later", label: "Later", order: 5 },
        { id: "earlier", label: "Earlier", order: 2 },
      ],
      votes: [
        { id: "u1", optionIds: ["later"] },
        { id: "u2", optionIds: ["earlier"] },
      ],
    });

    expect(result.rows.map((row) => row.key)).toEqual(["earlier", "later"]);
  });

  test("keeps unique write-ins separate and handles zero votes", () => {
    const withWriteIns = computeMultipleChoiceTallies({
      options: [{ id: "a", label: "A", order: 0 }],
      allowWriteIn: true,
      votes: [
        { id: "u1", optionIds: [], otherText: "Tacos" },
        { id: "u2", optionIds: [], otherText: "Burritos" },
      ],
    });

    const writeInRows = withWriteIns.rows.filter((row) => row.key.startsWith("write-in:"));
    expect(writeInRows).toHaveLength(2);
    expect(writeInRows.map((row) => row.label).sort()).toEqual(["Burritos", "Tacos"]);

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

describe("computeMultipleChoiceTallies parity with functions implementation", () => {
  test.each(parityFixtures)("$id", ({ input }) => {
    const webResult = computeMultipleChoiceTallies(input);
    const functionsResult = computeFunctionsTallies(input);
    expect(webResult).toEqual(functionsResult);
  });
});
