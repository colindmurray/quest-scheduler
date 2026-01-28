const admin = require("firebase-admin");

const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "studio-473406021-87ead";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

async function seed() {
  const schedulerId = process.env.E2E_SCHEDULER_ID || "e2e-scheduler";
  const participantId = process.env.E2E_USER_UID || "test-owner";
  const participantEmail = process.env.E2E_USER_EMAIL || "owner@example.com";
  const participantPassword = process.env.E2E_USER_PASSWORD || "password";

  const auth = admin.auth();
  try {
    await auth.getUser(participantId);
    await auth.updateUser(participantId, {
      email: participantEmail,
      password: participantPassword,
      emailVerified: true,
    });
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      await auth.createUser({
        uid: participantId,
        email: participantEmail,
        password: participantPassword,
        emailVerified: true,
      });
    } else {
      throw err;
    }
  }

  const now = new Date();
  const slotStart = new Date(now.getTime() + 60 * 60 * 1000);
  const slotEnd = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000);
  const slotStartTwo = new Date(slotStart.getTime() + 24 * 60 * 60 * 1000);
  const slotEndTwo = new Date(slotStartTwo.getTime() + 2 * 60 * 60 * 1000);

  await db.doc(`schedulers/${schedulerId}`).set({
    title: "E2E Scheduler Poll",
    creatorId: participantId,
    creatorEmail: participantEmail,
    status: "OPEN",
    participantIds: [participantId],
    pendingInvites: [],
    allowLinkSharing: false,
    timezone: "UTC",
    timezoneMode: "utc",
    winningSlotId: null,
    googleEventId: null,
    questingGroupId: null,
    questingGroupName: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.doc(`schedulers/${schedulerId}/slots/slot-1`).set({
    start: slotStart.toISOString(),
    end: slotEnd.toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });

  await db.doc(`schedulers/${schedulerId}/slots/slot-2`).set({
    start: slotStartTwo.toISOString(),
    end: slotEndTwo.toISOString(),
    stats: { feasible: 0, preferred: 0 },
  });

  console.log(`Seeded scheduler ${schedulerId} for ${participantEmail}`);
}

seed().catch((err) => {
  console.error("Failed to seed e2e scheduler:", err);
  process.exitCode = 1;
});
