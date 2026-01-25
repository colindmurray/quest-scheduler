const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { DISCORD_REGION } = require("./config");
const { generateLinkCode, hashLinkCode } = require("./link-utils");

if (!admin.apps.length) {
  admin.initializeApp();
}

exports.discordGenerateLinkCode = onCall({ region: DISCORD_REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }
  const { groupId } = request.data || {};
  if (!groupId) {
    throw new HttpsError("invalid-argument", "Missing groupId");
  }

  const groupSnap = await admin.firestore().collection("questingGroups").doc(groupId).get();
  if (!groupSnap.exists) {
    throw new HttpsError("not-found", "Questing group not found");
  }

  const groupData = groupSnap.data() || {};
  const email = String(request.auth.token.email || "").toLowerCase();
  const isCreator = groupData.creatorId === request.auth.uid;
  const isManager = groupData.memberManaged === true && (groupData.members || []).includes(email);

  if (!isCreator && !isManager) {
    throw new HttpsError("permission-denied", "You do not have permission to link this group.");
  }

  const code = generateLinkCode();
  const codeHash = hashLinkCode(code);
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));

  await admin.firestore().collection("discordLinkCodes").doc(codeHash).set({
    codeHash,
    type: "group-link",
    uid: request.auth.uid,
    groupId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
    attempts: 0,
  });

  return {
    code,
    expiresAt: expiresAt.toDate().toISOString(),
  };
});
