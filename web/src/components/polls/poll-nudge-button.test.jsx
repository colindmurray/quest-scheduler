import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PollNudgeButton, getNudgeCooldownRemaining } from "./poll-nudge-button";

describe("poll nudge button", () => {
  test("getNudgeCooldownRemaining returns zero when no timestamp is provided", () => {
    expect(getNudgeCooldownRemaining(null, 0)).toBe(0);
    expect(getNudgeCooldownRemaining(undefined, 0)).toBe(0);
  });

  test("getNudgeCooldownRemaining supports Firestore timestamp-like values", () => {
    const lastNudgeAt = {
      toDate: () => new Date(1_700_000_000_000),
    };
    const remaining = getNudgeCooldownRemaining(lastNudgeAt, 1_700_000_000_000 + 60_000);
    expect(remaining).toBe(8 * 60 * 60 * 1000 - 60_000);
  });

  test("renders cooldown label and disables button while on cooldown", () => {
    render(
      <PollNudgeButton
        onClick={() => {}}
        sending={false}
        cooldownRemainingMs={65 * 60 * 1000}
      />
    );

    const button = screen.getByRole("button", { name: "1h 5m" });
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(true);
  });

  test("renders sending label while in-flight", () => {
    render(
      <PollNudgeButton
        onClick={() => {}}
        sending
        cooldownRemainingMs={0}
      />
    );

    const button = screen.getByRole("button", { name: "Sending..." });
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(true);
  });

  test("renders default action label and calls onClick", () => {
    const onClick = vi.fn();
    render(
      <PollNudgeButton
        onClick={onClick}
        sending={false}
        cooldownRemainingMs={0}
      />
    );

    const button = screen.getByRole("button", { name: "Nudge participants" });
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
