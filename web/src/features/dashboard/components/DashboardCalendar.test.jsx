import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { DashboardCalendar } from "./DashboardCalendar";

const safeNavigateMock = vi.fn();
const setSelectedEventIdMock = vi.fn();
const jumpNextMock = vi.fn();
const jumpPrevMock = vi.fn();
const jumpNextWindowMock = vi.fn();
const jumpPrevWindowMock = vi.fn();
let lastCalendarProps = null;

vi.mock("react-big-calendar", () => ({
  dateFnsLocalizer: () => ({}),
  Calendar: (props) => {
    lastCalendarProps = props;
    return (
      <div>
        <p>Events: {props.events.length}</p>
        <button type="button" onClick={() => props.onSelectEvent(props.events[0])}>
          Select first event
        </button>
      </div>
    );
  },
}));

vi.mock("../../../hooks/useSafeNavigate", () => ({
  useSafeNavigate: () => safeNavigateMock,
}));

vi.mock("../../../hooks/useCalendarNavigation", () => ({
  useCalendarNavigation: () => ({
    scrollToTime: new Date("1970-01-01T08:00:00.000Z"),
    selectedEventId: null,
    setSelectedEventId: setSelectedEventIdMock,
    hasEvents: true,
    hasEventsInView: true,
    jumpNext: jumpNextMock,
    jumpPrev: jumpPrevMock,
    jumpNextWindow: jumpNextWindowMock,
    jumpPrevWindow: jumpPrevWindowMock,
  }),
}));

describe("DashboardCalendar", () => {
  test("builds calendar events from sessions and opens selected scheduler", async () => {
    render(
      <DashboardCalendar
        sessions={[
          {
            id: "sched-1",
            title: "Finalized Session",
            status: "FINALIZED",
            winningSlot: {
              start: "2026-03-10T18:00:00.000Z",
              end: "2026-03-10T21:00:00.000Z",
            },
          },
          {
            id: "sched-2",
            title: "Open Session",
            status: "OPEN",
            firstSlot: {
              start: "2026-03-11T18:00:00.000Z",
              end: "2026-03-11T20:00:00.000Z",
            },
          },
        ]}
      />
    );

    expect(screen.getByText("Events: 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /select first event/i }));

    expect(setSelectedEventIdMock).toHaveBeenCalledWith("sched-1");
    expect(safeNavigateMock).toHaveBeenCalledWith("/scheduler/sched-1");
  });

  test("syncs calendar date with focusedDate prop", async () => {
    render(
      <DashboardCalendar
        sessions={[]}
        focusedDate={new Date("2026-04-20T00:00:00.000Z")}
      />
    );

    await waitFor(() =>
      expect(lastCalendarProps?.date?.toISOString()).toContain("2026-04-20")
    );
  });
});
