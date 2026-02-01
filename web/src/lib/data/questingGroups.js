import { collection, doc, query, where, serverTimestamp, setDoc, updateDoc, deleteDoc, arrayRemove, getDocs, getDoc, getDocFromServer, waitForPendingWrites } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";
import { findUserIdByEmail } from "./users";
import { normalizeEmail } from "../utils";
import { buildNotificationActor, emitNotificationEvent } from "./notification-events";
import {
  dismissNotification,
  dismissNotificationsByResource,
  deleteNotification,
  groupInviteNotificationId,
  groupInviteLegacyNotificationId,
} from "./notifications";

// Collection references
export const questingGroupsRef = () => collection(db, "questingGroups");

export const questingGroupRef = (groupId) => doc(db, "questingGroups", groupId);

// Query for groups user is a member of
export const userGroupsByIdQuery = (userId) =>
  query(
    questingGroupsRef(),
    where("memberIds", "array-contains", userId)
  );

// Query for groups user is invited to
export const userPendingInvitesQuery = (userEmail) =>
  query(
    questingGroupsRef(),
    where("pendingInvites", "array-contains", userEmail)
  );

// Default group colors
export const GROUP_COLORS = [
  "#7C3AED", // Purple
  "#2563EB", // Blue
  "#0891B2", // Cyan
  "#059669", // Emerald
  "#CA8A04", // Yellow
  "#EA580C", // Orange
  "#DC2626", // Red
  "#DB2777", // Pink
  "#6366F1", // Indigo
  "#14B8A6", // Teal
];

