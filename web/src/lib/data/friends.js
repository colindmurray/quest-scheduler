import {
  collection,
  doc,
  query,
  where,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  waitForPendingWrites,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";
import { findUserIdByEmail } from "./users";
import { resolveIdentifier } from "../identifiers";
import { normalizeEmail } from "../utils";
import { buildNotificationActor, emitNotificationEvent } from "./notification-events";
import {
  dismissNotification,
  dismissNotificationsByResource,
  deleteNotification,
  friendRequestNotificationId,
  friendRequestLegacyNotificationId,
} from "./notifications";

export const friendRequestsRef = () => collection(db, "friendRequests");
export const friendRequestRef = (requestId) =>
  doc(db, "friendRequests", requestId);

export function friendRequestIdForEmails(fromEmail, toEmail) {
  return `friendRequest:${encodeURIComponent(`${fromEmail}__${toEmail}`)}`;
}

export function normalizeFriendRequestId(rawRequestId) {
  if (!rawRequestId) return null;
  if (rawRequestId.includes("%40")) return rawRequestId;
  if (rawRequestId.startsWith("friendRequest:")) {
    const suffix = rawRequestId.slice("friendRequest:".length);
    return `friendRequest:${encodeURIComponent(suffix)}`;
  }
  return rawRequestId;
}

export const incomingFriendRequestsQuery = (email) =>
  query(
    friendRequestsRef(),
    where("toEmail", "==", email),
    where("status", "==", "pending")
  );

export const outgoingFriendRequestsQuery = (userId) =>
  query(
    friendRequestsRef(),
    where("fromUserId", "==", userId),
    where("status", "==", "pending")
  );

export const acceptedFriendRequestsFromQuery = (email) =>
  query(
    friendRequestsRef(),
    where("fromEmail", "==", email),
    where("status", "==", "accepted")
  );

export const acceptedFriendRequestsToQuery = (email) =>
  query(
    friendRequestsRef(),
    where("toEmail", "==", email),
    where("status", "==", "accepted")
  );

export async function createFriendRequest(
  { fromEmail, toEmail, toIdentifier, fromDisplayName },
  { sendEmail = true } = {}
) {
  const normalizedFrom = normalizeEmail(fromEmail);
  const resolved = await resolveIdentifier(toIdentifier || toEmail);
  const normalizedTo = normalizeEmail(resolved.email);
  if (!normalizedFrom || !normalizedTo) {
    throw new Error("Missing email for friend request.");
  }
  if (normalizedFrom === normalizedTo) {
    throw new Error("You cannot add yourself as a friend.");
  }

  const functions = getFunctions();
  const sendFriendRequest = httpsCallable(functions, "sendFriendRequest");
  const response = await sendFriendRequest({
    toEmail: normalizedTo,
    fromDisplayName: fromDisplayName || null,
    sendEmail,
  });
  const payload = response.data || {};
  if (payload.suppressed) {
    return null;
  }
  const requestId =
    payload.requestId || friendRequestIdForEmails(normalizedFrom, normalizedTo);

  return requestId;
}

export async function acceptFriendRequest(requestId, { userId, userEmail }) {
  const ref = friendRequestRef(requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Friend request not found.");
  }
  const data = snap.data();
  const normalizedEmail = normalizeEmail(userEmail);
  if (normalizeEmail(data.toEmail) !== normalizedEmail) {
    throw new Error("You are not authorized to accept this request.");
  }
  if (data.status !== "pending") {
    throw new Error("Friend request is no longer pending.");
  }

  await updateDoc(ref, {
    status: "accepted",
    toUserId: userId,
    respondedAt: serverTimestamp(),
  });
  await waitForPendingWrites(db);

  const senderUserId = data.fromUserId || (await findUserIdByEmail(data.fromEmail));
  if (senderUserId) {
    await emitNotificationEvent({
      eventType: "FRIEND_REQUEST_ACCEPTED",
      resource: { type: "friend", id: requestId, title: "Friend Request" },
      actor: buildNotificationActor({ uid: userId, email: normalizedEmail }),
      payload: {
        requestId,
        friendEmail: normalizedEmail,
        friendUserId: userId,
      },
      recipients: {
        userIds: [senderUserId],
        emails: [],
      },
    });
  }

  if (userId) {
    try {
      const ids = [
        friendRequestNotificationId(requestId),
        friendRequestLegacyNotificationId(requestId),
      ].filter(Boolean);
      await Promise.allSettled(ids.map((id) => dismissNotification(userId, id)));
      await dismissNotificationsByResource(userId, requestId, [
        "FRIEND_REQUEST_SENT",
        "FRIEND_REQUEST",
      ]);
      await Promise.allSettled(ids.map((id) => deleteNotification(userId, id)));
      await waitForPendingWrites(db);
    } catch (err) {
      console.warn("Failed to dismiss friend request notification:", err);
    }
  }
}

export async function declineFriendRequest(requestId, { userId, userEmail }) {
  const ref = friendRequestRef(requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Friend request not found.");
  }
  const data = snap.data();
  const normalizedEmail = normalizeEmail(userEmail);
  if (normalizeEmail(data.toEmail) !== normalizedEmail) {
    throw new Error("You are not authorized to decline this request.");
  }
  if (data.status !== "pending") {
    throw new Error("Friend request is no longer pending.");
  }

  await updateDoc(ref, {
    status: "declined",
    respondedAt: serverTimestamp(),
  });
  await waitForPendingWrites(db);
  if (userId) {
    await emitNotificationEvent({
      eventType: "FRIEND_REQUEST_DECLINED",
      resource: { type: "friend", id: requestId, title: "Friend Request" },
      actor: buildNotificationActor({ uid: userId, email: normalizedEmail }),
      payload: {
        requestId,
        friendEmail: normalizedEmail,
        friendUserId: userId,
      },
      recipients: {
        userIds: [],
        emails: [],
      },
    });
  }

  if (userId) {
    try {
      const ids = [
        friendRequestNotificationId(requestId),
        friendRequestLegacyNotificationId(requestId),
      ].filter(Boolean);
      await Promise.allSettled(ids.map((id) => dismissNotification(userId, id)));
      await dismissNotificationsByResource(userId, requestId, [
        "FRIEND_REQUEST_SENT",
        "FRIEND_REQUEST",
      ]);
      await Promise.allSettled(ids.map((id) => deleteNotification(userId, id)));
      await waitForPendingWrites(db);
    } catch (err) {
      console.warn("Failed to dismiss friend request notification:", err);
    }
  }
}

export async function removeFriend(requestId, { userEmail }) {
  const ref = friendRequestRef(requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Friend request not found.");
  }
  const data = snap.data();
  const normalizedEmail = normalizeEmail(userEmail);
  if (data.status !== "accepted") {
    throw new Error("Friendship is no longer active.");
  }
  if (
    normalizeEmail(data.toEmail) !== normalizedEmail &&
    normalizeEmail(data.fromEmail) !== normalizedEmail
  ) {
    throw new Error("You are not authorized to remove this friend.");
  }
  if (!data.fromEmail || !data.toEmail) {
    throw new Error("Friend request is missing participant emails.");
  }

  const primaryId = friendRequestIdForEmails(data.fromEmail, data.toEmail);
  const reverseId = friendRequestIdForEmails(data.toEmail, data.fromEmail);
  const legacyIds = new Set([primaryId, reverseId]);
  legacyIds.delete(requestId);

  await Promise.allSettled([
    deleteDoc(ref),
    ...Array.from(legacyIds).map((id) => deleteDoc(friendRequestRef(id))),
  ]);
}

export async function ensureFriendInviteCode({ userId, email, displayName, photoURL }) {
  if (!userId) {
    throw new Error("Missing user id.");
  }
  const publicRef = doc(db, "usersPublic", userId);
  const publicSnap = await getDoc(publicRef);
  const existingCode = publicSnap.data()?.friendInviteCode;
  if (existingCode) return existingCode;

  const inviteCode = crypto.randomUUID();

  await setDoc(
    doc(db, "users", userId),
    { friendInviteCode: inviteCode, updatedAt: serverTimestamp() },
    { merge: true }
  );
  await setDoc(
    publicRef,
    {
      email: normalizeEmail(email) || null,
      displayName: displayName || null,
      photoURL: photoURL || null,
      friendInviteCode: inviteCode,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return inviteCode;
}

export async function acceptFriendInviteLink(inviteCode, { userId, userEmail }) {
  const normalizedCode = (inviteCode || "").trim();
  if (!normalizedCode) {
    throw new Error("Invite code is missing.");
  }
  const functions = getFunctions();
  const acceptInvite = httpsCallable(functions, "acceptFriendInviteLink");
  const response = await acceptInvite({ inviteCode: normalizedCode, userId, userEmail });
  return response.data;
}

export async function revokeFriendRequest(requestId) {
  const functions = getFunctions();
  const revokeRequest = httpsCallable(functions, "revokeFriendRequest");
  await revokeRequest({ requestId });
}
