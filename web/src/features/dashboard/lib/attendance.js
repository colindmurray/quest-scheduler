export function buildAttendanceSummary({
  status,
  winningSlotId,
  voteDocs,
  participantEmailById,
}) {
  if (status !== "FINALIZED" || !winningSlotId) {
    return { confirmed: [], unavailable: [] };
  }

  const attendanceByEmail = new Map();
  const normalizeVoteValue = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value.toUpperCase();
    if (value === true) return "FEASIBLE";
    if (typeof value === "object") {
      if (value.preferred) return "PREFERRED";
      if (value.feasible) return "FEASIBLE";
    }
    return null;
  };

  (voteDocs || []).forEach((voteDoc) => {
    const email =
      voteDoc.userEmail?.toLowerCase() || participantEmailById?.get(voteDoc.id);
    if (!email) return;

    let statusValue = "unavailable";
    if (!voteDoc.noTimesWork) {
      const voteValue = normalizeVoteValue(voteDoc.votes?.[winningSlotId]);
      if (voteValue === "PREFERRED" || voteValue === "FEASIBLE") {
        statusValue = "confirmed";
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
