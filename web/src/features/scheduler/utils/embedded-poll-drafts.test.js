import {
  removeEmbeddedPollDraft,
  reorderEmbeddedPollDrafts,
  toEmbeddedPollCreatePayloads,
  upsertEmbeddedPollDraft,
} from "./embedded-poll-drafts";
import { describe, expect, test } from "vitest";

describe("embedded poll draft helpers", () => {
  test("adds a new draft poll with generated id and next order", () => {
    const existing = [{ id: "poll-a", title: "A", order: 0, creatorId: "u1" }];
    const next = upsertEmbeddedPollDraft(existing, { title: "B" }, {
      creatorId: "u1",
      generateId: () => "poll-b",
    });

    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({
      id: "poll-b",
      title: "B",
      order: 1,
      creatorId: "u1",
    });
  });

  test("updates an existing draft poll in place", () => {
    const existing = [
      { id: "poll-a", title: "A", order: 0, creatorId: "u1", required: false },
      { id: "poll-b", title: "B", order: 1, creatorId: "u1", required: false },
    ];
    const next = upsertEmbeddedPollDraft(existing, { title: "B Updated", required: true }, {
      pollId: "poll-b",
      creatorId: "u1",
    });

    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({
      id: "poll-b",
      title: "B Updated",
      order: 1,
      required: true,
      creatorId: "u1",
    });
  });

  test("removes a draft poll and normalizes remaining orders", () => {
    const existing = [
      { id: "poll-a", order: 0 },
      { id: "poll-b", order: 1 },
      { id: "poll-c", order: 2 },
    ];
    const next = removeEmbeddedPollDraft(existing, "poll-b");

    expect(next).toEqual([
      { id: "poll-a", order: 0 },
      { id: "poll-c", order: 1 },
    ]);
  });

  test("reorders draft polls and normalizes order values", () => {
    const existing = [
      { id: "poll-a", order: 0 },
      { id: "poll-b", order: 1 },
      { id: "poll-c", order: 2 },
    ];
    const next = reorderEmbeddedPollDrafts(existing, "poll-a", "poll-c");

    expect(next.map((poll) => poll.id)).toEqual(["poll-b", "poll-c", "poll-a"]);
    expect(next.map((poll) => poll.order)).toEqual([0, 1, 2]);
  });

  test("maps drafts to create payloads without draft id and sorted order", () => {
    const payloads = toEmbeddedPollCreatePayloads(
      [
        { id: "poll-z", title: "Z", order: 2, creatorId: "u1" },
        { id: "poll-a", title: "A", order: 0, creatorId: "u1" },
      ],
      "u1"
    );

    expect(payloads).toEqual([
      { title: "A", order: 0, creatorId: "u1" },
      { title: "Z", order: 1, creatorId: "u1" },
    ]);
  });
});
