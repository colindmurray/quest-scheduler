const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { resolveNotificationEventType } = require("./constants");

if (!admin.apps.length) {
  admin.initializeApp();
}

const NOTIFICATION_EVENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const buildExpiresAt = () =>
  admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_EVENT_TTL_MS));

const buildEventPayload = ({
  eventType,
  resource,
  actor,
  payload,
  channels,
  dedupeKey,
  recipients,
  source,
  createdBy,
}) => {
  const base = {
    eventType,
    resource,
    actor,
    payload: payload || null,
    channels: channels || null,
    dedupeKey: dedupeKey || null,
    recipients: recipients || null,
    source: source || "web",
    status: "queued",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: buildExpiresAt(),
    createdBy,
  };

  return Object.fromEntries(
    Object.entries(base).filter(([, value]) => value !== null && value !== undefined)
  );
};

const emitNotificationEventHandler = async (data, context) => {
  if (!context?.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const eventTypeInput = data?.eventType;
  const resolvedEventType = resolveNotificationEventType(
    eventTypeInput,
    data?.metadata || data?.payload?.metadata
  );

  if (!resolvedEventType) {
    throw new functions.https.HttpsError("invalid-argument", "Unsupported eventType");
  }

  const actor = data?.actor;
  if (!actor?.uid) {
    throw new functions.https.HttpsError("invalid-argument", "Missing actor uid");
  }

  if (actor.uid !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Actor mismatch");
  }

  const resource = data?.resource;
  if (!resource?.type || !resource?.id) {
    throw new functions.https.HttpsError("invalid-argument", "Missing resource" );
  }

  const db = admin.firestore();
  const docRef = db.collection("notificationEvents").doc();
  const eventPayload = buildEventPayload({
    eventType: resolvedEventType,
    resource,
    actor,
    payload: data?.payload,
    channels: data?.channels,
    dedupeKey: data?.dedupeKey,
    recipients: data?.recipients,
    source: data?.source,
    createdBy: context.auth.uid,
  });

  await docRef.set(eventPayload);

  return { eventId: docRef.id, eventType: resolvedEventType };
};

const emitNotificationEvent = functions.https.onCall(emitNotificationEventHandler);

module.exports = {
  emitNotificationEvent,
  emitNotificationEventHandler,
};
