import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { formatEmbedDescription, __test__ } = require("./card-description");

describe("discord card description formatter", () => {
  test("returns undefined for blank descriptions", () => {
    expect(
      formatEmbedDescription({
        description: "   ",
        pollUrl: "https://app.example.com/scheduler/poll-1",
      })
    ).toBeUndefined();
  });

  test("returns short descriptions unchanged", () => {
    const description = "Bring snacks and minis.";
    expect(
      formatEmbedDescription({
        description,
        pollUrl: "https://app.example.com/scheduler/poll-1",
      })
    ).toBe(description);
  });

  test("truncates long descriptions and appends quest scheduler link", () => {
    const description = Array.from({ length: 420 }, (_, index) => `word${index}`).join(" ");
    const formatted = formatEmbedDescription({
      description,
      pollUrl: "https://app.example.com/scheduler/poll-1",
    });

    expect(formatted).toContain("View full content on [Quest Scheduler](https://app.example.com/scheduler/poll-1).");
    expect(formatted).toContain("...");
    expect(formatted.length).toBeLessThanOrEqual(__test__.MAX_DESCRIPTION_CHARS);
  });

  test("truncates newline-heavy descriptions", () => {
    const description = Array.from({ length: 20 }, (_, index) => `Line ${index + 1}`).join("\n");
    const formatted = formatEmbedDescription({
      description,
      pollUrl: "https://app.example.com/groups/group-1/polls/poll-1",
    });

    expect(formatted).toContain("View full content on [Quest Scheduler](https://app.example.com/groups/group-1/polls/poll-1).");
    expect(__test__.countExplicitNewlines(formatted)).toBeLessThanOrEqual(__test__.MAX_EXPLICIT_NEWLINES + 2);
  });
});
