import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { normalizeEmail } from "../utils";

export function encodeEmailId(email) {
  return encodeURIComponent(normalizeEmail(email));
}

export async function fetchBannedEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const ref = doc(db, "bannedEmails", encodeEmailId(normalized));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const reason = snap.data()?.reason || "suspended";
  return { email: normalized, reason };
}
