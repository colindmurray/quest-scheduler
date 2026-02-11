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

// Notification types
export const NOTIFICATION_TYPES = {
  FRIEND_REQUEST: "FRIEND_REQUEST",
  FRIEND_ACCEPTED: "FRIEND_ACCEPTED",
  POLL_INVITE: "POLL_INVITE",
  GROUP_INVITE: "GROUP_INVITE",
  GROUP_INVITE_ACCEPTED: "GROUP_INVITE_ACCEPTED",
  SESSION_INVITE: "SESSION_INVITE",
  VOTE_REMINDER: "VOTE_REMINDER",
  VOTE_SUBMITTED: "VOTE_SUBMITTED",
  SESSION_FINALIZED: "SESSION_FINALIZED",
  SESSION_JOINED: "SESSION_JOINED",
  GROUP_MEMBER_CHANGE: "GROUP_MEMBER_CHANGE",
  POLL_CREATED: "POLL_CREATED",
  POLL_INVITE_SENT: "POLL_INVITE_SENT",
  POLL_INVITE_ACCEPTED: "POLL_INVITE_ACCEPTED",
  POLL_INVITE_DECLINED: "POLL_INVITE_DECLINED",
  POLL_INVITE_REVOKED: "POLL_INVITE_REVOKED",
  POLL_READY_TO_FINALIZE: "POLL_READY_TO_FINALIZE",
  POLL_ALL_VOTES_IN: "POLL_ALL_VOTES_IN",
  POLL_FINALIZED: "POLL_FINALIZED",
  POLL_REOPENED: "POLL_REOPENED",
  POLL_CANCELLED: "POLL_CANCELLED",
  POLL_RESTORED: "POLL_RESTORED",
  POLL_DELETED: "POLL_DELETED",
  SLOT_CHANGED: "SLOT_CHANGED",
  DISCORD_NUDGE_SENT: "DISCORD_NUDGE_SENT",
  FRIEND_REQUEST_SENT: "FRIEND_REQUEST_SENT",
  FRIEND_REQUEST_ACCEPTED: "FRIEND_REQUEST_ACCEPTED",
  FRIEND_REQUEST_DECLINED: "FRIEND_REQUEST_DECLINED",
  FRIEND_REMOVED: "FRIEND_REMOVED",
  GROUP_INVITE_SENT: "GROUP_INVITE_SENT",
  GROUP_INVITE_DECLINED: "GROUP_INVITE_DECLINED",
  GROUP_MEMBER_REMOVED: "GROUP_MEMBER_REMOVED",
  GROUP_MEMBER_LEFT: "GROUP_MEMBER_LEFT",
  GROUP_DELETED: "GROUP_DELETED",
  BASIC_POLL_CREATED: "BASIC_POLL_CREATED",
  BASIC_POLL_FINALIZED: "BASIC_POLL_FINALIZED",
  BASIC_POLL_REOPENED: "BASIC_POLL_REOPENED",
  BASIC_POLL_VOTE_SUBMITTED: "BASIC_POLL_VOTE_SUBMITTED",
  BASIC_POLL_REMINDER: "BASIC_POLL_REMINDER",
  BASIC_POLL_RESET: "BASIC_POLL_RESET",
  BASIC_POLL_REMOVED: "BASIC_POLL_REMOVED",
  BASIC_POLL_DEADLINE_CHANGED: "BASIC_POLL_DEADLINE_CHANGED",
  BASIC_POLL_REQUIRED_CHANGED: "BASIC_POLL_REQUIRED_CHANGED",
  BASIC_POLL_RESULTS: "BASIC_POLL_RESULTS",
  BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES:
    "BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES",
};

export const NOTIFICATION_TYPE_ALIASES = {
  [NOTIFICATION_TYPES.FRIEND_REQUEST_SENT]: NOTIFICATION_TYPES.FRIEND_REQUEST,
  [NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED]: NOTIFICATION_TYPES.FRIEND_ACCEPTED,
  [NOTIFICATION_TYPES.POLL_INVITE_SENT]: NOTIFICATION_TYPES.POLL_INVITE,
  [NOTIFICATION_TYPES.POLL_INVITE_ACCEPTED]: NOTIFICATION_TYPES.SESSION_JOINED,
  [NOTIFICATION_TYPES.POLL_FINALIZED]: NOTIFICATION_TYPES.SESSION_FINALIZED,
  [NOTIFICATION_TYPES.GROUP_INVITE_SENT]: NOTIFICATION_TYPES.GROUP_INVITE,
  [NOTIFICATION_TYPES.GROUP_INVITE_ACCEPTED]: NOTIFICATION_TYPES.GROUP_INVITE_ACCEPTED,
  [NOTIFICATION_TYPES.GROUP_MEMBER_REMOVED]: NOTIFICATION_TYPES.GROUP_MEMBER_CHANGE,
  [NOTIFICATION_TYPES.GROUP_MEMBER_LEFT]: NOTIFICATION_TYPES.GROUP_MEMBER_CHANGE,
};

export function normalizeNotificationType(type) {
  return NOTIFICATION_TYPE_ALIASES[type] || type;
}

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
