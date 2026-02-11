function toMillis(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value?.toMillis === "function") {
    try {
      const ms = value.toMillis();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  return null;
}

function overlaps({ startA, endA, startB, endB }) {
  if (startA == null || endA == null || startB == null || endB == null) return false;
  // Treat windows as [start, end). Zero/negative durations never overlap.
  if (endA <= startA || endB <= startB) return false;
  return startA < endB && startB < endA;
}

export function normalizeBusyWindows(raw = []) {
  return (raw || [])
    .map((win) => {
      const startMs = toMillis(win?.startUtc ?? win?.start ?? null);
      const endMs = toMillis(win?.endUtc ?? win?.end ?? null);
      const priorityAtMs = toMillis(win?.priorityAtMs ?? win?.priorityAt ?? null);
      if (startMs == null || endMs == null) return null;
      return {
        startMs,
        endMs,
        sourceSchedulerId: win?.sourceSchedulerId || null,
        sourceWinningSlotId: win?.sourceWinningSlotId || null,
        priorityAtMs: priorityAtMs ?? null,
      };
    })
    .filter(Boolean);
}

export function findBlockingWindow({
  busyWindows = [],
  slotStartMs,
  slotEndMs,
  currentSchedulerId = null,
  currentStatus = "OPEN",
  currentPriorityAtMs = null,
}) {
  if (!Array.isArray(busyWindows) || busyWindows.length === 0) return null;
  if (slotStartMs == null || slotEndMs == null) return null;

  const normalized = normalizeBusyWindows(busyWindows);

  const candidates = normalized.filter((win) => {
    if (currentSchedulerId && win.sourceSchedulerId === currentSchedulerId) return false;
    if (!overlaps({ startA: slotStartMs, endA: slotEndMs, startB: win.startMs, endB: win.endMs })) {
      return false;
    }
    if (currentStatus === "FINALIZED" && currentPriorityAtMs != null && win.priorityAtMs != null) {
      // Earlier finalized sessions keep priority; later ones should not block them.
      return win.priorityAtMs < currentPriorityAtMs;
    }
    // OPEN (or missing priority): any overlapping busy window blocks.
    return currentStatus !== "FINALIZED";
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const prioA = a.priorityAtMs ?? Number.POSITIVE_INFINITY;
    const prioB = b.priorityAtMs ?? Number.POSITIVE_INFINITY;
    if (prioA !== prioB) return prioA - prioB;
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    if (a.endMs !== b.endMs) return a.endMs - b.endMs;
    return String(a.sourceSchedulerId || "").localeCompare(String(b.sourceSchedulerId || ""));
  });

  return candidates[0];
}

export function isUserBlockedForSlot({
  autoBlockConflicts = false,
  busyWindows = [],
  slotStartMs,
  slotEndMs,
  currentSchedulerId = null,
  currentStatus = "OPEN",
  currentPriorityAtMs = null,
}) {
  if (!autoBlockConflicts) return false;
  return Boolean(
    findBlockingWindow({
      busyWindows,
      slotStartMs,
      slotEndMs,
      currentSchedulerId,
      currentStatus,
      currentPriorityAtMs,
    })
  );
}

export function formatOverageMinutes(minutes) {
  const value = Math.max(0, Math.round(minutes));
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

