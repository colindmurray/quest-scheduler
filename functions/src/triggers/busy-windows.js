const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { logger } = require("firebase-functions");
const { isAttendingVote } = require("../utils/vote-utils");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function normalizeBusyWindows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((win) => win && typeof win === "object")
    .map((win) => ({
      startUtc: win.startUtc || null,
      endUtc: win.endUtc || null,
      sourceSchedulerId: win.sourceSchedulerId || null,
      sourceWinningSlotId: win.sourceWinningSlotId || null,
      priorityAtMs: Number.isFinite(win.priorityAtMs) ? win.priorityAtMs : null,
    }))
    .filter((win) => win.startUtc && win.endUtc && win.sourceSchedulerId);
}

function pruneExpiredBusyWindows(windows, nowMs) {
  return (windows || []).filter((win) => {
    const endMs = Date.parse(win.endUtc);
    if (Number.isNaN(endMs)) return false;
    return endMs > nowMs;
  });
}

function removeSchedulerWindows(windows, schedulerId) {
  return (windows || []).filter((win) => win.sourceSchedulerId !== schedulerId);
}

function upsertSchedulerWindow(windows, entry) {
  const stripped = removeSchedulerWindows(windows, entry.sourceSchedulerId);
  return [...stripped, entry];
}

async function updateUserBusyWindows(userId, schedulerId, updater) {
  const ref = db.collection("usersPublic").doc(userId);
  const snap = await ref.get();
  const prevRaw = snap.exists ? snap.data()?.busyWindows : null;
  const prev = normalizeBusyWindows(prevRaw);
  const next = updater(prev);
  await ref.set({ busyWindows: next }, { merge: true });
}

async function reconcileForScheduler({ schedulerId, scheduler }) {
  const schedulerRef = db.collection("schedulers").doc(schedulerId);
  const votesSnap = await schedulerRef.collection("votes").get();
  const voteDocs = votesSnap.docs || [];
  const userIds = voteDocs.map((doc) => doc.id).filter(Boolean);
  if (userIds.length === 0) return;

  const nowMs = Date.now();

  if (scheduler?.status !== "FINALIZED" || !scheduler?.winningSlotId) {
    await Promise.all(
      userIds.map((userId) =>
        updateUserBusyWindows(userId, schedulerId, (prev) => {
          const pruned = pruneExpiredBusyWindows(prev, nowMs);
          return removeSchedulerWindows(pruned, schedulerId);
        }).catch((err) => {
          logger.warn("busyWindows: failed to remove window", { schedulerId, userId, err: err?.message });
        })
      )
    );
    return;
  }

  const slotId = scheduler.winningSlotId;
  const slotSnap = await schedulerRef.collection("slots").doc(slotId).get();
  if (!slotSnap.exists) return;
  const slot = slotSnap.data() || {};
  if (!slot.start || !slot.end) return;

  const priorityAtMs =
    (scheduler.finalizedSlotPriorityAtMs && scheduler.finalizedSlotPriorityAtMs[slotId]) ||
    scheduler.finalizedAtMs ||
    nowMs;

  const nextEntry = {
    startUtc: slot.start,
    endUtc: slot.end,
    sourceSchedulerId: schedulerId,
    sourceWinningSlotId: slotId,
    priorityAtMs,
  };

  await Promise.all(
    voteDocs.map((docSnap) => {
      const userId = docSnap.id;
      const vote = docSnap.data() || {};
      const attending = !vote.noTimesWork && isAttendingVote(vote.votes?.[slotId]);
      return updateUserBusyWindows(userId, schedulerId, (prev) => {
        const pruned = pruneExpiredBusyWindows(prev, nowMs);
        if (!attending) {
          return removeSchedulerWindows(pruned, schedulerId);
        }
        return upsertSchedulerWindow(pruned, nextEntry);
      }).catch((err) => {
        logger.warn("busyWindows: failed to reconcile window", { schedulerId, userId, err: err?.message });
      });
    })
  );
}

exports.syncBusyWindowsOnSchedulerWrite = onDocumentWritten(
  { document: "schedulers/{schedulerId}" },
  async (event) => {
    const schedulerId = event.params.schedulerId;
    const before = event.data?.before?.data?.() || null;
    const after = event.data?.after?.data?.() || null;

    if (!after) {
      // Scheduler deletion cleanup is handled by vote doc deletions (client deletes votes before scheduler doc).
      return;
    }

    if (
      before &&
      before.status === after.status &&
      before.winningSlotId === after.winningSlotId &&
      before.finalizedAtMs === after.finalizedAtMs &&
      JSON.stringify(before.finalizedSlotPriorityAtMs || {}) ===
        JSON.stringify(after.finalizedSlotPriorityAtMs || {})
    ) {
      return;
    }

    await reconcileForScheduler({ schedulerId, scheduler: after });
  }
);

exports.syncBusyWindowsOnVoteWrite = onDocumentWritten(
  { document: "schedulers/{schedulerId}/votes/{userId}" },
  async (event) => {
    const schedulerId = event.params.schedulerId;
    const userId = event.params.userId;
    const after = event.data?.after?.data?.() || null;

    const nowMs = Date.now();

    if (!after) {
      await updateUserBusyWindows(userId, schedulerId, (prev) => {
        const pruned = pruneExpiredBusyWindows(prev, nowMs);
        return removeSchedulerWindows(pruned, schedulerId);
      });
      return;
    }

    const schedulerSnap = await db.collection("schedulers").doc(schedulerId).get();
    if (!schedulerSnap.exists) return;
    const scheduler = schedulerSnap.data() || {};

    if (scheduler.status !== "FINALIZED" || !scheduler.winningSlotId) {
      await updateUserBusyWindows(userId, schedulerId, (prev) => {
        const pruned = pruneExpiredBusyWindows(prev, nowMs);
        return removeSchedulerWindows(pruned, schedulerId);
      });
      return;
    }

    const slotId = scheduler.winningSlotId;
    const slotSnap = await db.collection("schedulers").doc(schedulerId).collection("slots").doc(slotId).get();
    if (!slotSnap.exists) return;
    const slot = slotSnap.data() || {};
    if (!slot.start || !slot.end) return;

    const attending = !after.noTimesWork && isAttendingVote(after.votes?.[slotId]);
    await updateUserBusyWindows(userId, schedulerId, (prev) => {
      const pruned = pruneExpiredBusyWindows(prev, nowMs);
      if (!attending) {
        return removeSchedulerWindows(pruned, schedulerId);
      }
      const priorityAtMs =
        (scheduler.finalizedSlotPriorityAtMs && scheduler.finalizedSlotPriorityAtMs[slotId]) ||
        scheduler.finalizedAtMs ||
        nowMs;
      return upsertSchedulerWindow(pruned, {
        startUtc: slot.start,
        endUtc: slot.end,
        sourceSchedulerId: schedulerId,
        sourceWinningSlotId: slotId,
        priorityAtMs,
      });
    });
  }
);

