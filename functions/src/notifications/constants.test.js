import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  NOTIFICATION_EVENTS,
  LEGACY_NOTIFICATION_ALIASES,
  resolveNotificationEventType,
} = require("./constants");

describe("notification event constants", () => {
  test("enum is complete and values match keys", () => {
    const expected = [
      "POLL_CREATED",
      "POLL_INVITE_SENT",
      "POLL_INVITE_ACCEPTED",
      "POLL_INVITE_DECLINED",
      "POLL_INVITE_REVOKED",
      "VOTE_SUBMITTED",
      "VOTE_REMINDER",
      "POLL_READY_TO_FINALIZE",
      "POLL_FINALIZED",
      "POLL_REOPENED",
      "POLL_CANCELLED",
      "POLL_RESTORED",
      "POLL_DELETED",
      "SLOT_CHANGED",
      "DISCORD_NUDGE_SENT",
      "FRIEND_REQUEST_SENT",
      "FRIEND_REQUEST_ACCEPTED",
      "FRIEND_REQUEST_DECLINED",
      "FRIEND_REMOVED",
      "GROUP_INVITE_SENT",
      "GROUP_INVITE_ACCEPTED",
      "GROUP_INVITE_DECLINED",
      "GROUP_MEMBER_REMOVED",
      "GROUP_MEMBER_LEFT",
      "GROUP_DELETED",
    ];

    const keys = Object.keys(NOTIFICATION_EVENTS).sort();
    const values = Object.values(NOTIFICATION_EVENTS).sort();

    expect(keys).toEqual(expected.slice().sort());
    expect(values).toEqual(expected.slice().sort());

    keys.forEach((key) => {
      expect(NOTIFICATION_EVENTS[key]).toBe(key);
    });
  });

  test("legacy aliases resolve to new event types", () => {
    Object.entries(LEGACY_NOTIFICATION_ALIASES).forEach(([legacy, current]) => {
      expect(resolveNotificationEventType(legacy)).toBe(current);
    });
  });

  test("group member change resolves by metadata action", () => {
    expect(resolveNotificationEventType("GROUP_MEMBER_CHANGE", { action: "removed" })).toBe(
      NOTIFICATION_EVENTS.GROUP_MEMBER_REMOVED
    );
    expect(resolveNotificationEventType("GROUP_MEMBER_CHANGE", { action: "left" })).toBe(
      NOTIFICATION_EVENTS.GROUP_MEMBER_LEFT
    );
    expect(resolveNotificationEventType("GROUP_MEMBER_CHANGE", { action: "unknown" })).toBeNull();
  });

  test("new event types pass through", () => {
    expect(resolveNotificationEventType("POLL_FINALIZED")).toBe("POLL_FINALIZED");
  });
});
