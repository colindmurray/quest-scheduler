const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { FieldValue } = require("firebase-admin/firestore");
const { normalizeEmail } = require("../utils/email");
const { resolveNotificationEventType } = require("./constants");
const { getInAppTemplate, getEmailTemplate } = require("./templates");
const { applyAutoClear } = require("./auto-clear");
const { sendDiscordNotification } = require("./discord");
const {
  getDefaultPreference,
  preferenceToChannels,
  resolveNotificationPreference,
} = require("./preferences");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

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

const resolveRecipients = (event) => {
  const recipients = event.recipients || {};
  const userIds = Array.isArray(recipients.userIds)
    ? recipients.userIds
    : Array.isArray(recipients)
      ? recipients
      : Array.isArray(event.recipientUserIds)
        ? event.recipientUserIds
        : [];
  const emails = Array.isArray(recipients.emails)
    ? recipients.emails
    : Array.isArray(event.recipientEmails)
      ? event.recipientEmails
      : [];
  if (event.payload?.recipientEmail) emails.push(event.payload.recipientEmail);
  if (event.payload?.inviteeEmail) emails.push(event.payload.inviteeEmail);

  const pendingEmails = Array.isArray(recipients.pendingEmails)
    ? recipients.pendingEmails
    : Array.isArray(event.pendingEmails)
      ? event.pendingEmails
      : [];

  return {
    userIds: Array.from(new Set(userIds.filter(Boolean))),
    emails: Array.from(new Set(emails.filter(Boolean).map(normalizeEmail))),
    pendingEmails: Array.from(new Set(pendingEmails.filter(Boolean).map(normalizeEmail))),
  };
};

const hashEmail = (email) =>
  crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");

const writePendingNotifications = async (eventType, event, pendingEmails) => {
  if (!pendingEmails.length) return;

  const writes = pendingEmails.map((email) => {
    const emailHash = hashEmail(email);
    return db
      .collection("pendingNotifications")
      .doc(emailHash)
      .collection("events")
      .doc()
      .set({
        eventType,
        resource: event.resource || null,
        actor: event.actor || null,
        payload: event.payload || null,
        dedupeKey: event.dedupeKey || null,
        createdAt: FieldValue.serverTimestamp(),
      });
  });

  await Promise.all(writes);
};

const fetchRecipientProfiles = async (userIds) => {
  const uniqueIds = Array.from(new Set((userIds || []).filter(Boolean)));
  const snapshots = await Promise.all(
    uniqueIds.map(async (uid) => {
      try {
        const snap = await db.collection("users").doc(uid).get();
        if (!snap.exists) return { uid, data: {} };
        return { uid, data: snap.data() || {} };
      } catch (err) {
        logger.warn("Failed to fetch user settings for notifications", { uid, error: err?.message });
        return { uid, data: {} };
      }
    })
  );

  return snapshots.map(({ uid, data }) => ({
    uid,
    email: data?.email ? normalizeEmail(data.email) : null,
    settings: data?.settings || {},
  }));
};

const resolveRecipientRouting = async (eventType, recipients) => {
  const recipientProfiles = await fetchRecipientProfiles(recipients.userIds);
  const inAppUserIds = [];
  const userEmailRecipients = [];
  const knownUserEmails = new Set();

  recipientProfiles.forEach((profile) => {
    const preference = resolveNotificationPreference(eventType, profile.settings);
    const channels = preferenceToChannels(preference);
    if (channels.inApp) inAppUserIds.push(profile.uid);
    if (channels.email && profile.email) userEmailRecipients.push(profile.email);
    if (profile.email) knownUserEmails.add(profile.email);
  });

  const defaultPreference = getDefaultPreference(eventType, { emailNotifications: true });
  const defaultChannels = preferenceToChannels(defaultPreference);

  const externalEmails = recipients.emails.filter((email) => !knownUserEmails.has(email));
  const externalEmailRecipients = defaultChannels.email ? externalEmails : [];
  const pendingEmails = recipients.pendingEmails;

  const emailRecipients = Array.from(
    new Set([...userEmailRecipients, ...externalEmailRecipients].filter(Boolean))
  );

  return {
    inAppUserIds,
    emailRecipients,
    pendingEmails,
  };
};

