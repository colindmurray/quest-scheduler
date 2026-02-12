const crypto = require("crypto");
const { normalizeEmail } = require("../utils/email");

function buildMetadata(event = {}) {
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
}

function hashEmail(email) {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function getPendingNotificationsCollection(db, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  return db.collection("pendingNotifications").doc(hashEmail(normalizedEmail)).collection("events");
}

module.exports = {
  buildMetadata,
  hashEmail,
  getPendingNotificationsCollection,
};
