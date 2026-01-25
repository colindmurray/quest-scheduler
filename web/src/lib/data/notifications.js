import { collection, doc, query, where, orderBy, serverTimestamp, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

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
};

// Create a notification
export async function createNotification(userId, notification) {
  const notificationId = crypto.randomUUID();
  const ref = notificationRef(userId, notificationId);

  await setDoc(ref, {
    ...notification,
    read: false,
    dismissed: false,
    createdAt: serverTimestamp(),
  });

  return notificationId;
}

export function friendRequestNotificationId(requestId) {
  return `friendRequest:${requestId}`;
}

export async function ensureFriendRequestNotification(userId, { requestId, fromEmail }) {
  const notificationId = friendRequestNotificationId(requestId);
  const ref = notificationRef(userId, notificationId);
  await setDoc(ref, {
    type: NOTIFICATION_TYPES.FRIEND_REQUEST,
    title: "Friend Request",
    body: `${fromEmail} sent you a friend request`,
    actionUrl: `/friends?request=${requestId}`,
    metadata: {
      requestId,
      fromEmail,
    },
    read: false,
    dismissed: false,
    createdAt: serverTimestamp(),
  }, { merge: true });

  return notificationId;
}

export async function createFriendRequestNotification(userId, { requestId, fromEmail }) {
  return ensureFriendRequestNotification(userId, { requestId, fromEmail });
}

export async function createFriendAcceptedNotification(userId, { requestId, friendEmail }) {
  return createNotification(userId, {
    type: NOTIFICATION_TYPES.FRIEND_ACCEPTED,
    title: "Friend Request Accepted",
    body: `${friendEmail} accepted your friend request`,
    actionUrl: "/friends",
    metadata: {
      requestId,
      friendEmail,
    },
  });
}

export function pollInviteNotificationId(schedulerId) {
  return `pollInvite:${schedulerId}`;
}

export async function ensurePollInviteNotification(userId, { schedulerId, schedulerTitle, inviterEmail }) {
  const notificationId = pollInviteNotificationId(schedulerId);
  const ref = notificationRef(userId, notificationId);
  await setDoc(ref, {
    type: NOTIFICATION_TYPES.POLL_INVITE,
    title: "Session Poll Invite",
    body: `${inviterEmail} invited you to join "${schedulerTitle}"`,
    actionUrl: `/scheduler/${schedulerId}`,
    metadata: {
      schedulerId,
      schedulerTitle,
      inviterEmail,
    },
    read: false,
    dismissed: false,
    createdAt: serverTimestamp(),
  }, { merge: true });

  return notificationId;
}

export async function createPollInviteNotification(userId, { schedulerId, schedulerTitle, inviterEmail }) {
  return ensurePollInviteNotification(userId, { schedulerId, schedulerTitle, inviterEmail });
}

export async function createGroupInviteAcceptedNotification(userId, { groupId, groupName, memberEmail }) {
  return createNotification(userId, {
    type: NOTIFICATION_TYPES.GROUP_INVITE_ACCEPTED,
    title: "Group Invite Accepted",
    body: `${memberEmail} accepted your invite to "${groupName}"`,
    actionUrl: "/friends?tab=groups",
    metadata: {
      groupId,
      groupName,
      memberEmail,
    },
  });
}

export function groupInviteNotificationId(groupId) {
  return `groupInvite:${groupId}`;
}

export async function ensureGroupInviteNotification(userId, { groupId, groupName, inviterEmail }) {
  const notificationId = groupInviteNotificationId(groupId);
  const ref = notificationRef(userId, notificationId);
  await setDoc(ref, {
    type: NOTIFICATION_TYPES.GROUP_INVITE,
    title: "Group Invitation",
    body: `${inviterEmail} invited you to join "${groupName}"`,
    actionUrl: "/friends?tab=groups",
    metadata: {
      groupId,
      groupName,
      inviterEmail,
    },
    read: false,
    dismissed: false,
    createdAt: serverTimestamp(),
  }, { merge: true });

  return notificationId;
}

// Create group invitation notification
export async function createGroupInviteNotification(userId, { groupId, groupName, inviterEmail }) {
  return ensureGroupInviteNotification(userId, { groupId, groupName, inviterEmail });
}

// Create session finalized notification
export async function createSessionFinalizedNotification(userId, { schedulerId, schedulerTitle, winningDate }) {
  return createNotification(userId, {
    type: NOTIFICATION_TYPES.SESSION_FINALIZED,
    title: "Session Finalized",
    body: `"${schedulerTitle}" has been finalized for ${winningDate}`,
    actionUrl: `/scheduler/${schedulerId}`,
    metadata: {
      schedulerId,
      schedulerTitle,
    },
  });
}

export async function createSessionInviteNotification(userId, { schedulerId, schedulerTitle, inviterEmail }) {
  return createNotification(userId, {
    type: NOTIFICATION_TYPES.SESSION_INVITE,
    title: "Session Poll Invitation",
    body: `${inviterEmail} invited you to vote on "${schedulerTitle}"`,
    actionUrl: `/scheduler/${schedulerId}`,
    metadata: {
      schedulerId,
      schedulerTitle,
      inviterEmail,
    },
  });
}

export async function createVoteSubmittedNotification(userId, { schedulerId, schedulerTitle, voterEmail }) {
  return createNotification(userId, {
    type: NOTIFICATION_TYPES.VOTE_SUBMITTED,
    title: "New Vote Submitted",
    body: `${voterEmail} updated votes for "${schedulerTitle}"`,
    actionUrl: `/scheduler/${schedulerId}`,
    metadata: {
      schedulerId,
      schedulerTitle,
      voterEmail,
    },
  });
}

export async function createSessionJoinNotification(userId, { schedulerId, schedulerTitle, participantEmail }) {
  return createNotification(userId, {
    type: NOTIFICATION_TYPES.SESSION_JOINED,
    title: "New Participant",
    body: `${participantEmail} joined "${schedulerTitle}"`,
    actionUrl: `/scheduler/${schedulerId}`,
    metadata: {
      schedulerId,
      schedulerTitle,
      participantEmail,
    },
  });
}

// Create vote reminder notification
export async function createVoteReminderNotification(userId, { schedulerId, schedulerTitle }) {
  return createNotification(userId, {
    type: NOTIFICATION_TYPES.VOTE_REMINDER,
    title: "Vote Needed",
    body: `"${schedulerTitle}" is waiting for your vote`,
    actionUrl: `/scheduler/${schedulerId}`,
    metadata: {
      schedulerId,
      schedulerTitle,
    },
  });
}

// Create group member change notification
export async function createGroupMemberChangeNotification(userId, { groupId, groupName, action }) {
  const actionText = action === "added" ? "added to" : "removed from";
  return createNotification(userId, {
    type: NOTIFICATION_TYPES.GROUP_MEMBER_CHANGE,
    title: "Group Update",
    body: `You were ${actionText} "${groupName}"`,
    actionUrl: "/settings?tab=groups",
    metadata: {
      groupId,
      groupName,
      action,
    },
  });
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
