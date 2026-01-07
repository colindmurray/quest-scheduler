import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "./firebase";

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/calendar.events");
provider.addScope("https://www.googleapis.com/auth/calendar.readonly");
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
