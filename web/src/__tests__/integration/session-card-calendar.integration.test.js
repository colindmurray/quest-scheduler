// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PastSessionsSection } from "../../features/dashboard/components/past-sessions-section";

const safeNavigateMock = vi.fn();

vi.mock("../../hooks/useSafeNavigate", () => ({
  useSafeNavigate: () => safeNavigateMock,
}));

vi.mock("../../hooks/useUserProfiles", () => ({
  useUserProfiles: () => ({
    enrichUsers: (emails = []) => emails.map((email) => ({ email })),
  }),
}));

function buildScheduler(overrides = {}) {
  return {
    id: "sched-finalized",
    title: "Finalized Quest",
    status: "FINALIZED",
    googleEventId: "sched-finalized@google.com",
    winningSlot: {
      start: "2026-06-10T18:00:00.000Z",
      end: "2026-06-10T20:00:00.000Z",
    },
    ...overrides,
  };
}

function renderPastSessions(scheduler) {
  return render(
    <PastSessionsSection
      pastSessionsTab="finalized"
      onTabChange={vi.fn()}
      pastFinalized={[scheduler]}
      cancelledSessions={[]}
      archivedSessions={[]}
      getGroupColor={() => null}
      groupsById={{}}
    />
  );
}

describe("SessionCard calendar integration", () => {
  beforeEach(() => {
    safeNavigateMock.mockReset();
  });

  test("calendar link is clickable in SessionCard context without triggering card navigation", () => {
    renderPastSessions(buildScheduler());

    const card = screen.getByTestId("session-card-sched-finalized");
    const cardButton = within(card).getByRole("button", {
      name: "Open session poll Finalized Quest",
    });
    const calendarLink = within(card).getByRole("link", {
      name: "Open Finalized Quest in Google Calendar",
    });

    fireEvent.click(calendarLink);
    expect(safeNavigateMock).not.toHaveBeenCalled();

    fireEvent.click(cardButton);
    expect(safeNavigateMock).toHaveBeenCalledWith("/scheduler/sched-finalized");
  });

  test("calendar link presence updates when scheduler data changes", () => {
    const { rerender } = renderPastSessions(buildScheduler());
    expect(
      screen.getByRole("link", { name: "Open Finalized Quest in Google Calendar" })
    ).toBeTruthy();

    rerender(
      <PastSessionsSection
        pastSessionsTab="finalized"
        onTabChange={vi.fn()}
        pastFinalized={[buildScheduler({ googleEventId: null })]}
        cancelledSessions={[]}
        archivedSessions={[]}
        getGroupColor={() => null}
        groupsById={{}}
      />
    );

    expect(
      screen.queryByRole("link", { name: "Open Finalized Quest in Google Calendar" })
    ).toBeNull();
  });
});
