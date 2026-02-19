import { describe, expect, test } from "vitest";

import {
  DEFAULT_VOTE_ANONYMIZATION as functionAnonymizationDefault,
  DEFAULT_HIDE_VOTER_IDENTITIES as functionHideDefault,
  DEFAULT_VOTE_VISIBILITY as functionDefault,
  VOTE_ANONYMIZATION as functionAnonymizationModes,
  VOTE_VISIBILITY as functionModes,
} from "./vote-visibility";
import {
  DEFAULT_VOTE_ANONYMIZATION as webAnonymizationDefault,
  DEFAULT_HIDE_VOTER_IDENTITIES as webHideDefault,
  DEFAULT_VOTE_VISIBILITY as webDefault,
  VOTE_ANONYMIZATION as webAnonymizationModes,
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

  test("web and functions vote anonymization modes stay in sync", () => {
    const functionKeys = Object.keys(functionAnonymizationModes).sort();
    const webKeys = Object.keys(webAnonymizationModes).sort();

    expect(functionKeys).toEqual(webKeys);
    functionKeys.forEach((key) => {
      expect(functionAnonymizationModes[key]).toBe(webAnonymizationModes[key]);
    });
    expect(functionAnonymizationDefault).toBe(webAnonymizationDefault);
  });
});