// Get a default color based on index
export function getDefaultGroupColor(index) {
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

// Create a new questing group
export async function createQuestingGroup({ name, creatorId, creatorEmail, memberManaged = false }) {
  const groupId = crypto.randomUUID();
  const ref = questingGroupRef(groupId);
  const normalizedEmail = normalizeEmail(creatorEmail);
  if (!normalizedEmail) {
    throw new Error("Missing creator email.");
  }

  await setDoc(ref, {
    name,
    creatorId,
    creatorEmail: normalizedEmail,
    memberManaged,
    memberIds: [creatorId],
    pendingInvites: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return groupId;
}

// Update group settings
export async function updateQuestingGroup(groupId, updates) {
  const ref = questingGroupRef(groupId);
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

// Invite a member to the group
export async function inviteMemberToGroup(
  groupId,
  groupName,
  inviterEmail,
  inviteeEmail,
  inviteeUserId = null,
  inviterUserId = null
) {
  const normalizedInvitee = normalizeEmail(inviteeEmail);
  if (!normalizedInvitee) {
    throw new Error("Missing invitee email.");
  }
  const functions = getFunctions();
  const sendGroupInvite = httpsCallable(functions, "sendGroupInvite");
  const response = await sendGroupInvite({
    groupId,
    inviteeEmail: normalizedInvitee,
  });
  const result = response.data || {};
  if (!result.added) {
    if (result.reason === "blocked") {
      return { suppressed: true };
    }
    if (result.reason === "member" || result.reason === "pending") {
      throw new Error("This person is already a member or has a pending invite.");
    }
    throw new Error("Unable to send group invite.");
  }

}

// Accept group invitation
export async function acceptGroupInvitation(groupId, userEmail, userId = null) {
  const ref = questingGroupRef(groupId);
  const normalizedEmail = normalizeEmail(userEmail);
  if (!normalizedEmail) {
    throw new Error("Missing email for group invitation.");
  }
  const resolvedUserId = userId || (await findUserIdByEmail(normalizedEmail));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Questing group not found.");
  }
  const data = snap.data() || {};
  const inviteMeta = data.pendingInviteMeta?.[normalizedEmail] || {};
  const inviterEmail = inviteMeta.invitedByEmail || data.creatorEmail || "Unknown";
  let inviterUserId = inviteMeta.invitedByUserId || null;
  if (!inviterUserId && inviterEmail) {
    inviterUserId = await findUserIdByEmail(inviterEmail);
  }

  const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];
  const nextMemberIds = resolvedUserId
    ? Array.from(new Set([...memberIds, resolvedUserId]))
    : memberIds;
  const currentPendingInvites = Array.isArray(data.pendingInvites) ? data.pendingInvites : [];
  const nextPendingInvites = currentPendingInvites.filter(
    (email) => normalizeEmail(email) !== normalizedEmail
  );
  const currentInviteMeta = data.pendingInviteMeta && typeof data.pendingInviteMeta === "object"
    ? { ...data.pendingInviteMeta }
    : {};
  Object.keys(currentInviteMeta).forEach((key) => {
    if (normalizeEmail(key) === normalizedEmail) {
      delete currentInviteMeta[key];
    }
  });

  await updateDoc(ref, {
    ...(resolvedUserId ? { memberIds: nextMemberIds } : {}),
    pendingInvites: nextPendingInvites,
    pendingInviteMeta: currentInviteMeta,
    updatedAt: serverTimestamp(),
  });
  await waitForPendingWrites(db);
  try {
    const verifyAcceptSnap = await getDocFromServer(ref);
    if (verifyAcceptSnap?.exists?.()) {
      const verifyData = verifyAcceptSnap.data() || {};
      const verifyPending = Array.isArray(verifyData.pendingInvites)
        ? verifyData.pendingInvites.map((email) => normalizeEmail(email))
        : [];
      if (verifyPending.includes(normalizedEmail)) {
        throw new Error("Failed to accept group invite. Please try again.");
      }
    }
  } catch (err) {
    console.warn("Unable to confirm group invite acceptance:", err);
  }

  if (resolvedUserId) {
    await emitNotificationEvent({
      eventType: "GROUP_INVITE_ACCEPTED",
      resource: { type: "group", id: groupId, title: data.name || "Questing Group" },
      actor: buildNotificationActor({ uid: resolvedUserId, email: normalizedEmail }),
      payload: {
        groupId,
        groupName: data.name || "Questing Group",
        memberEmail: normalizedEmail,
        memberUserId: resolvedUserId,
      },
      recipients: {
        userIds: inviterUserId ? [inviterUserId] : [],
        emails: [],
      },
    });
  }

  if (resolvedUserId) {
    try {
      const ids = [
        groupInviteNotificationId(groupId, normalizedEmail),
        groupInviteLegacyNotificationId(groupId),
      ].filter(Boolean);
      await Promise.allSettled(ids.map((id) => dismissNotification(resolvedUserId, id)));
      await dismissNotificationsByResource(resolvedUserId, groupId, [
        "GROUP_INVITE_SENT",
        "GROUP_INVITE",
      ]);
      await Promise.allSettled(ids.map((id) => deleteNotification(resolvedUserId, id)));
      await waitForPendingWrites(db);
    } catch (err) {
      console.warn("Failed to dismiss group invite notification:", err);
    }
  }
}

// Decline group invitation
export async function declineGroupInvitation(groupId, userEmail, userId = null) {
  const ref = questingGroupRef(groupId);
  const normalizedEmail = normalizeEmail(userEmail);
  if (!normalizedEmail) {
    throw new Error("Missing email for group invitation.");
  }
  const resolvedUserId = userId || (await findUserIdByEmail(normalizedEmail));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Questing group not found.");
  }
  const data = snap.data() || {};
  const currentPendingInvites = Array.isArray(data.pendingInvites) ? data.pendingInvites : [];
  const nextPendingInvites = currentPendingInvites.filter(
    (email) => normalizeEmail(email) !== normalizedEmail
  );
  const currentInviteMeta = data.pendingInviteMeta && typeof data.pendingInviteMeta === "object"
    ? { ...data.pendingInviteMeta }
    : {};
  Object.keys(currentInviteMeta).forEach((key) => {
    if (normalizeEmail(key) === normalizedEmail) {
      delete currentInviteMeta[key];
    }
  });

  await updateDoc(ref, {
    memberIds: Array.isArray(data.memberIds) ? data.memberIds : [],
    pendingInvites: nextPendingInvites,
    pendingInviteMeta: currentInviteMeta,
    updatedAt: serverTimestamp(),
  });
  await waitForPendingWrites(db);
  try {
    const verifyDeclineSnap = await getDocFromServer(ref);
    if (verifyDeclineSnap?.exists?.()) {
      const verifyData = verifyDeclineSnap.data() || {};
      const verifyPending = Array.isArray(verifyData.pendingInvites)
        ? verifyData.pendingInvites.map((email) => normalizeEmail(email))
        : [];
      if (verifyPending.includes(normalizedEmail)) {
        throw new Error("Failed to decline group invite. Please try again.");
      }
    }
  } catch (err) {
    console.warn("Unable to confirm group invite decline:", err);
  }

  if (resolvedUserId) {
    await emitNotificationEvent({
      eventType: "GROUP_INVITE_DECLINED",
      resource: { type: "group", id: groupId, title: "Questing Group" },
      actor: buildNotificationActor({ uid: resolvedUserId, email: normalizedEmail }),
      payload: {
        groupId,
        memberEmail: normalizedEmail,
        memberUserId: resolvedUserId,
      },
      recipients: {
        userIds: [],
        emails: [],
      },
    });
  }

  if (resolvedUserId) {
    try {
      const ids = [
        groupInviteNotificationId(groupId, normalizedEmail),
        groupInviteLegacyNotificationId(groupId),
      ].filter(Boolean);
      await Promise.allSettled(ids.map((id) => dismissNotification(resolvedUserId, id)));
      await dismissNotificationsByResource(resolvedUserId, groupId, [
        "GROUP_INVITE_SENT",
        "GROUP_INVITE",
      ]);
      await Promise.allSettled(ids.map((id) => deleteNotification(resolvedUserId, id)));
      await waitForPendingWrites(db);
    } catch (err) {
      console.warn("Failed to dismiss group invite notification:", err);
    }
  }
}

export async function revokeGroupInvite(groupId, inviteeEmail) {
  const functions = getFunctions();
  const revokeInvite = httpsCallable(functions, "revokeGroupInvite");
  await revokeInvite({
    groupId,
    inviteeEmail: normalizeEmail(inviteeEmail),
  });
}

// Remove a member from the group
export async function removeMemberFromGroup(
  groupId,
  groupName,
  memberEmail,
  memberUserId = null,
  actor = null
) {
  const ref = questingGroupRef(groupId);
  const normalizedMemberEmail = normalizeEmail(memberEmail) || memberEmail || null;
  const resolvedMemberId =
    memberUserId || (normalizedMemberEmail ? await findUserIdByEmail(normalizedMemberEmail) : null);

  await updateDoc(ref, {
    ...(resolvedMemberId ? { memberIds: arrayRemove(resolvedMemberId) } : {}),
    updatedAt: serverTimestamp(),
  });

  if (resolvedMemberId && actor?.uid) {
    await emitNotificationEvent({
      eventType: "GROUP_MEMBER_REMOVED",
      resource: { type: "group", id: groupId, title: groupName || "Questing Group" },
      actor: buildNotificationActor(actor),
      payload: {
        groupId,
        groupName,
        memberEmail: normalizedMemberEmail,
        memberUserId: resolvedMemberId,
      },
      recipients: {
        userIds: [resolvedMemberId],
        emails: [],
      },
    });
  }

  // Also remove them from any polls that use this group
  // This is handled separately by the caller to show proper confirmation
}

// Leave a group (self-removal)
export async function leaveGroup(groupId, userEmail, userId = null, actor = null) {
  const ref = questingGroupRef(groupId);
  const normalizedEmail = normalizeEmail(userEmail) || userEmail || null;
  let groupData = null;
  if (userId && actor?.uid) {
    const groupSnap = await getDoc(ref);
    if (groupSnap.exists()) {
      groupData = groupSnap.data() || null;
    }
  }

  await updateDoc(ref, {
    ...(userId ? { memberIds: arrayRemove(userId) } : {}),
    updatedAt: serverTimestamp(),
  });

  if (groupData?.creatorId && groupData.creatorId !== userId && actor?.uid) {
    await emitNotificationEvent({
      eventType: "GROUP_MEMBER_LEFT",
      resource: { type: "group", id: groupId, title: groupData.name || "Questing Group" },
      actor: buildNotificationActor(actor),
      payload: {
        groupId,
        groupName: groupData.name || "Questing Group",
        memberEmail: normalizedEmail,
        memberUserId: userId,
      },
      recipients: {
        userIds: [groupData.creatorId],
        emails: [],
      },
    });
  }
}

// Delete a group
export async function deleteQuestingGroup(groupId) {
  const ref = questingGroupRef(groupId);
  await deleteDoc(ref);
}

// Get polls that use a specific group
export async function getPollsUsingGroup(groupId) {
  const pollsQuery = query(
    collection(db, "schedulers"),
    where("questingGroupId", "==", groupId)
  );

  const snapshot = await getDocs(pollsQuery);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

// Remove member from all polls that use a group
export async function removeMemberFromGroupPolls(groupId, memberEmail) {
  const functions = getFunctions();
  const cleanupPolls = httpsCallable(functions, "removeGroupMemberFromPolls");
  await cleanupPolls({
    groupId,
    memberEmail: normalizeEmail(memberEmail),
  });
}
