import { normalizeEmail } from "../../../lib/utils";
import { isUserBlockedForSlot } from "../../../lib/conflict-utils";
import { isAttendingVote } from "../../../lib/vote-utils";

export function buildAttendanceSummary({
  schedulerId = null,
  status,
  winningSlotId,
  winningSlotStart = null,
  winningSlotEnd = null,
  pollPriorityAtMs = null,
  busyByUserId = null,
  voteDocs,
  participantEmailById,
}) {
  if (status !== "FINALIZED" || !winningSlotId) {
    return { confirmed: [], unavailable: [] };
  }

  const slotStartMs = winningSlotStart ? Date.parse(winningSlotStart) : null;
  const slotEndMs = winningSlotEnd ? Date.parse(winningSlotEnd) : null;

  const attendanceByEmail = new Map();
  (voteDocs || []).forEach((voteDoc) => {
    const email = normalizeEmail(voteDoc.userEmail || participantEmailById?.get(voteDoc.id));
    if (!email) return;

    let statusValue = "unavailable";
    if (!voteDoc.noTimesWork) {
      if (isAttendingVote(voteDoc.votes?.[winningSlotId])) {
        const busyProfile = busyByUserId?.[voteDoc.id] || null;
        const blocked = isUserBlockedForSlot({
          autoBlockConflicts: busyProfile?.autoBlockConflicts === true,
          busyWindows: busyProfile?.busyWindows || [],
          slotStartMs,
          slotEndMs,
          currentSchedulerId: schedulerId,
          currentStatus: "FINALIZED",
          currentPriorityAtMs: pollPriorityAtMs,
        });
        statusValue = blocked ? "unavailable" : "confirmed";
      }
    }

    const existing = attendanceByEmail.get(email);
    if (existing === "confirmed") return;
    if (statusValue === "confirmed" || !existing) {
      attendanceByEmail.set(email, statusValue);
    }
  });

  const confirmed = [];
  const unavailable = [];
  attendanceByEmail.forEach((statusValue, email) => {
    if (statusValue === "confirmed") {
      confirmed.push(email);
    } else {
      unavailable.push(email);
    }
  });

  return { confirmed, unavailable };
}
