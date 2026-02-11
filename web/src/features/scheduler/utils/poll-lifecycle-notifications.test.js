import { describe, expect, test } from "vitest";
import { shouldEmitPollLifecycleEvent } from "./poll-lifecycle-notifications";

describe("shouldEmitPollLifecycleEvent", () => {
  test("emits when recipients exist (regardless of discord)", () => {
    expect(
      shouldEmitPollLifecycleEvent({
        eventType: "POLL_FINALIZED",
        recipients: { userIds: ["u1"], emails: [] },
        questingGroupDiscord: null,
      })
    ).toBe(true);
  });

  test("does not emit when no recipients and no discord link", () => {
    expect(
      shouldEmitPollLifecycleEvent({
        eventType: "POLL_FINALIZED",
        recipients: { userIds: [], emails: [] },
        questingGroupDiscord: null,
      })
    ).toBe(false);
  });

  test("emits finalize lifecycle events for discord-linked groups even with no recipients", () => {
    expect(
      shouldEmitPollLifecycleEvent({
        eventType: "POLL_FINALIZED",
        recipients: { userIds: [], emails: [] },
        questingGroupDiscord: {
          channelId: "chan",
          guildId: "guild",
          notifications: { finalizationEvents: true },
        },
      })
    ).toBe(true);
  });

  test("defaults finalizationEvents to enabled when unset", () => {
    expect(
      shouldEmitPollLifecycleEvent({
        eventType: "POLL_REOPENED",
        recipients: { userIds: [], emails: [] },
        questingGroupDiscord: {
          channelId: "chan",
          guildId: "guild",
          notifications: {},
        },
      })
    ).toBe(true);
  });

  test("does not emit for non-lifecycle event types when no recipients", () => {
    expect(
      shouldEmitPollLifecycleEvent({
        eventType: "VOTE_SUBMITTED",
        recipients: { userIds: [], emails: [] },
        questingGroupDiscord: {
          channelId: "chan",
          guildId: "guild",
          notifications: { finalizationEvents: true },
        },
      })
    ).toBe(false);
  });
});

