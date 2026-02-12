import {
  collection,
  doc,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeEmail } from "../utils";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_ALIASES,
  normalizeNotificationType,
} from "../notification-types";

// Collection references
export const userNotificationsRef = (userId) =>
  collection(db, "users", userId, "notifications");

export const notificationRef = (userId, notificationId) =>
  doc(db, "users", userId, "notifications", notificationId);

// Query for unread notifications
export const unreadNotificationsQuery = (userId) =>
  query(
    userNotificationsRef(userId),
    where("read", "==", false),
    where("dismissed", "==", false),
    orderBy("createdAt", "desc")
  );

// Query for all non-dismissed notifications
export const allNotificationsQuery = (userId) =>
  query(
    userNotificationsRef(userId),
    where("dismissed", "==", false),
    orderBy("createdAt", "desc")
  );

export { NOTIFICATION_TYPES, NOTIFICATION_TYPE_ALIASES, normalizeNotificationType };

export function notificationDedupeId(dedupeKey) {
  if (!dedupeKey) return null;
  return `dedupe:${dedupeKey}`;
}

export function friendRequestNotificationId(requestId) {
  if (!requestId) return null;
  return notificationDedupeId(`friend:${requestId}`);
}

export function friendRequestLegacyNotificationId(requestId) {
  if (!requestId) return null;
  return `friendRequest:${requestId}`;
}

export function pollInviteNotificationId(schedulerId, inviteeEmail) {
  const normalizedEmail = normalizeEmail(inviteeEmail);
  if (!schedulerId || !normalizedEmail) return null;
  return notificationDedupeId(`poll:${schedulerId}:invite:${normalizedEmail}`);
}

export function pollInviteLegacyNotificationId(schedulerId) {
  if (!schedulerId) return null;
  return `pollInvite:${schedulerId}`;
}

export function groupInviteNotificationId(groupId, inviteeEmail) {
  const normalizedEmail = normalizeEmail(inviteeEmail);
  if (!groupId || !normalizedEmail) return null;
  return notificationDedupeId(`group:${groupId}:invite:${normalizedEmail}`);
}

export function groupInviteLegacyNotificationId(groupId) {
  if (!groupId) return null;
  return `groupInvite:${groupId}`;
}

export async function dismissNotificationsByResource(
  userId,
  resourceId,
  allowedTypes = null
) {
  if (!userId || !resourceId) return;
  const snapshot = await getDocs(
    query(userNotificationsRef(userId), where("resource.id", "==", resourceId))
  );
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  let updates = 0;
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (Array.isArray(allowedTypes) && allowedTypes.length > 0) {
      if (!allowedTypes.includes(data.type)) return;
    }
    batch.update(docSnap.ref, { dismissed: true });
    updates += 1;
  });
  if (updates > 0) {
    await batch.commit();
  }
}

// Mark notification as read
export async function markNotificationRead(userId, notificationId) {
  const ref = notificationRef(userId, notificationId);
  await updateDoc(ref, { read: true });
}

// Dismiss notification
export async function dismissNotification(userId, notificationId) {
  const ref = notificationRef(userId, notificationId);
  await updateDoc(ref, { dismissed: true });
}

// Mark all notifications as read
export async function markAllNotificationsRead(userId, notifications) {
  const batch = writeBatch(db);

  notifications.forEach((notification) => {
    if (!notification.read) {
      const ref = notificationRef(userId, notification.id);
      batch.update(ref, { read: true });
    }
  });

  await batch.commit();
}

// Dismiss all notifications
export async function dismissAllNotifications(userId, notifications) {
  const batch = writeBatch(db);

  notifications.forEach((notification) => {
    const ref = notificationRef(userId, notification.id);
    batch.update(ref, { dismissed: true });
  });

  await batch.commit();
}

// Delete notification (permanent)
export async function deleteNotification(userId, notificationId) {
  const ref = notificationRef(userId, notificationId);
  await deleteDoc(ref);
}
