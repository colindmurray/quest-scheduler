import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  reauthenticateWithPopup,
} from "firebase/auth";
import { auth } from "./firebase";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "consent",
  access_type: "offline",
});

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    sessionStorage.setItem("googleAccessToken", credential.accessToken);
  }
  return result.user;
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
