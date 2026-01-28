import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db } from "../firebase";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function defaultDisplayName({ email, displayName }) {
  if (displayName) return displayName;
  if (email) return email;
  return "User";
}

export async function findUserIdByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const q = query(
    collection(db, "usersPublic"),
    where("email", "==", normalized)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0]?.id || null;
}

export async function findUserIdsByEmails(emails = []) {
  const normalized = Array.from(
    new Set((emails || []).filter(Boolean).map((email) => normalizeEmail(email)))
  );
  if (normalized.length === 0) return {};

  const results = {};
  const chunks = [];
  for (let i = 0; i < normalized.length; i += 30) {
    chunks.push(normalized.slice(i, i + 30));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const q = query(collection(db, "usersPublic"), where("email", "in", chunk));
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data?.email) {
          results[normalizeEmail(data.email)] = doc.id;
        }
      });
    })
  );

  return results;
}

export async function ensureUserProfile(user) {
  if (!user?.uid) return { profileReady: false };
  const email = normalizeEmail(user.email);
  const userRef = doc(db, "users", user.uid);
  const publicRef = doc(db, "usersPublic", user.uid);

  const [userSnap, publicSnap] = await Promise.all([getDoc(userRef), getDoc(publicRef)]);
  const userData = userSnap.exists() ? userSnap.data() : {};
  const publicData = publicSnap.exists() ? publicSnap.data() : {};

  const displayName =
    userData.displayName ||
    publicData.displayName ||
    defaultDisplayName({ email, displayName: user.displayName });
  const photoURL = userData.photoURL || publicData.photoURL || user.photoURL || null;

  const userHasEmailNotifications =
    userData.settings && Object.prototype.hasOwnProperty.call(userData.settings, "emailNotifications");
  const publicHasEmailNotifications =
    Object.prototype.hasOwnProperty.call(publicData, "emailNotifications");

  const emailNotifications = userHasEmailNotifications
    ? userData.settings.emailNotifications
    : publicHasEmailNotifications
      ? publicData.emailNotifications
      : true;

  const userUpdates = {};
  if (email && userData.email !== email) userUpdates.email = email;
  if (!userData.displayName && displayName) userUpdates.displayName = displayName;
  if (!userData.photoURL && photoURL) userUpdates.photoURL = photoURL;
  if (!userHasEmailNotifications) {
    userUpdates.settings = { emailNotifications };
  }
  if (!userSnap.exists()) userUpdates.createdAt = serverTimestamp();
  if (Object.keys(userUpdates).length > 0) {
    userUpdates.updatedAt = serverTimestamp();
    await setDoc(userRef, userUpdates, { merge: true });
  }

  const publicUpdates = {};
  if (email && publicData.email !== email) publicUpdates.email = email;
  if (publicData.displayName !== displayName && displayName) publicUpdates.displayName = displayName;
  if (publicData.photoURL !== photoURL) publicUpdates.photoURL = photoURL;
  if (!publicHasEmailNotifications) publicUpdates.emailNotifications = emailNotifications;
  if (Object.keys(publicUpdates).length > 0) {
    publicUpdates.updatedAt = serverTimestamp();
    await setDoc(publicRef, publicUpdates, { merge: true });
  }

  if (displayName && user.displayName !== displayName) {
    try {
      await updateProfile(user, { displayName });
    } catch (err) {
      console.warn("Failed to sync auth display name:", err);
    }
  }

  return { profileReady: true };
}
