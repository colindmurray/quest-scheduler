const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { resolveNotificationEventType } = require("./constants");

const NOTIFICATION_EVENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function buildExpiresAt() {
  return Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_EVENT_TTL_MS));
}

function buildNotificationEventDocument({
  eventType,
  resource,
  actor,
  payload,
  channels,
  dedupeKey,
  recipients,
  source,
  createdBy,
}) {
  const resolvedType = resolveNotificationEventType(eventType, payload?.metadata);
  if (!resolvedType) {
    throw new Error(`Unsupported notification event type: ${eventType}`);
  }

  const base = {
    eventType: resolvedType,
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
    createdBy: createdBy || "system",
  };

  return Object.fromEntries(
    Object.entries(base).filter(([, value]) => value !== null && value !== undefined)
  );
}

async function queueNotificationEvent({
  db,
  eventType,
  resource,
  actor,
  payload,
  channels,
  dedupeKey,
  recipients,
  source,
  createdBy,
}) {
  const eventDoc = buildNotificationEventDocument({
    eventType,
    resource,
    actor,
    payload,
    channels,
    dedupeKey,
    recipients,
    source,
    createdBy,
  });

  const ref = db.collection("notificationEvents").doc();
  await ref.set(eventDoc);

  return {
    eventId: ref.id,
    eventType: eventDoc.eventType,
  };
}

module.exports = {
  queueNotificationEvent,
  buildNotificationEventDocument,
};
