const admin = require("firebase-admin");

const projectId =
  process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "studio-473406021-87ead";
const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

process.env.FIRESTORE_EMULATOR_HOST = firestoreEmulatorHost;
process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();
const auth = admin.auth();

async function ensurePasswordUser({ uid, email, password, displayName }) {
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, {
      email,
      password,
      displayName,
      emailVerified: true,
    });
  } catch (err) {
    if (err?.code !== "auth/user-not-found") throw err;
    await auth.createUser({
      uid,
      email,
      password,
      displayName,
      emailVerified: true,
    });
  }
}

async function ensureEmailOnlyUser({ uid, email, displayName }) {
  try {
    await auth.getUser(uid);
    await auth.deleteUser(uid);
  } catch (err) {
    if (err?.code !== "auth/user-not-found") throw err;
  }

  await auth.createUser({
    uid,
    email,
    displayName,
    emailVerified: true,
  });
}

async function seed() {
  const owner = {
    uid: process.env.E2E_USER_UID || "test-owner",
    email: process.env.E2E_USER_EMAIL || "owner@example.com",
    password: process.env.E2E_USER_PASSWORD || "password",
    displayName: "Owner",
  };

  const discordOnly = {
    uid: process.env.E2E_DISCORD_ONLY_UID || "test-discord-only",
    email: process.env.E2E_DISCORD_ONLY_EMAIL || "discord-only@example.com",
    displayName: "Discord Only",
    discordUserId:
      process.env.E2E_DISCORD_ONLY_DISCORD_USER_ID || "e2e-discord-only-user",
    discordUsername: process.env.E2E_DISCORD_ONLY_USERNAME || "discord_only_user",
  };

  await ensurePasswordUser(owner);
  await ensureEmailOnlyUser(discordOnly);

  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
  const notificationPreferences = {
    POLL_CREATED: "inApp",
    POLL_INVITE_SENT: "inApp",
    POLL_FINALIZED: "inApp",
    FRIEND_REQUEST_SENT: "inApp",
  };

  await Promise.all([
    db.doc(`users/${owner.uid}`).set(
      {
        email: owner.email.toLowerCase(),
        displayName: owner.displayName,
        publicIdentifierType: "email",
        settings: {
          notificationMode: "advanced",
          notificationPreferences,
          emailNotifications: true,
          autoBlockConflicts: false,
        },
        updatedAt: serverTimestamp,
      },
      { merge: true }
    ),
    db.doc(`usersPublic/${owner.uid}`).set(
      {
        email: owner.email.toLowerCase(),
        displayName: owner.displayName,
        publicIdentifierType: "email",
        publicIdentifier: owner.email.toLowerCase(),
        emailNotifications: true,
        updatedAt: serverTimestamp,
      },
      { merge: true }
    ),
    db.doc(`users/${discordOnly.uid}`).set(
      {
        email: discordOnly.email.toLowerCase(),
        displayName: discordOnly.displayName,
        discord: {
          userId: discordOnly.discordUserId,
          username: discordOnly.discordUsername,
          globalName: discordOnly.displayName,
          linkSource: "oauth",
        },
        publicIdentifierType: "discordUsername",
        settings: {
          notificationMode: "advanced",
          notificationPreferences,
          emailNotifications: true,
          autoBlockConflicts: false,
        },
        updatedAt: serverTimestamp,
      },
      { merge: true }
    ),
    db.doc(`usersPublic/${discordOnly.uid}`).set(
      {
        email: discordOnly.email.toLowerCase(),
        displayName: discordOnly.displayName,
        discordUsername: discordOnly.discordUsername,
        discordUsernameLower: discordOnly.discordUsername.toLowerCase(),
        publicIdentifierType: "discordUsername",
        publicIdentifier: discordOnly.discordUsername,
        emailNotifications: true,
        updatedAt: serverTimestamp,
      },
      { merge: true }
    ),
    db.doc(`discordUserLinks/${discordOnly.discordUserId}`).set(
      {
        qsUserId: discordOnly.uid,
        linkedAt: serverTimestamp,
      },
      { merge: true }
    ),
  ]);

  console.log("Seeded E2E auth users.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to seed E2E auth users:", error);
    process.exit(1);
  });
