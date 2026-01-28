import { collection, doc, query, where, serverTimestamp, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, getDocs, getDoc, deleteField } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";
import { createGroupInviteNotification, createGroupMemberChangeNotification, createGroupInviteAcceptedNotification, groupInviteNotificationId, deleteNotification } from "./notifications";
import { findUserIdByEmail } from "./users";

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
  const normalizedEmail = creatorEmail.toLowerCase();

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
  const normalizedInvitee = inviteeEmail.toLowerCase();
  const functions = getFunctions();
  const sendGroupInvite = httpsCallable(functions, "sendGroupInvite");
  const response = await sendGroupInvite({
    groupId,
    inviteeEmail: normalizedInvitee,
  });
  const result = response.data || {};
  if (!result.added) {
    if (result.reason === "blocked") {
      throw new Error("This user is not accepting new invites from you.");
    }
    if (result.reason === "member" || result.reason === "pending") {
      throw new Error("This person is already a member or has a pending invite.");
    }
    throw new Error("Unable to send group invite.");
  }

  const resolvedUserId = result.inviteeUserId || inviteeUserId || null;

  // Create in-app notification if we have the user ID
  if (resolvedUserId) {
    try {
      await createGroupInviteNotification(resolvedUserId, {
        groupId,
        groupName,
        inviterEmail,
        inviterUserId,
      });
    } catch (err) {
      console.warn("Failed to create group invite notification:", err);
    }
  }

  // Email will be sent via the mail collection (handled by caller)
}

// Accept group invitation
export async function acceptGroupInvitation(groupId, userEmail, userId = null) {
  const ref = questingGroupRef(groupId);
  const normalizedEmail = userEmail.toLowerCase();
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

  await updateDoc(ref, {
    ...(userId ? { memberIds: arrayUnion(userId) } : {}),
    pendingInvites: arrayRemove(normalizedEmail),
    [`pendingInviteMeta.${normalizedEmail}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });

  if (userId) {
    await deleteNotification(userId, groupInviteNotificationId(groupId));
  }

  if (inviterUserId) {
    await createGroupInviteAcceptedNotification(inviterUserId, {
      groupId,
      groupName: data.name || "Questing Group",
      memberEmail: normalizedEmail,
      memberUserId: userId,
    });
  }
}

// Decline group invitation
export async function declineGroupInvitation(groupId, userEmail, userId = null) {
  const ref = questingGroupRef(groupId);
  const normalizedEmail = userEmail.toLowerCase();

  await updateDoc(ref, {
    pendingInvites: arrayRemove(normalizedEmail),
    [`pendingInviteMeta.${normalizedEmail}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });

  if (userId) {
    await deleteNotification(userId, groupInviteNotificationId(groupId));
  }
}

export async function revokeGroupInvite(groupId, inviteeEmail, inviteeUserId = null) {
  const functions = getFunctions();
  const revokeInvite = httpsCallable(functions, "revokeGroupInvite");
  await revokeInvite({
    groupId,
    inviteeEmail: inviteeEmail.toLowerCase(),
  });
}

// Remove a member from the group
export async function removeMemberFromGroup(groupId, groupName, memberEmail, memberUserId = null) {
  const ref = questingGroupRef(groupId);

  await updateDoc(ref, {
    ...(memberUserId ? { memberIds: arrayRemove(memberUserId) } : {}),
    updatedAt: serverTimestamp(),
  });

  // Create notification for removed member
  if (memberUserId) {
    await createGroupMemberChangeNotification(memberUserId, {
      groupId,
      groupName,
      action: "removed",
    });
  }

  // Also remove them from any polls that use this group
  // This is handled separately by the caller to show proper confirmation
}

// Leave a group (self-removal)
export async function leaveGroup(groupId, userEmail, userId = null) {
  const ref = questingGroupRef(groupId);

  await updateDoc(ref, {
    ...(userId ? { memberIds: arrayRemove(userId) } : {}),
    updatedAt: serverTimestamp(),
  });
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
    memberEmail: memberEmail.toLowerCase(),
  });
}
