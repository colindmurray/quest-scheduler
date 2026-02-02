import { normalizeEmail } from "../../../lib/utils";

export const buildAttendanceSetFromVoters = (voters) => {
  const attendanceSet = new Set();
  const feasibleVoters = voters?.feasible || [];
  feasibleVoters.forEach((voter) => {
    const normalized = normalizeEmail(voter?.email);
    if (normalized) {
      attendanceSet.add(normalized);
    }
  });
  return attendanceSet;
};

export const filterSlotsByRequiredAttendance = ({
  slots = [],
  slotVotersById = {},
  requiredEmails = [],
}) => {
  const normalizedRequired = (requiredEmails || [])
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  if (normalizedRequired.length === 0) {
    return slots;
  }

  return slots.filter((slot) => {
    const voters = slotVotersById?.[slot.id];
    if (!voters) return false;
    const attendanceSet = buildAttendanceSetFromVoters(voters);
    return normalizedRequired.every((email) => attendanceSet.has(email));
  });
};
