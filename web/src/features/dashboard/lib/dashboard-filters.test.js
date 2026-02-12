import { describe, expect, test } from "vitest";
import {
  DASHBOARD_STATUS_ORDER,
  DASHBOARD_STATUS_OPTIONS,
  describeDateFilterSelection,
  describeStatusFilterSelection,
  isWithinDateWindow,
  matchesSearch,
  normalizeDateRangeBounds,
  normalizeSearchValue,
  resolveBasicPollDashboardStatus,
  resolveSessionDashboardStatus,
  toDayEndMs,
  toDayStartMs,
} from "./dashboard-filters";

describe("dashboard-filters", () => {
  test("exports status options and order", () => {
    expect(DASHBOARD_STATUS_OPTIONS).toHaveLength(5);
    expect(DASHBOARD_STATUS_ORDER).toEqual([
      "OPEN",
      "FINALIZED",
      "CANCELLED",
      "CLOSED",
      "ARCHIVED",
    ]);
  });

  test("normalizes search values and matches fields", () => {
    expect(normalizeSearchValue("  Raid Prep  ")).toBe("raid prep");
    expect(matchesSearch(["Raid Food", "Snacks"], "raid")).toBe(true);
    expect(matchesSearch(["Raid Food", "Snacks"], "downtime")).toBe(false);
  });

  test("derives day bounds and checks date windows", () => {
    const day = new Date("2026-03-10T12:00:00.000Z");
    const fromMs = toDayStartMs(day);
    const toMs = toDayEndMs(day);

    expect(fromMs).not.toBeNull();
    expect(toMs).not.toBeNull();
    expect(toMs).toBeGreaterThan(fromMs);
    expect(isWithinDateWindow("2026-03-10T18:00:00.000Z", fromMs, toMs)).toBe(true);
    expect(isWithinDateWindow(new Date(toMs + 1).toISOString(), fromMs, toMs)).toBe(false);
  });

  test("resolves session and general poll status labels", () => {
    const archivedSet = new Set(["sched-archived"]);
    expect(resolveSessionDashboardStatus({ id: "sched-archived", status: "OPEN" }, archivedSet)).toBe("ARCHIVED");
    expect(resolveSessionDashboardStatus({ id: "sched-final", status: "FINALIZED" }, archivedSet)).toBe("FINALIZED");
    expect(resolveSessionDashboardStatus({ id: "sched-cancelled", status: "CANCELLED" }, archivedSet)).toBe("CANCELLED");
    expect(resolveSessionDashboardStatus({ id: "sched-open", status: "OPEN" }, archivedSet)).toBe("OPEN");

    expect(resolveBasicPollDashboardStatus({ isArchived: true, state: "OPEN" })).toBe("ARCHIVED");
    expect(resolveBasicPollDashboardStatus({ pollStatus: "FINALIZED", state: "CLOSED" })).toBe("FINALIZED");
    expect(resolveBasicPollDashboardStatus({ pollStatus: "OPEN", state: "CLOSED" })).toBe("CLOSED");
    expect(resolveBasicPollDashboardStatus({ pollStatus: "OPEN", state: "OPEN_VOTED" })).toBe("OPEN");
  });

  test("describes filter selections and normalizes date range ordering", () => {
    expect(describeStatusFilterSelection([])).toBe("Any status");
    expect(describeStatusFilterSelection(["FINALIZED"])).toBe("Finalized");
    expect(describeStatusFilterSelection(["OPEN", "CLOSED"])).toBe("2 statuses");

    const reversed = normalizeDateRangeBounds(
      new Date("2026-03-10T00:00:00.000Z"),
      new Date("2026-03-01T00:00:00.000Z")
    );
    expect(reversed.from?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(reversed.to?.toISOString()).toBe("2026-03-10T00:00:00.000Z");
    expect(describeDateFilterSelection(reversed.from, reversed.to)).toContain("to");
  });
});
