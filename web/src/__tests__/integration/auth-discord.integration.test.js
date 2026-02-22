import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { signInWithDiscordToken } from "../../lib/auth";
import { ensureUserProfile } from "../../lib/data/users";
import { startDiscordLogin, startDiscordOAuth } from "../../lib/data/discord";

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

test("discord login start sanitizes returnTo and persists oauth state", async () => {
  const authUrl = await startDiscordLogin("https://evil.example/steal-session");
  const parsed = new URL(authUrl);
  const stateId = parsed.searchParams.get("state");

  expect(parsed.hostname).toBe("discord.com");
  expect(parsed.pathname).toBe("/api/oauth2/authorize");
  expect(parsed.searchParams.get("scope")).toBe("identify email");
  expect(stateId).toBeTruthy();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const stateSnap = await getDoc(doc(context.firestore(), "oauthStates", stateId));
    expect(stateSnap.exists()).toBe(true);
    const data = stateSnap.data() || {};
    expect(data.provider).toBe("discord");
    expect(data.intent).toBe("login");
    expect(data.returnTo).toBe("/dashboard");
  });
});

test("discord link start requires an authenticated user", async () => {
  await expect(startDiscordOAuth()).rejects.toMatchObject({
    code: "functions/unauthenticated",
  });
});

test("discord token sign-in rejects invalid custom tokens", async () => {
  await expect(signInWithDiscordToken("not-a-valid-token")).rejects.toMatchObject({
    code: "auth/invalid-custom-token",
  });
});

test("linked-account profile synchronization preserves discord identity fields", async () => {
  const email = uniqueEmail("discord-linked");
  const password = "password123";
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "users", user.uid),
      {
        email: email.toLowerCase(),
        discord: {
          userId: "discord-user-linked",
          username: "linkedhero",
          globalName: "Linked Hero",
        },
        publicIdentifierType: "discordUsername",
        updatedAt: new Date(),
      },
      { merge: true }
    );
  });

  await ensureUserProfile(user);

  const userSnap = await getDoc(doc(db, "users", user.uid));
  const publicSnap = await getDoc(doc(db, "usersPublic", user.uid));

  expect(userSnap.exists()).toBe(true);
  expect(userSnap.data().discord?.username).toBe("linkedhero");
  expect(userSnap.data().publicIdentifierType).toBe("discordUsername");

  expect(publicSnap.exists()).toBe(true);
  expect(publicSnap.data().discordUsername).toBe("linkedhero");
  expect(publicSnap.data().publicIdentifierType).toBe("discordUsername");
});
