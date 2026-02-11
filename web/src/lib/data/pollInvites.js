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
  waitForPendingWrites,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";
import { emitNotificationEvent } from "./notification-events";
import {
  dismissNotification,
  dismissNotificationsByResource,
  pollInviteNotificationId,
  pollInviteLegacyNotificationId,
} from "./notifications";
import { findUserIdByEmail } from "./users";
import { normalizeEmail } from "../utils";
import { deleteBasicPollVote } from "./basicPolls";

export const pollPendingInvitesQuery = (email) => {
  const normalized = normalizeEmail(email);
  return query(collection(db, "schedulers"), where("pendingInvites", "array-contains", normalized));
};

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
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  const votesQuery = query(
    collection(db, "schedulers", schedulerId, "votes"),
    where("userEmail", "==", normalizedEmail)
  );
  const snap = await getDocs(votesQuery);
  await Promise.all(snap.docs.map((voteDoc) => deleteDoc(voteDoc.ref)));
}

async function removeVotesByUserId(schedulerId, userId) {
  if (!userId) return;
  await deleteDoc(doc(db, "schedulers", schedulerId, "votes", userId));
}

async function removeEmbeddedBasicPollVotesByUserId(schedulerId, userId) {
  if (!schedulerId || !userId) return;
  const pollsSnap = await getDocs(collection(db, "schedulers", schedulerId, "basicPolls"));
  await Promise.all(
    pollsSnap.docs.map((pollDoc) =>
      deleteBasicPollVote("scheduler", schedulerId, pollDoc.id, userId)
    )
  );
}

export async function acceptPollInvite(schedulerId, userEmail, userId = null) {
  const normalizedEmail = normalizeEmail(userEmail);
  if (!normalizedEmail) {
    throw new Error("User email is required to accept a poll invite.");
  }
  const ref = doc(db, "schedulers", schedulerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Session poll not found.");
  }
  const data = snap.data() || {};
  const hasParticipantId = Boolean(
    userId && (data.participantIds || []).includes(userId)
  );
  const updates = {
    pendingInvites: arrayRemove(normalizedEmail),
    [`pendingInviteMeta.${normalizedEmail}`]: deleteField(),
    updatedAt: serverTimestamp(),
  };
  if (!hasParticipantId && userId) {
    updates.participantIds = arrayUnion(userId);
  }
  await updateDoc(ref, updates);

  if (data.creatorId && userId && data.creatorId !== userId) {
    try {
      await emitNotificationEvent({
        eventType: "POLL_INVITE_ACCEPTED",
        resource: { type: "poll", id: schedulerId, title: data.title || "Session Poll" },
        actor: { uid: userId, email: normalizedEmail },
        payload: {
          pollTitle: data.title || "Session Poll",
          inviteeEmail: normalizedEmail,
        },
        recipients: {
          userIds: [data.creatorId],
          emails: data.creatorEmail ? [data.creatorEmail] : [],
        },
      });
    } catch (err) {
      console.warn("Failed to notify poll creator about invite acceptance:", err);
    }
  }

  if (userId) {
    try {
      const ids = [
        pollInviteNotificationId(schedulerId, normalizedEmail),
        pollInviteLegacyNotificationId(schedulerId),
      ].filter(Boolean);
      await Promise.allSettled(ids.map((id) => dismissNotification(userId, id)));
      await dismissNotificationsByResource(userId, schedulerId, [
        "POLL_INVITE_SENT",
        "POLL_INVITE",
      ]);
      await waitForPendingWrites(db);
    } catch (err) {
      console.warn("Failed to dismiss poll invite notification:", err);
    }
  }
}

export async function declinePollInvite(schedulerId, userEmail, userId = null) {
  const ref = doc(db, "schedulers", schedulerId);
  const normalizedEmail = normalizeEmail(userEmail);
  if (!normalizedEmail) {
    throw new Error("User email is required to decline a poll invite.");
  }
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Session poll not found.");
  }
  const data = snap.data() || {};
  const resolvedUserId =
    userId || (normalizedEmail ? await findUserIdByEmail(normalizedEmail) : null);
  if (resolvedUserId) {
    await removeVotesByUserId(schedulerId, resolvedUserId);
  } else {
    await removeVotesByEmail(schedulerId, normalizedEmail);
  }
  const updates = {
    pendingInvites: arrayRemove(normalizedEmail),
    [`pendingInviteMeta.${normalizedEmail}`]: deleteField(),
    updatedAt: serverTimestamp(),
  };
  if (resolvedUserId) {
    updates.participantIds = arrayRemove(resolvedUserId);
  }
  await updateDoc(ref, updates);

  if (data.creatorId && userId && data.creatorId !== userId) {
    try {
      await emitNotificationEvent({
        eventType: "POLL_INVITE_DECLINED",
        resource: { type: "poll", id: schedulerId, title: data.title || "Session Poll" },
        actor: { uid: userId, email: normalizedEmail },
        payload: {
          pollTitle: data.title || "Session Poll",
          inviteeEmail: normalizedEmail,
        },
        recipients: {
          userIds: [data.creatorId],
          emails: data.creatorEmail ? [data.creatorEmail] : [],
        },
      });
    } catch (err) {
      console.warn("Failed to notify poll creator about invite decline:", err);
    }
  }

  if (userId) {
    try {
      const ids = [
        pollInviteNotificationId(schedulerId, normalizedEmail),
        pollInviteLegacyNotificationId(schedulerId),
      ].filter(Boolean);
      await Promise.allSettled(ids.map((id) => dismissNotification(userId, id)));
      await dismissNotificationsByResource(userId, schedulerId, [
        "POLL_INVITE_SENT",
        "POLL_INVITE",
      ]);
      await waitForPendingWrites(db);
    } catch (err) {
      console.warn("Failed to dismiss poll invite notification:", err);
    }
  }
}

export async function revokePollInvite(schedulerId, inviteeEmail) {
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
  removePendingInvite = false,
  participantUserId = null
) {
  const ref = doc(db, "schedulers", schedulerId);
  const normalizedEmail = normalizeEmail(participantEmail);
  const resolvedUserId =
    participantUserId || (normalizedEmail ? await findUserIdByEmail(normalizedEmail) : null);
  if (removeVotes) {
    if (resolvedUserId) {
      await removeVotesByUserId(schedulerId, resolvedUserId);
      await removeEmbeddedBasicPollVotesByUserId(schedulerId, resolvedUserId);
    } else {
      await removeVotesByEmail(schedulerId, normalizedEmail);
    }
  }

  const updates = {
    updatedAt: serverTimestamp(),
  };
  if (resolvedUserId) {
    updates.participantIds = arrayRemove(resolvedUserId);
  }
  await updateDoc(ref, updates);

  if (removePendingInvite && normalizedEmail) {
    await revokePollInvite(schedulerId, normalizedEmail);
  }
}
