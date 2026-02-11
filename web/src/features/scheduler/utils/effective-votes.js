import { findBlockingWindow } from "../../../lib/conflict-utils";
import { normalizeEmail } from "../../../lib/utils";
import { normalizeVoteValue, VOTE_VALUES } from "../../../lib/vote-utils";

function toMs(iso) {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function slotWindow(slot) {
  const startMs = slot?.start ? toMs(slot.start) : null;
  const endMs = slot?.end ? toMs(slot.end) : null;
  if (startMs == null || endMs == null) return null;
  return { startMs, endMs };
}

function isBlocked({
  profile,
  slotStartMs,
  slotEndMs,
  schedulerId,
  schedulerStatus,
  pollPriorityAtMs,
}) {
  if (!profile?.autoBlockConflicts) return null;
  return findBlockingWindow({
    busyWindows: profile.busyWindows || [],
    slotStartMs,
    slotEndMs,
    currentSchedulerId: schedulerId,
    currentStatus: schedulerStatus,
    currentPriorityAtMs: pollPriorityAtMs,
  });
}

export function buildEffectiveTallies({
  schedulerId,
  schedulerStatus = "OPEN",
  pollPriorityAtMs = null,
  slots = [],
  voteDocs = [],
  profilesById = {},
}) {
  const windowsBySlotId = new Map();
  (slots || []).forEach((slot) => {
    const win = slotWindow(slot);
    if (win) windowsBySlotId.set(slot.id, win);
  });

  const tallies = {};
  const slotVoters = {};

  (voteDocs || []).forEach((voteDoc) => {
    if (!voteDoc?.id) return;
    if (voteDoc.noTimesWork) return;
    const profile = profilesById?.[voteDoc.id] || null;
    const userInfo = {
      email: voteDoc.userEmail,
      avatar: voteDoc.userAvatar,
      source: voteDoc.source || voteDoc.lastVotedFrom || "web",
    };

    Object.entries(voteDoc.votes || {}).forEach(([slotId, rawValue]) => {
      const voteValue = normalizeVoteValue(rawValue);
      if (voteValue !== VOTE_VALUES.FEASIBLE && voteValue !== VOTE_VALUES.PREFERRED) return;
      const win = windowsBySlotId.get(slotId);
      if (!win) return;
      const blocker = isBlocked({
        profile,
        slotStartMs: win.startMs,
        slotEndMs: win.endMs,
        schedulerId,
        schedulerStatus,
        pollPriorityAtMs,
      });
      if (blocker) return;

      if (!tallies[slotId]) tallies[slotId] = { feasible: 0, preferred: 0 };
      if (!slotVoters[slotId]) slotVoters[slotId] = { feasible: [], preferred: [] };

      if (voteValue === VOTE_VALUES.PREFERRED) {
        tallies[slotId].preferred += 1;
        tallies[slotId].feasible += 1;
        slotVoters[slotId].preferred.push(userInfo);
        slotVoters[slotId].feasible.push(userInfo);
      } else {
        tallies[slotId].feasible += 1;
        slotVoters[slotId].feasible.push(userInfo);
      }
    });
  });

  // Dedupe voter lists by normalized email, preserving first occurrence.
  Object.entries(slotVoters).forEach(([slotId, lists]) => {
    const seenPreferred = new Set();
    const seenFeasible = new Set();
    const preferred = [];
    const feasible = [];

    (lists.preferred || []).forEach((user) => {
      const key = normalizeEmail(user?.email) || user?.email;
      if (!key || seenPreferred.has(key)) return;
      seenPreferred.add(key);
      preferred.push(user);
    });

    (lists.feasible || []).forEach((user) => {
      const key = normalizeEmail(user?.email) || user?.email;
      if (!key || seenFeasible.has(key)) return;
      seenFeasible.add(key);
      feasible.push(user);
    });

    slotVoters[slotId] = { preferred, feasible };
  });

  return { tallies, slotVoters, windowsBySlotId };
}

export function buildUserBlockInfo({
  schedulerId,
  schedulerStatus = "OPEN",
  pollPriorityAtMs = null,
  slots = [],
  userProfile = null,
}) {
  const infoBySlotId = {};
  const windowsBySlotId = new Map();
  (slots || []).forEach((slot) => {
    const win = slotWindow(slot);
    if (win) windowsBySlotId.set(slot.id, win);
  });

  (slots || []).forEach((slot) => {
    const win = windowsBySlotId.get(slot.id);
    if (!win) return;
    const blocker = isBlocked({
      profile: userProfile,
      slotStartMs: win.startMs,
      slotEndMs: win.endMs,
      schedulerId,
      schedulerStatus,
      pollPriorityAtMs,
    });
    if (!blocker) return;
    infoBySlotId[slot.id] = blocker;
  });

  return { infoBySlotId, windowsBySlotId };
}

