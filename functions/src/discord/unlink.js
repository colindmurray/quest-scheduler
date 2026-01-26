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
  const userRef = admin.firestore().collection("users").doc(uid);
  const userSnap = await userRef.get();
  const discordUserId = userSnap.exists ? userSnap.data()?.discord?.userId : null;

  const batch = admin.firestore().batch();
  batch.set(
    userRef,
    {
      discord: admin.firestore.FieldValue.delete(),
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
