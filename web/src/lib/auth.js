import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  linkWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signOut,
  reauthenticateWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";
import { APP_URL } from "./config";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "consent",
  access_type: "offline",
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function defaultDisplayNameFromEmail(email) {
  return email || "User";
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    sessionStorage.setItem("googleAccessToken", credential.accessToken);
  }
  return result.user;
}

export async function signInWithGoogleIdToken(idToken) {
  if (!idToken) {
    throw new Error("Missing Google ID token.");
  }
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export async function registerWithEmailPassword(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const result = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  if (result?.user) {
    const fallbackName = defaultDisplayNameFromEmail(normalizedEmail);
    if (!result.user.displayName && fallbackName) {
      try {
        await updateProfile(result.user, { displayName: fallbackName });
      } catch (err) {
        console.warn("Failed to set display name:", err);
      }
    }
    try {
      await sendEmailVerification(result.user, { url: `${APP_URL}/dashboard` });
    } catch (err) {
      console.warn("Failed to send verification email:", err);
    }
  }
  return result.user;
}

export async function signInWithEmailPassword(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  return result.user;
}

export async function resendVerificationEmail() {
  if (!auth.currentUser) return;
  await sendEmailVerification(auth.currentUser, { url: `${APP_URL}/dashboard` });
}

export async function linkGoogleAccount() {
  if (!auth.currentUser) {
    throw new Error("You must be signed in to link accounts.");
  }
  const result = await linkWithPopup(auth.currentUser, provider);
  return result.user;
}

export async function resetPassword(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
  if (methods.includes("password")) {
    await sendPasswordResetEmail(auth, normalizedEmail, { url: `${APP_URL}/auth` });
    return;
  }
  if (methods.length > 0) {
    const { getFunctions, httpsCallable } = await import("firebase/functions");
    const functions = getFunctions();
    const sendPasswordResetInfo = httpsCallable(functions, "sendPasswordResetInfo");
    await sendPasswordResetInfo({ email: normalizedEmail }).catch(() => {});
  }
}

export function signOutUser() {
  return signOut(auth);
}

export function getStoredAccessToken() {
  return sessionStorage.getItem("googleAccessToken");
}

export async function getGoogleAccessToken({ forceRefresh = false } = {}) {
  const cached = getStoredAccessToken();
  if (cached && !forceRefresh) return cached;
  let result;
  if (auth.currentUser) {
    result = await reauthenticateWithPopup(auth.currentUser, provider);
  } else {
    result = await signInWithPopup(auth, provider);
  }
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    sessionStorage.setItem("googleAccessToken", credential.accessToken);
    return credential.accessToken;
  }
  return null;
}