const writeInAppNotifications = async (eventType, event, recipients) => {
  if (recipients.userIds.length === 0) {
    return { success: true, skipped: true };
  }
  const template = getInAppTemplate(eventType);
  if (!template) {
    return { success: false, error: "Missing in-app template" };
  }

  const base = template(event);
  const metadata = buildMetadata(event);
  const dedupeId = event.dedupeKey ? `dedupe:${event.dedupeKey}` : null;
  const writes = recipients.userIds.map((uid) => {
    const notificationsRef = db.collection("users").doc(uid).collection("notifications");
    const docRef = dedupeId ? notificationsRef.doc(dedupeId) : notificationsRef.doc();
    return docRef.set({
        type: eventType,
        title: base.title,
        body: base.body,
        actionUrl: base.actionUrl,
        resource: event.resource || null,
        actor: event.actor || null,
        metadata,
        dedupeKey: event.dedupeKey || null,
        read: false,
        dismissed: false,
        createdAt: FieldValue.serverTimestamp(),
      });
  });

  await Promise.all(writes);
  return { success: true };
};

const writeEmailNotifications = async (eventType, event, recipients) => {
  if (recipients.emails.length === 0) {
    return { success: true, skipped: true };
  }
  const template = getEmailTemplate(eventType);
  if (!template) {
    return { success: false, error: "Missing email template" };
  }

  const writes = recipients.emails.map((email) => {
    const message = template(event, { email });
    return db.collection("mail").add({
      to: email,
      message,
    });
  });

  await Promise.all(writes);
  return { success: true };
};

exports.processNotificationEvent = onDocumentCreated(
  {
    document: "notificationEvents/{eventId}",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const eventId = event.params.eventId;
    const eventRef = db.collection("notificationEvents").doc(eventId);
    const eventData = snapshot.data() || {};

    const resolvedType = resolveNotificationEventType(
      eventData.eventType,
      eventData.payload?.metadata || eventData.metadata
    );

    if (!resolvedType) {
      await eventRef.update({
        status: "failed",
        error: { message: "Unsupported eventType" },
      });
      return;
    }

    await eventRef.update({
      status: "processing",
      eventType: resolvedType,
    });

    const recipients = resolveRecipients(eventData);
    const errors = {};
    const routing = await resolveRecipientRouting(resolvedType, recipients);

    let inAppResult;
    let emailResult;
    let discordResult;

    try {
      inAppResult = await writeInAppNotifications(resolvedType, eventData, {
        userIds: routing.inAppUserIds,
      });
      if (!inAppResult.success) {
        errors.inApp = inAppResult.error;
      }
    } catch (err) {
      errors.inApp = err?.message || "In-app notification failed";
    }

    try {
      emailResult = await writeEmailNotifications(resolvedType, eventData, {
        emails: routing.emailRecipients,
      });
      if (!emailResult.success) {
        errors.email = emailResult.error;
      }
    } catch (err) {
      errors.email = err?.message || "Email notification failed";
    }

    try {
      await writePendingNotifications(resolvedType, eventData, routing.pendingEmails);
    } catch (err) {
      errors.pending = err?.message || "Pending notification write failed";
    }

    try {
      discordResult = await sendDiscordNotification({ db, eventType: resolvedType, event: eventData });
      if (!discordResult?.success) {
        errors.discord = discordResult?.error || "Discord notification failed";
      }
    } catch (err) {
      errors.discord = err?.message || "Discord notification failed";
    }

    try {
      await applyAutoClear({ db, eventType: resolvedType, event: eventData, recipients });
    } catch (err) {
      errors.autoClear = err?.message || "Auto-clear failed";
    }

    const hasSuccess = Boolean(
      inAppResult?.success || emailResult?.success || discordResult?.success
    );
    const hasErrors = Object.keys(errors).length > 0;

    let status = "processed";
    if (hasErrors && hasSuccess) {
      status = "partial";
    } else if (hasErrors && !hasSuccess) {
      status = "failed";
    }

    if (hasErrors) {
      logger.warn("Notification event partial/failed", { eventId, errors });
    }

    await eventRef.update({
      status,
      ...(hasErrors ? { error: errors } : {}),
    });
  }
);
