import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useCalendarNavigation } from "./useCalendarNavigation";

function event(id, start, end) {
  return {
    id,
    start: new Date(start),
    end: new Date(end),
  };
}

describe("useCalendarNavigation", () => {
  test("returns empty state when there are no events", () => {
    const date = new Date("2026-02-01T00:00:00.000Z");
    const { result } = renderHook(() =>
      useCalendarNavigation({
        events: [],
        view: "month",
        date,
        onNavigate: vi.fn(),
      })
    );

    expect(result.current.hasEvents).toBe(false);
    expect(result.current.hasEventsInView).toBe(false);
    expect(result.current.scrollToTime).toBeUndefined();
  });

  test("jumpNext focuses first event and navigates to its bucket", () => {
    const onNavigate = vi.fn();
    const date = new Date("2026-02-01T00:00:00.000Z");
    const events = [
      event("evt-1", "2026-03-02T10:00:00.000Z", "2026-03-02T11:00:00.000Z"),
      event("evt-2", "2026-03-05T10:00:00.000Z", "2026-03-05T11:00:00.000Z"),
    ];

    const { result } = renderHook(() =>
      useCalendarNavigation({
        events,
        view: "month",
        date,
        onNavigate,
      })
    );

    act(() => {
      result.current.jumpNext();
    });

    expect(result.current.selectedEventId).toBe("evt-1");
    expect(onNavigate).toHaveBeenCalledWith(new Date("2026-03-02T10:00:00.000Z"));
  });

  test("jump window controls move between weekly buckets", () => {
    const onNavigate = vi.fn();
    const date = new Date("2026-02-03T00:00:00.000Z");
    const events = [
      event("week-1", "2026-02-02T08:00:00.000Z", "2026-02-02T09:00:00.000Z"),
      event("week-2", "2026-02-16T08:00:00.000Z", "2026-02-16T09:00:00.000Z"),
    ];

    const { result } = renderHook(() =>
      useCalendarNavigation({
        events,
        view: "week",
        date,
        onNavigate,
      })
    );

    act(() => {
      result.current.jumpNextWindow();
    });
    expect(result.current.selectedEventId).toBe("week-2");
    expect(onNavigate).toHaveBeenCalledWith(new Date("2026-02-16T08:00:00.000Z"));

    act(() => {
      result.current.jumpPrevWindow();
    });
    expect(result.current.selectedEventId).toBe("week-1");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
