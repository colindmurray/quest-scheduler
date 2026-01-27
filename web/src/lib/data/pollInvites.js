import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";
import {
  createSessionJoinNotification,
  deleteNotification,
  pollInviteNotificationId,
} from "./notifications";

export const pollPendingInvitesQuery = (email) =>
  query(collection(db, "schedulers"), where("pendingInvites", "array-contains", email));

export async function sendPendingPollInvites(schedulerId, invitees, schedulerTitle) {
  const functions = getFunctions();
  const sendInvites = httpsCallable(functions, "sendPollInvites");
  const response = await sendInvites({
    schedulerId,
    invitees,
    schedulerTitle,
  });
  return response.data || { added: [], rejected: [] };
}

async function removeVotesByEmail(schedulerId, email) {
  const votesQuery = query(
    collection(db, "schedulers", schedulerId, "votes"),
    where("userEmail", "==", email)
  );
  const snap = await getDocs(votesQuery);
  await Promise.all(snap.docs.map((voteDoc) => deleteDoc(voteDoc.ref)));
}

export async function acceptPollInvite(schedulerId, userEmail, userId = null) {
  const ref = doc(db, "schedulers", schedulerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Session poll not found.");
  }
  const data = snap.data() || {};
  const normalizedEmail = userEmail.toLowerCase();
  const wasParticipant = (data.participants || []).some(
    (email) => email?.toLowerCase() === normalizedEmail
  );
  if (!wasParticipant) {
    await updateDoc(ref, {
      participants: arrayUnion(normalizedEmail),
      pendingInvites: arrayRemove(normalizedEmail),
      [`pendingInviteMeta.${normalizedEmail}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }

  if (userId) {
    await deleteNotification(userId, pollInviteNotificationId(schedulerId));
  }

  if (data.creatorId && userId && data.creatorId !== userId) {
    try {
      await createSessionJoinNotification(data.creatorId, {
        schedulerId,
        schedulerTitle: data.title || "Session Poll",
        participantEmail: normalizedEmail,
      });
    } catch (err) {
      console.warn("Failed to notify poll creator about join:", err);
    }
  }
}

export async function declinePollInvite(schedulerId, userEmail, userId = null) {
  const ref = doc(db, "schedulers", schedulerId);
  const normalizedEmail = userEmail.toLowerCase();
  await updateDoc(ref, {
    pendingInvites: arrayRemove(normalizedEmail),
    [`pendingInviteMeta.${normalizedEmail}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
  if (userId) {
    await deleteNotification(userId, pollInviteNotificationId(schedulerId));
  }
}

export async function revokePollInvite(schedulerId, inviteeEmail, inviteeUserId = null) {
  const functions = getFunctions();
  const revokeInvite = httpsCallable(functions, "revokePollInvite");
  await revokeInvite({
    schedulerId,
    inviteeEmail,
  });
}

export async function removeParticipantFromPoll(
  schedulerId,
  participantEmail,
  removeVotes = true,
  removePendingInvite = false
) {
  const ref = doc(db, "schedulers", schedulerId);
  const normalizedEmail = participantEmail.toLowerCase();
  await updateDoc(ref, {
    participants: arrayRemove(normalizedEmail),
    updatedAt: serverTimestamp(),
  });

  if (removePendingInvite) {
    await revokePollInvite(schedulerId, normalizedEmail);
  }

  if (removeVotes) {
    await removeVotesByEmail(schedulerId, normalizedEmail);
  }
}
