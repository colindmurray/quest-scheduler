import { describe, expect, test } from "vitest";
import { parseEmbeddedPollIdFromSearch } from "./embedded-poll-deep-link";

describe("parseEmbeddedPollIdFromSearch", () => {
  test("returns poll id from query string", () => {
    expect(parseEmbeddedPollIdFromSearch("?poll=abc123")).toBe("abc123");
  });

  test("supports query strings without leading question mark", () => {
    expect(parseEmbeddedPollIdFromSearch("poll=xyz789&foo=bar")).toBe("xyz789");
  });

  test("returns null when poll query param is missing or blank", () => {
    expect(parseEmbeddedPollIdFromSearch("?foo=bar")).toBeNull();
    expect(parseEmbeddedPollIdFromSearch("?poll=")).toBeNull();
    expect(parseEmbeddedPollIdFromSearch("?poll=   ")).toBeNull();
    expect(parseEmbeddedPollIdFromSearch("")).toBeNull();
  });
});
