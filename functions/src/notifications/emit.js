const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { resolveNotificationEventType } = require("./constants");
const { queueNotificationEvent } = require("./write-event");

if (!admin.apps.length) {
  admin.initializeApp();
}

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
  const queued = await queueNotificationEvent({
    db,
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
  return queued;
};

const emitNotificationEvent = functions.https.onCall(emitNotificationEventHandler);

module.exports = {
  emitNotificationEvent,
  emitNotificationEventHandler,
};
