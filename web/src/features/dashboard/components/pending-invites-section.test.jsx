import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PendingInvitesSection } from "./pending-invites-section";

describe("PendingInvitesSection", () => {
  test("returns null when there are no invites", () => {
    const { container } = render(
      <PendingInvitesSection
        visiblePendingInvites={[]}
        normalizedUserEmail="test@example.com"
        inviterMap={new Map()}
        pendingInviteBusy={{}}
        onOpenInvite={vi.fn()}
        onAcceptInvite={vi.fn()}
        onDeclineInvite={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  test("renders invites and dispatches actions", () => {
    const onOpenInvite = vi.fn();
    const onAcceptInvite = vi.fn();
    const onDeclineInvite = vi.fn();
    const invite = {
      id: "sched-1",
      title: "Raid Planning",
      creatorEmail: "owner@example.com",
      pendingInviteMeta: {
        "test@example.com": { invitedByEmail: "inviter@example.com" },
      },
    };

    render(
      <PendingInvitesSection
        visiblePendingInvites={[invite]}
        normalizedUserEmail="test@example.com"
        inviterMap={new Map([["inviter@example.com", { email: "inviter@example.com" }]])}
        pendingInviteBusy={{}}
        onOpenInvite={onOpenInvite}
        onAcceptInvite={onAcceptInvite}
        onDeclineInvite={onDeclineInvite}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /raid planning/i }));
    fireEvent.click(screen.getByRole("button", { name: /accept invite/i }));
    fireEvent.click(screen.getByRole("button", { name: /decline invite/i }));

    expect(onOpenInvite).toHaveBeenCalledWith("sched-1");
    expect(onAcceptInvite).toHaveBeenCalledWith(invite);
    expect(onDeclineInvite).toHaveBeenCalledWith(invite);
  });
});
