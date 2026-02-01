import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export function userSettingsRef(userId) {
  if (!userId) return null;
  return doc(db, "users", userId);
}

export function userPublicRef(userId) {
  if (!userId) return null;
  return doc(db, "usersPublic", userId);
}

export async function fetchUserSettings(userId) {
  const ref = userSettingsRef(userId);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() || null;
}

export async function updateUserSettings(userId, updates) {
  if (!userId) return;
  const ref = userSettingsRef(userId);
  if (!ref) return;
  await setDoc(
    ref,
    {
      ...updates,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function addArchivedPoll(userId, pollId, archivedPolls = []) {
  if (!userId || !pollId) return;
  if (archivedPolls.includes(pollId)) return;
  return updateUserSettings(userId, { archivedPolls: [...archivedPolls, pollId] });
}

export async function removeArchivedPoll(userId, pollId, archivedPolls = []) {
  if (!userId || !pollId) return;
  if (!archivedPolls.includes(pollId)) return;
  return updateUserSettings(userId, {
    archivedPolls: archivedPolls.filter((id) => id !== pollId),
  });
}

export async function setCalendarSyncPreference(userId, preference) {
  if (!userId) return;
  return updateUserSettings(userId, { calendarSyncPreference: preference });
}

export async function setGroupColor(userId, groupColors, groupId, color) {
  if (!userId || !groupId) return;
  return updateUserSettings(userId, {
    groupColors: {
      ...(groupColors || {}),
      [groupId]: color,
    },
  });
}

export async function saveUserSettings(userId, userData, publicData) {
  const userRef = userSettingsRef(userId);
  const publicRef = userPublicRef(userId);
  if (!userRef || !publicRef) return;

  await setDoc(
    userRef,
    {
      ...userData,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    publicRef,
    {
      ...publicData,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
