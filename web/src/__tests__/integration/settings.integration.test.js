import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { ensureUserProfile } from "../../lib/data/users";
import { saveUserSettings } from "../../lib/data/settings";

const projectId = "studio-473406021-87ead";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");
const firestoreRules = readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");

let testEnv;

async function signInTestUser(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(result.user);
  return result.user;
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

test("saveUserSettings mirrors autoBlockConflicts into usersPublic", async () => {
  const email = "settings@example.com";
  const password = "password123";
  const user = await signInTestUser(email, password);

  await saveUserSettings(
    user.uid,
    {
      email,
      settings: { autoBlockConflicts: true },
    },
    {
      email,
      autoBlockConflicts: true,
    }
  );

  const userSnap = await getDoc(doc(db, "users", user.uid));
  expect(userSnap.exists()).toBe(true);
  expect(userSnap.data().settings?.autoBlockConflicts).toBe(true);

  const publicSnap = await getDoc(doc(db, "usersPublic", user.uid));
  expect(publicSnap.exists()).toBe(true);
  expect(publicSnap.data().autoBlockConflicts).toBe(true);
});

