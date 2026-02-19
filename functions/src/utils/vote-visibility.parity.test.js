import { describe, expect, test } from "vitest";

import {
  DEFAULT_HIDE_VOTER_IDENTITIES as functionHideDefault,
  DEFAULT_VOTE_VISIBILITY as functionDefault,
  VOTE_VISIBILITY as functionModes,
} from "./vote-visibility";
import {
  DEFAULT_HIDE_VOTER_IDENTITIES as webHideDefault,
  DEFAULT_VOTE_VISIBILITY as webDefault,
  VOTE_VISIBILITY as webModes,
} from "../../../web/src/lib/vote-visibility.js";

describe("vote visibility constant parity", () => {
  test("web and functions vote visibility modes stay in sync", () => {
    const functionKeys = Object.keys(functionModes).sort();
    const webKeys = Object.keys(webModes).sort();

    expect(functionKeys).toEqual(webKeys);
    functionKeys.forEach((key) => {
      expect(functionModes[key]).toBe(webModes[key]);
    });
    expect(functionDefault).toBe(webDefault);
    expect(functionHideDefault).toBe(webHideDefault);
  });
});
