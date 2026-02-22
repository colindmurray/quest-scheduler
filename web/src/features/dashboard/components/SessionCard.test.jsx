import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SessionCard } from "./SessionCard";

const safeNavigateMock = vi.fn();

vi.mock("../../../hooks/useSafeNavigate", () => ({
  useSafeNavigate: () => safeNavigateMock,
}));

vi.mock("../../../hooks/useUserProfiles", () => ({
  useUserProfiles: () => ({
    enrichUsers: (emails = []) => emails.map((email) => ({ email })),
  }),
}));

function buildScheduler(overrides = {}) {
  return {
    id: "sched-1",
    title: "Session Alpha",
    status: "OPEN",
    googleEventId: "sched-1@google.com",
    ...overrides,
  };
}

describe("SessionCard", () => {
  beforeEach(() => {
    safeNavigateMock.mockReset();
  });

  test("navigates to scheduler details when card is clicked", () => {
    render(<SessionCard scheduler={buildScheduler()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open session poll Session Alpha" }));

    expect(safeNavigateMock).toHaveBeenCalledWith("/scheduler/sched-1");
  });

  test("supports keyboard activation on Enter and Space", () => {
    render(<SessionCard scheduler={buildScheduler()} />);
    const card = screen.getByRole("button", { name: "Open session poll Session Alpha" });

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });

    expect(safeNavigateMock).toHaveBeenNthCalledWith(1, "/scheduler/sched-1");
    expect(safeNavigateMock).toHaveBeenNthCalledWith(2, "/scheduler/sched-1");
  });

  test("renders a Google Calendar link that does not trigger card navigation", () => {
    render(<SessionCard scheduler={buildScheduler()} />);

    const link = screen.getByRole("link", {
      name: "Open Session Alpha in Google Calendar",
    });
    expect(link.getAttribute("href")).toBe(
      `https://calendar.google.com/calendar/event?eid=${btoa("sched-1@google.com")}`
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.className).toContain("cursor-pointer");

    fireEvent.click(link);

    expect(safeNavigateMock).not.toHaveBeenCalled();
  });

  test("does not render a calendar link when no Google event id is available", () => {
    render(<SessionCard scheduler={buildScheduler({ googleEventId: null })} />);

    expect(
      screen.queryByRole("link", { name: "Open Session Alpha in Google Calendar" })
    ).toBeNull();
  });
});
