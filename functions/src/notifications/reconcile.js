const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { FieldValue } = require("firebase-admin/firestore");
const { normalizeEmail } = require("../utils/email");
const { resolveNotificationEventType } = require("./constants");
const { getInAppTemplate } = require("./templates");

if (!admin.apps.length) {
  admin.initializeApp();
}

const hashEmail = (email) =>
  crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");

const buildMetadata = (event) => {
  const metadata = { ...(event.payload?.metadata || {}) };

  if (event.resource?.type === "poll") {
    metadata.schedulerId = metadata.schedulerId || event.resource.id;
    metadata.schedulerTitle = metadata.schedulerTitle || event.resource.title;
  }

  if (event.resource?.type === "group") {
    metadata.groupId = metadata.groupId || event.resource.id;
    metadata.groupName = metadata.groupName || event.resource.title;
  }

  if (event.actor?.uid) {
    metadata.actorUserId = metadata.actorUserId || event.actor.uid;
  }

  if (event.actor?.email) {
    metadata.actorEmail = metadata.actorEmail || event.actor.email;
  }

  return metadata;
};

const reconcilePendingNotificationsForUser = async (email, userId) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { processed: 0 };

  const emailHash = hashEmail(normalizedEmail);
  const pendingRef = admin
    .firestore()
    .collection("pendingNotifications")
    .doc(emailHash)
    .collection("events");

  const snapshot = await pendingRef.get();
  if (snapshot.empty) return { processed: 0 };

  const notificationWrites = [];
  const deleteRefs = [];

  snapshot.docs.forEach((docSnap) => {
    const eventData = docSnap.data() || {};
    const resolvedType = resolveNotificationEventType(
      eventData.eventType,
      eventData.payload?.metadata || eventData.metadata
    );

    if (!resolvedType) {
      return;
    }

    const template = getInAppTemplate(resolvedType);
    if (!template) {
      return;
    }

    const base = template(eventData);
    const metadata = buildMetadata(eventData);

    const notificationRef = admin
      .firestore()
      .collection("users")
      .doc(userId)
      .collection("notifications")
      .doc();

    notificationWrites.push(
      notificationRef.set({
        type: resolvedType,
        title: base.title,
        body: base.body,
        actionUrl: base.actionUrl,
        resource: eventData.resource || null,
        actor: eventData.actor || null,
        metadata,
        dedupeKey: eventData.dedupeKey || null,
        read: false,
        dismissed: false,
        createdAt: FieldValue.serverTimestamp(),
      })
    );

    deleteRefs.push(docSnap.ref);
  });

  await Promise.all(notificationWrites);

  if (deleteRefs.length > 0) {
    const batch = admin.firestore().batch();
    deleteRefs.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  return { processed: deleteRefs.length };
};

exports.reconcilePendingNotifications = functions.https.onCall(async (_, context) => {
  if (!context?.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const email = context.auth.token.email;
  if (!email) {
    throw new functions.https.HttpsError("failed-precondition", "User email not available");
  }

  return reconcilePendingNotificationsForUser(email, context.auth.uid);
});

exports.reconcilePendingNotificationsForUser = reconcilePendingNotificationsForUser;
exports.hashEmail = hashEmail;
