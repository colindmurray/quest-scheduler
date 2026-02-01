import { normalizeEmail } from "../../../lib/utils";

export function validateInviteCandidate({
  email,
  selfEmail,
  groupMemberSet,
  existingInvites = [],
  pendingInvites = [],
}) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { ok: false, error: "Enter a valid email or Discord username." };
  }
  if (selfEmail && normalized === normalizeEmail(selfEmail)) {
    return { ok: false, error: "You are already included as a participant." };
  }
  if (groupMemberSet?.has(normalized)) {
    return { ok: false, error: "That email is already included via the questing group." };
  }
  if (existingInvites.includes(normalized) || pendingInvites.includes(normalized)) {
    return { ok: false, error: "That email is already invited." };
  }
  return { ok: true, normalized };
}
