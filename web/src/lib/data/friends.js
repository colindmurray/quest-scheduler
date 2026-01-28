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
  getDocs,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";
import {
  createFriendAcceptedNotification,
  ensureFriendRequestNotification,
  deleteNotification,
  friendRequestNotificationId,
} from "./notifications";
import { findUserIdByEmail } from "./users";
import { APP_URL } from "../config";
import { createEmailMessage } from "../emailTemplates";
import { resolveIdentifier } from "../identifiers";

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
  {
    fromUserId,
    fromEmail,
    toEmail,
    toIdentifier,
    fromDisplayName,
  },
  { sendEmail = true, notifyRecipient = true } = {}
) {
  const normalizedFrom = (fromEmail || "").trim().toLowerCase();
  const resolved = await resolveIdentifier(toIdentifier || toEmail);
  const normalizedTo = (resolved.email || "").trim().toLowerCase();
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
  });
  const requestId =
    response.data?.requestId || friendRequestIdForEmails(normalizedFrom, normalizedTo);

  if (sendEmail) {
    try {
      await setDoc(doc(collection(db, "mail")), {
        to: normalizedTo,
        message: createEmailMessage({
          subject: `${fromDisplayName || normalizedFrom} sent you a friend request`,
          title: "Friend Request",
          intro: `${fromDisplayName || normalizedFrom} wants to add you as a friend on Quest Scheduler.`,
          ctaLabel: "Review request",
        ctaUrl: `${APP_URL}/friends?request=${requestId}`,
          extraLines: ["If you don't have an account yet, you'll be prompted to create one first."],
        }),
      });
    } catch (err) {
      console.warn("Failed to queue friend request email:", err);
    }
  }

  return requestId;
}

export async function acceptFriendRequest(requestId, { userId, userEmail }) {
  const ref = friendRequestRef(requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Friend request not found.");
  }
  const data = snap.data();
  const normalizedEmail = userEmail.toLowerCase();
  if (data.toEmail?.toLowerCase() !== normalizedEmail) {
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

  const senderUserId = data.fromUserId || (await findUserIdByEmail(data.fromEmail));
  if (senderUserId) {
    await createFriendAcceptedNotification(senderUserId, {
      requestId,
      friendEmail: normalizedEmail,
      friendUserId: userId,
    });
  }

  if (userId) {
    await deleteNotification(userId, friendRequestNotificationId(requestId));
  }
}

export async function declineFriendRequest(requestId, { userId, userEmail }) {
  const ref = friendRequestRef(requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Friend request not found.");
  }
  const data = snap.data();
  const normalizedEmail = userEmail.toLowerCase();
  if (data.toEmail?.toLowerCase() !== normalizedEmail) {
    throw new Error("You are not authorized to decline this request.");
  }
  if (data.status !== "pending") {
    throw new Error("Friend request is no longer pending.");
  }

  await updateDoc(ref, {
    status: "declined",
    respondedAt: serverTimestamp(),
  });

  if (userId) {
    await deleteNotification(userId, friendRequestNotificationId(requestId));
  }
}

export async function removeFriend(requestId, { userEmail }) {
  const ref = friendRequestRef(requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Friend request not found.");
  }
  const data = snap.data();
  const normalizedEmail = userEmail.toLowerCase();
  if (data.status !== "accepted") {
    throw new Error("Friendship is no longer active.");
  }
  if (
    data.toEmail?.toLowerCase() !== normalizedEmail &&
    data.fromEmail?.toLowerCase() !== normalizedEmail
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

export async function syncFriendRequestNotifications(userId, pendingRequests) {
  const requests = pendingRequests || [];
  await Promise.all(
    requests.map((request) => {
      if (!request?.id) return null;
      return ensureFriendRequestNotification(userId, {
        requestId: request.id,
        fromEmail: request.fromEmail || "Unknown",
        fromUserId: request.fromUserId || null,
      });
    })
  );
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
      email: email?.toLowerCase() || null,
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
  const response = await acceptInvite({ inviteCode: normalizedCode });
  return response.data;
}
