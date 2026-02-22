import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth } from "../../lib/firebase";
import { fetchSchedulersByIds } from "../../lib/data/schedulers";
import { ensureUserProfile } from "../../lib/data/users";
import { buildGoogleCalendarEventUrl } from "../../lib/google-calendar";

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
  if (!testEnv) {
    return;
  }
  await testEnv.clearFirestore();
  if (auth.currentUser) {
    await signOut(auth);
  }
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

test("scheduler fetch exposes calendarId/eventId for calendar URL construction", async () => {
  const email = "calendar-link@example.com";
  const password = "password123";
  const user = await signInTestUser(email, password);
  const schedulerId = "integration-calendar-link";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "schedulers", schedulerId), {
      title: "Calendar Link Scheduler",
      creatorId: user.uid,
      creatorEmail: email,
      status: "FINALIZED",
      participantIds: [user.uid],
      pendingInvites: [],
      allowLinkSharing: false,
      googleCalendarId: "party@example.com",
      googleEventId: "abc123def456",
      createdAt: new Date(),
    });
  });

  const schedulers = await fetchSchedulersByIds([schedulerId]);
  const scheduler = schedulers[schedulerId];

  expect(scheduler).toBeTruthy();
  expect(scheduler.googleCalendarId).toBe("party@example.com");
  expect(scheduler.googleEventId).toBe("abc123def456");

  const calendarUrl = buildGoogleCalendarEventUrl({
    calendarId: scheduler.googleCalendarId,
    eventId: scheduler.googleEventId,
  });

  const eid = new URL(calendarUrl).searchParams.get("eid");
  const decoded = Buffer.from(eid, "base64").toString("utf8");
  expect(decoded).toBe("party@example.com/abc123def456");
});

test("calendar URL stays null when scheduler has eventId but no calendarId", async () => {
  const email = "calendar-link-missing-calendar@example.com";
  const password = "password123";
  const user = await signInTestUser(email, password);
  const schedulerId = "integration-calendar-link-missing-calendar";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "schedulers", schedulerId), {
      title: "Legacy Calendar Link Scheduler",
      creatorId: user.uid,
      creatorEmail: email,
      status: "FINALIZED",
      participantIds: [user.uid],
      pendingInvites: [],
      allowLinkSharing: false,
      googleCalendarId: null,
      googleEventId: "abc123def456",
      createdAt: new Date(),
    });
  });

  const schedulers = await fetchSchedulersByIds([schedulerId]);
  const scheduler = schedulers[schedulerId];
  const calendarUrl = buildGoogleCalendarEventUrl({
    calendarId: scheduler.googleCalendarId,
    eventId: scheduler.googleEventId,
  });

  expect(calendarUrl).toBeNull();
});
