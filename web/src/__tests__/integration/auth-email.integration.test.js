import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import {
  registerWithEmailPassword,
  resetPassword,
  signInWithEmailPassword,
} from "../../lib/auth";
import { ensureUserProfile } from "../../lib/data/users";

const projectId = "studio-473406021-87ead";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");
const firestoreRules = readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");

let testEnv;

function uniqueEmail(prefix) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  return `${prefix}-${stamp}@example.com`;
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  if (auth.currentUser) {
    await signOut(auth);
  }
});

afterAll(async () => {
  await testEnv.cleanup();
});

test("email/password registration creates profile docs and allows normalized login", async () => {
  const email = uniqueEmail("auth-email-flow");
  const password = "password123";

  const user = await registerWithEmailPassword(email.toUpperCase(), password);
  await ensureUserProfile(user);

  const userSnap = await getDoc(doc(db, "users", user.uid));
  const publicSnap = await getDoc(doc(db, "usersPublic", user.uid));

  expect(userSnap.exists()).toBe(true);
  expect(userSnap.data().email).toBe(email.toLowerCase());
  expect(publicSnap.exists()).toBe(true);
  expect(publicSnap.data().email).toBe(email.toLowerCase());

  await signOut(auth);
  const loggedInUser = await signInWithEmailPassword(email.toUpperCase(), password);
  expect(loggedInUser.uid).toBe(user.uid);
});

test("email/password registration rejects weak passwords", async () => {
  const email = uniqueEmail("auth-weak-password");

  await expect(registerWithEmailPassword(email, "123")).rejects.toMatchObject({
    code: "auth/weak-password",
  });
});

test("email/password registration prevents duplicate accounts", async () => {
  const email = uniqueEmail("auth-duplicate");
  const password = "password123";

  await registerWithEmailPassword(email, password);
  await signOut(auth);

  await expect(registerWithEmailPassword(email.toUpperCase(), password)).rejects.toMatchObject({
    code: "auth/email-already-in-use",
  });
});

test("firestore rules allow own profile writes and reject writes to other users", async () => {
  const email = uniqueEmail("auth-rules-owner");
  const password = "password123";
  const owner = await createUserWithEmailAndPassword(auth, email, password);

  await setDoc(
    doc(db, "users", owner.user.uid),
    {
      displayName: "Rules Owner",
      settings: {
        emailNotifications: true,
        notificationMode: "simple",
      },
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "usersPublic", owner.user.uid),
    {
      displayName: "Rules Owner",
      emailNotifications: true,
    },
    { merge: true }
  );

  await expect(
    setDoc(
      doc(db, "users", "different-user-id"),
      {
        displayName: "Should Fail",
      },
      { merge: true }
    )
  ).rejects.toMatchObject({ code: "permission-denied" });

  await expect(
    setDoc(
      doc(db, "usersPublic", "different-user-id"),
      {
        displayName: "Should Fail",
      },
      { merge: true }
    )
  ).rejects.toMatchObject({ code: "permission-denied" });
});

test("password reset flow resolves for existing and unknown emails", async () => {
  const email = uniqueEmail("auth-reset");
  const password = "password123";
  await registerWithEmailPassword(email, password);

  await expect(resetPassword(email)).resolves.toBeUndefined();
  await expect(resetPassword("missing-user@example.com")).resolves.toBeUndefined();
});
