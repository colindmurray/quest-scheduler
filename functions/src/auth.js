const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const DEFAULT_APP_URL = "https://questscheduler.cc";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

exports.sendPasswordResetInfo = functions.https.onCall(async (data) => {
  const email = normalizeEmail(data?.email);
  if (!email) {
    throw new functions.https.HttpsError("invalid-argument", "Email is required");
  }

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const hasPassword = userRecord.providerData.some(
      (provider) => provider.providerId === "password"
    );

    if (!hasPassword) {
      const appUrl = process.env.QS_APP_URL || DEFAULT_APP_URL;
      await admin.firestore().collection("mail").add({
        to: email,
        message: {
          subject: "Password Reset Request - Quest Scheduler",
          text: `You requested a password reset, but your account uses Google sign-in.\n\nTo log in, visit ${appUrl}/auth and click "Continue with Google".\n\nIf you didn't request this, you can safely ignore this email.`,
          html: `<p>You requested a password reset, but your account uses Google sign-in.</p><p>To log in, visit <a href="${appUrl}/auth">Quest Scheduler</a> and click "Continue with Google".</p><p>If you didn't request this, you can safely ignore this email.</p>`,
        },
      });
    }
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      console.error("sendPasswordResetInfo error:", error);
    }
  }

  return { success: true };
});

exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
  const email = user.email ? normalizeEmail(user.email) : null;
  const displayName = user.displayName || email || "User";
  const photoURL = user.photoURL || null;
  const now = admin.firestore.FieldValue.serverTimestamp();

  const userRef = admin.firestore().collection("users").doc(user.uid);
  const publicRef = admin.firestore().collection("usersPublic").doc(user.uid);

  await Promise.all([
    userRef.set(
      {
        ...(email ? { email } : {}),
        displayName,
        photoURL,
        settings: {
          emailNotifications: true,
        },
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    ),
    publicRef.set(
      {
        ...(email ? { email } : {}),
        displayName,
        photoURL,
        emailNotifications: true,
        updatedAt: now,
      },
      { merge: true }
    ),
  ]);
});
