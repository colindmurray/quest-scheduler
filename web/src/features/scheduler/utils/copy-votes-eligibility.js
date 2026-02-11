import { normalizeVoteValue, VOTE_VALUES } from "../../../lib/vote-utils";

function toMs(iso) {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function slotEndMs(slot) {
  if (!slot) return null;
  const end = slot.end ? toMs(slot.end) : null;
  if (end != null) return end;
  return slot.start ? toMs(slot.start) : null;
}

export function canUserCopyVotes({ slots = [], userVoteDoc = null, nowMs = Date.now() }) {
  if (!userVoteDoc) return false;

  const hasFutureSlots = (slots || []).some((slot) => {
    const endMs = slotEndMs(slot);
    return endMs != null && endMs > nowMs;
  });
  if (!hasFutureSlots) return false;

  if (userVoteDoc.noTimesWork) return true;

  const slotById = new Map((slots || []).map((slot) => [slot.id, slot]));
  return Object.entries(userVoteDoc.votes || {}).some(([slotId, rawVote]) => {
    const vote = normalizeVoteValue(rawVote);
    if (vote !== VOTE_VALUES.FEASIBLE && vote !== VOTE_VALUES.PREFERRED) return false;
    const slot = slotById.get(slotId);
    const endMs = slotEndMs(slot);
    return endMs != null && endMs > nowMs;
  });
}

