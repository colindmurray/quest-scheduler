import { describe, expect, test } from "vitest";

import { NOTIFICATION_EVENTS as functionEvents } from "./constants";
import { NOTIFICATION_EVENTS as webEvents } from "../../../web/src/lib/notification-types.js";

describe("notification event parity", () => {
  test("web and functions canonical notification events stay in sync", () => {
    const functionKeys = Object.keys(functionEvents).sort();
    const webKeys = Object.keys(webEvents).sort();

    expect(webKeys).toEqual(functionKeys);
    functionKeys.forEach((key) => {
      expect(webEvents[key]).toBe(functionEvents[key]);
      expect(functionEvents[key]).toBe(key);
    });
  });
});
