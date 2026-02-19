import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PollParticipantSummary } from "./poll-participant-summary";

const USERS = [
  { id: "u1", email: "one@example.com" },
  { id: "u2", email: "two@example.com" },
  { id: "u3", email: "three@example.com" },
];

describe("PollParticipantSummary", () => {
  test("renders invitee, voted, and pending stats", () => {
    render(
      <PollParticipantSummary
        eligibleUsers={USERS}
        votedUsers={USERS.slice(0, 1)}
        pendingUsers={USERS.slice(1)}
      />
    );

    expect(screen.getByText("3 invitees:")).toBeTruthy();
    expect(screen.getByText("1/3 voted:")).toBeTruthy();
    expect(screen.getByText("2/3 pending:")).toBeTruthy();
  });

  test("shows all voted state when pending is empty", () => {
    render(
      <PollParticipantSummary
        eligibleUsers={USERS.slice(0, 2)}
        votedUsers={USERS.slice(0, 2)}
        pendingUsers={[]}
      />
    );

    expect(screen.getByText("All voted!")).toBeTruthy();
  });

  test("shows anonymized counts when voter identities are hidden", () => {
    render(
      <PollParticipantSummary
        eligibleUsers={USERS}
        votedUsers={USERS.slice(0, 1)}
        pendingUsers={USERS.slice(1)}
        showVoterIdentities={false}
      />
    );

    expect(screen.getByText("1/3 voted:")).toBeTruthy();
    expect(screen.getByText("2/3 pending:")).toBeTruthy();
  });

  test("returns nothing when there are no invitees", () => {
    const { container } = render(
      <PollParticipantSummary eligibleUsers={[]} votedUsers={[]} pendingUsers={[]} />
    );
    expect(container.innerHTML).toBe("");
  });
});
