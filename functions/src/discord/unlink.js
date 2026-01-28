const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { DISCORD_REGION } = require("./config");

if (!admin.apps.length) {
  admin.initializeApp();
}

exports.discordUnlink = onCall({ region: DISCORD_REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const uid = request.auth.uid;
  let hasOtherProvider = false;
  try {
    const authRecord = await admin.auth().getUser(uid);
    hasOtherProvider = authRecord.providerData.some((provider) =>
      provider.providerId === "google.com" || provider.providerId === "password"
    );
  } catch (err) {
    console.warn("Failed to load auth providers for unlink:", err);
  }

  if (!hasOtherProvider) {
    throw new HttpsError(
      "failed-precondition",
      "Cannot unlink Discord without another login method. Link Google or add a password first."
    );
  }

  const userRef = admin.firestore().collection("users").doc(uid);
  const publicRef = admin.firestore().collection("usersPublic").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const discordUserId = userData?.discord?.userId || null;
  const qsUsername = userData?.qsUsername || null;
  const email = userData?.email || null;
  const publicIdentifierType = userData?.publicIdentifierType || null;
  const shouldResetPublicIdentifier = publicIdentifierType === "discordUsername";
  let nextPublicIdentifierType = null;
  let nextPublicIdentifier = null;

  if (shouldResetPublicIdentifier) {
    if (qsUsername) {
      nextPublicIdentifierType = "qsUsername";
      nextPublicIdentifier = `@${qsUsername}`;
    } else if (email) {
      nextPublicIdentifierType = "email";
      nextPublicIdentifier = email;
    }
  }

  const batch = admin.firestore().batch();
  batch.set(
    userRef,
    {
      discord: admin.firestore.FieldValue.delete(),
      ...(shouldResetPublicIdentifier
        ? {
            publicIdentifierType: nextPublicIdentifierType,
          }
        : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(
    publicRef,
    {
      discordUsername: admin.firestore.FieldValue.delete(),
      discordUsernameLower: admin.firestore.FieldValue.delete(),
      ...(shouldResetPublicIdentifier
        ? {
            publicIdentifierType: nextPublicIdentifierType,
            publicIdentifier: nextPublicIdentifier,
          }
        : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (discordUserId) {
    batch.delete(admin.firestore().collection("discordUserLinks").doc(String(discordUserId)));
  }

  batch.set(
    admin.firestore().collection("userSecrets").doc(uid),
    {
      discord: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );

  await batch.commit();

  return { unlinked: true };
});
