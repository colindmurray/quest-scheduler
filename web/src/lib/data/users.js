import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  documentId,
} from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db } from "../firebase";
import { buildPublicIdentifier } from "../identity";
import { chunkArray, normalizeEmail } from "../utils";

function defaultDisplayName({ displayName, discordName }) {
  if (displayName) return displayName;
  if (discordName) return discordName;
  return null;
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

export const userRef = (userId) => (userId ? doc(db, "users", userId) : null);
export const usersPublicRef = (userId) =>
  userId ? doc(db, "usersPublic", userId) : null;

export async function findUserIdsByEmails(emails = []) {
  const normalized = Array.from(
    new Set((emails || []).filter(Boolean).map((email) => normalizeEmail(email)))
  );
  if (normalized.length === 0) return {};

  const results = {};
  await Promise.all(
    chunkArray(normalized, 30).map(async (chunk) => {
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

export async function fetchPublicProfilesByEmails(emails = []) {
  const normalized = Array.from(
    new Set((emails || []).filter(Boolean).map((email) => normalizeEmail(email)))
  );
  if (normalized.length === 0) return {};

  const profiles = {};
  await Promise.all(
    chunkArray(normalized, 30).map(async (chunk) => {
      const q = query(collection(db, "usersPublic"), where("email", "in", chunk));
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (data.email) {
          profiles[normalizeEmail(data.email)] = {
            email: data.email,
            displayName: data.displayName || null,
            photoURL: data.photoURL || null,
            emailNotifications: data.emailNotifications ?? null,
            publicIdentifier: data.publicIdentifier || null,
            publicIdentifierType: data.publicIdentifierType || null,
            qsUsername: data.qsUsername || null,
            discordUsername: data.discordUsername || null,
          };
        }
      });
    })
  );

  return profiles;
}

export async function fetchPublicProfilesByIds(userIds = []) {
  const normalized = Array.from(new Set((userIds || []).filter(Boolean)));
  if (normalized.length === 0) return {};

  const profiles = {};
  await Promise.all(
    chunkArray(normalized, 30).map(async (chunk) => {
      const q = query(collection(db, "usersPublic"), where(documentId(), "in", chunk));
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        profiles[docSnap.id] = {
          id: docSnap.id,
          email: data.email || null,
          displayName: data.displayName || null,
          photoURL: data.photoURL || null,
          emailNotifications: data.emailNotifications ?? null,
          publicIdentifier: data.publicIdentifier || null,
          publicIdentifierType: data.publicIdentifierType || null,
          qsUsername: data.qsUsername || null,
          discordUsername: data.discordUsername || null,
        };
      });
    })
  );

  return profiles;
}

export async function ensureUserProfile(user) {
  if (!user?.uid) return { profileReady: false };
  const email = normalizeEmail(user.email);
  const userRef = doc(db, "users", user.uid);
  const publicRef = doc(db, "usersPublic", user.uid);

  const [userSnap, publicSnap] = await Promise.all([getDoc(userRef), getDoc(publicRef)]);
  const userData = userSnap.exists() ? userSnap.data() : {};
  const publicData = publicSnap.exists() ? publicSnap.data() : {};

  const discordName =
    userData.discord?.globalName || userData.discord?.username || null;
  const displayName =
    userData.displayName ||
    publicData.displayName ||
    defaultDisplayName({ email, displayName: user.displayName, discordName });
  const photoURL = userData.photoURL || publicData.photoURL || user.photoURL || null;
  const publicIdentifierType =
    userData.publicIdentifierType || publicData.publicIdentifierType || "email";
  const publicIdentifier = buildPublicIdentifier({
    publicIdentifierType,
    qsUsername: userData.qsUsername || publicData.qsUsername || null,
    discordUsername: userData.discord?.username || publicData.discordUsername || null,
    email,
  });

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
  if (!userData.publicIdentifierType) {
    userUpdates.publicIdentifierType = publicIdentifierType;
  }
  if (Object.keys(userUpdates).length > 0) {
    userUpdates.updatedAt = serverTimestamp();
    await setDoc(userRef, userUpdates, { merge: true });
  }

  const publicUpdates = {};
  if (email && publicData.email !== email) publicUpdates.email = email;
  if (publicData.displayName !== displayName && displayName) publicUpdates.displayName = displayName;
  if (publicData.photoURL !== photoURL) publicUpdates.photoURL = photoURL;
  if (!publicHasEmailNotifications) publicUpdates.emailNotifications = emailNotifications;
  if (publicData.publicIdentifierType !== publicIdentifierType) {
    publicUpdates.publicIdentifierType = publicIdentifierType;
  }
  if (publicIdentifier && publicData.publicIdentifier !== publicIdentifier) {
    publicUpdates.publicIdentifier = publicIdentifier;
  }
  if (userData.qsUsername && publicData.qsUsername !== userData.qsUsername) {
    publicUpdates.qsUsername = userData.qsUsername;
    publicUpdates.qsUsernameLower = String(userData.qsUsername).toLowerCase();
  }
  if (discordName && publicData.discordUsername !== userData.discord?.username) {
    publicUpdates.discordUsername = userData.discord?.username || null;
    publicUpdates.discordUsernameLower = userData.discord?.username
      ? String(userData.discord.username).toLowerCase()
      : null;
  }
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
