import { formatOverageMinutes } from "../../../lib/conflict-utils";
import { normalizeVoteValue, VOTE_VALUES } from "../../../lib/vote-utils";

function toMs(iso) {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  if (aEnd <= aStart || bEnd <= bStart) return false;
  return aStart < bEnd && bStart < aEnd;
}

function bestBy(items, compare) {
  if (!items.length) return null;
  return items.slice().sort(compare)[0];
}

export function buildCopyVotePlan({
  sourceSlots = [],
  sourceVotes = {},
  sourceNoTimesWork = false,
  destinationSlots = [],
  nowMs = Date.now(),
}) {
  const sourceById = new Map(sourceSlots.map((slot) => [slot.id, slot]));
  const sourceWindows = [];

  if (!sourceNoTimesWork) {
    Object.entries(sourceVotes || {}).forEach(([slotId, rawVote]) => {
      const vote = normalizeVoteValue(rawVote);
      if (vote !== VOTE_VALUES.FEASIBLE && vote !== VOTE_VALUES.PREFERRED) return;
      const slot = sourceById.get(slotId);
      if (!slot?.start || !slot?.end) return;
      const startMs = toMs(slot.start);
      const endMs = toMs(slot.end);
      if (startMs == null || endMs == null) return;
      if (endMs <= nowMs) return; // ignore past-dated source votes
      sourceWindows.push({ startMs, endMs, vote, slotId });
    });
  }

  const prefilledVotes = {};
  const matchInfoBySlotId = {};
  const futureDestinationSlots = (destinationSlots || []).filter((slot) => {
    const startMs = slot?.start ? toMs(slot.start) : null;
    const endMs = slot?.end ? toMs(slot.end) : null;
    if (startMs == null || endMs == null) return false;
    return endMs > nowMs;
  });

  futureDestinationSlots.forEach((dest) => {
    const startMs = toMs(dest.start);
    const endMs = toMs(dest.end);
    if (startMs == null || endMs == null) return;

    const overlapping = sourceWindows.filter((src) =>
      overlaps(startMs, endMs, src.startMs, src.endMs)
    );
    if (overlapping.length === 0) {
      matchInfoBySlotId[dest.id] = { type: "none" };
      return;
    }

    const fullContain = overlapping.filter((src) => src.startMs <= startMs && endMs <= src.endMs);
    if (fullContain.length) {
      const chosen = bestBy(fullContain, (a, b) => {
        const durA = a.endMs - a.startMs;
        const durB = b.endMs - b.startMs;
        if (durA !== durB) return durA - durB;
        return a.startMs - b.startMs;
      });
      prefilledVotes[dest.id] = chosen.vote;
      matchInfoBySlotId[dest.id] = { type: "copied", sourceVote: chosen.vote, sourceSlotId: chosen.slotId };
      return;
    }

    const startWithin = overlapping.filter((src) => src.startMs <= startMs && startMs < src.endMs);
    if (startWithin.length) {
      const chosen = bestBy(startWithin, (a, b) => {
        const overA = Math.max(0, endMs - a.endMs);
        const overB = Math.max(0, endMs - b.endMs);
        if (overA !== overB) return overA - overB;
        const durA = a.endMs - a.startMs;
        const durB = b.endMs - b.startMs;
        if (durA !== durB) return durA - durB;
        return a.startMs - b.startMs;
      });
      const overageMs = Math.max(0, endMs - chosen.endMs);
      const overageMinutes = overageMs / 60000;
      prefilledVotes[dest.id] = chosen.vote;
      matchInfoBySlotId[dest.id] = {
        type: "copied-extends",
        sourceVote: chosen.vote,
        sourceSlotId: chosen.slotId,
        overageMinutes,
        overageLabel: formatOverageMinutes(overageMinutes),
      };
      return;
    }

    // Destination starts before the source but overlaps. Highlight, but don't copy.
    const startsBefore = overlapping.filter((src) => startMs < src.startMs);
    const chosen = bestBy(startsBefore.length ? startsBefore : overlapping, (a, b) => {
      const overlapA = Math.max(0, Math.min(endMs, a.endMs) - Math.max(startMs, a.startMs));
      const overlapB = Math.max(0, Math.min(endMs, b.endMs) - Math.max(startMs, b.startMs));
      if (overlapA !== overlapB) return overlapB - overlapA;
      return a.startMs - b.startMs;
    });
    matchInfoBySlotId[dest.id] = {
      type: "overlap-review",
      sourceVote: chosen.vote,
      sourceSlotId: chosen.slotId,
    };
  });

  return {
    sourceWindows,
    futureDestinationSlots,
    prefilledVotes,
    matchInfoBySlotId,
  };
}
