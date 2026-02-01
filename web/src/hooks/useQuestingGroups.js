import { useMemo, useCallback } from "react";
import { setGroupColor as persistGroupColor, userSettingsRef } from "../lib/data/settings";
import { useAuth } from "../app/useAuth";
import { useFirestoreCollection } from "./useFirestoreCollection";
import { useFirestoreDoc } from "./useFirestoreDoc";
import { useUserProfilesByIds } from "./useUserProfiles";
import { findUserIdByEmail } from "../lib/data/users";
import { useFriends } from "./useFriends";
import { createFriendRequest } from "../lib/data/friends";
import { resolveIdentifier } from "../lib/identifiers";
import { normalizeEmail } from "../lib/utils";
import {
  userGroupsByIdQuery,
  userPendingInvitesQuery,
  createQuestingGroup,
  updateQuestingGroup,
  inviteMemberToGroup,
  acceptGroupInvitation,
  declineGroupInvitation,
  revokeGroupInvite,
  removeMemberFromGroup,
  leaveGroup,
  deleteQuestingGroup,
  removeMemberFromGroupPolls,
  GROUP_COLORS,
  getDefaultGroupColor,
} from "../lib/data/questingGroups";

export function useQuestingGroups() {
  const { user } = useAuth();
  const { friends } = useFriends();
  const userId = user?.uid || null;
  const userEmail = user?.email || null;
  const userEmailLower = normalizeEmail(userEmail) || null;
  const userDisplayName = user?.displayName || null;

  // Query for groups user is a member of
  const groupsByIdQueryRef = useMemo(() => {
    if (!userId) return null;
    return userGroupsByIdQuery(userId);
  }, [userId]);

  // Query for pending invitations
  const invitesQueryRef = useMemo(() => {
    if (!userEmailLower) return null;
    return userPendingInvitesQuery(userEmailLower);
  }, [userEmailLower]);

  // Get user settings for group colors
  const userRef = useMemo(() => userSettingsRef(userId), [userId]);
  const { data: userData } = useFirestoreDoc(userRef);

  const groupsById = useFirestoreCollection(groupsByIdQueryRef);
  const rawGroups = useMemo(() => groupsById.data, [groupsById.data]);
  const { data: pendingInvites, loading: invitesLoading } = useFirestoreCollection(invitesQueryRef);

  const loading = groupsById.loading || invitesLoading;
  const groupMemberIds = useMemo(() => {
    const set = new Set();
    rawGroups.forEach((group) => {
      (group.memberIds || []).forEach((id) => {
        if (id) set.add(id);
      });
    });
    return Array.from(set);
  }, [rawGroups]);
  const { profiles: memberProfiles } = useUserProfilesByIds(groupMemberIds);
  const groups = useMemo(() => {
    return rawGroups.map((group) => {
      const ids = Array.isArray(group.memberIds) ? group.memberIds : [];
      const profiles = ids.map((id) => memberProfiles[id]).filter(Boolean);
      const derivedEmails = profiles.map((profile) => profile.email).filter(Boolean);
      const members = derivedEmails.length ? derivedEmails : (group.members || []);
      return {
        ...group,
        memberProfiles: profiles,
        members,
      };
    });
  }, [rawGroups, memberProfiles]);
  const friendSet = useMemo(() => {
    const normalized = (friends || []).map((email) => normalizeEmail(email)).filter(Boolean);
    return new Set(normalized);
  }, [friends]);


  // Get group colors from user settings
  const groupColors = useMemo(() => userData?.groupColors || {}, [userData?.groupColors]);

  // Get color for a specific group
  const getGroupColor = useCallback(
    (groupId) => {
      if (groupColors[groupId]) {
        return groupColors[groupId];
      }
      // Return a default color based on group index
      const groupIndex = groups.findIndex((g) => g.id === groupId);
      return getDefaultGroupColor(groupIndex >= 0 ? groupIndex : 0);
    },
    [groupColors, groups]
  );

  // Set color for a group
  const setGroupColor = useCallback(
    async (groupId, color) => {
      return persistGroupColor(userId, groupColors, groupId, color);
    },
    [userId, groupColors]
  );

  // Create a new group
  const createGroup = useCallback(
    async (name, memberManaged = false) => {
      if (!userId || !userEmail) return null;
      return createQuestingGroup({
        name,
        creatorId: userId,
        creatorEmail: userEmail,
        memberManaged,
      });
    },
    [userId, userEmail]
  );

  // Update group settings
  const updateGroup = useCallback(async (groupId, updates) => {
    await updateQuestingGroup(groupId, updates);
  }, []);

  // Invite a member (also sends email notification)
  const inviteMember = useCallback(
    async (groupId, groupName, inviteeIdentifier, { sendFriendInvite = false } = {}) => {
      if (!userEmail) return;
      const resolved = await resolveIdentifier(inviteeIdentifier);
      const normalizedInvitee = normalizeEmail(resolved.email);
      if (!normalizedInvitee) {
        throw new Error("Enter a valid email or Discord username.");
      }
      const shouldSendFriendInvite = sendFriendInvite && !friendSet.has(normalizedInvitee);

      await inviteMemberToGroup(
        groupId,
        groupName,
        userEmail,
        normalizedInvitee,
        resolved.userId || null,
        userId
      );

      if (shouldSendFriendInvite) {
        try {
          await createFriendRequest(
            {
              fromUserId: userId,
              fromEmail: userEmail,
              toEmail: normalizedInvitee,
              fromDisplayName: userDisplayName,
            },
            { sendEmail: false }
          );
        } catch (err) {
          console.warn("Failed to send friend request with group invite:", err);
        }
      }
    },
    [userEmail, userId, userDisplayName, friendSet]
  );

  // Accept invitation
  const acceptInvite = useCallback(
    async (groupId) => {
      if (!userEmail) return;
      await acceptGroupInvitation(groupId, userEmail, userId);
    },
    [userEmail, userId]
  );

  // Decline invitation
  const declineInvite = useCallback(
    async (groupId) => {
      if (!userEmail) return;
      await declineGroupInvitation(groupId, userEmail, userId);
    },
    [userEmail, userId]
  );

  // Remove a member (also removes from polls)
  const removeMember = useCallback(
    async (groupId, groupName, memberEmail, removeFromPolls = true) => {
      const memberUserId = await findUserIdByEmail(memberEmail);
      await removeMemberFromGroup(groupId, groupName, memberEmail, memberUserId, user);

      if (removeFromPolls) {
        await removeMemberFromGroupPolls(groupId, memberEmail);
      }
    },
    [user]
  );

  // Leave a group
  const leave = useCallback(
    async (groupId) => {
      if (!userEmail) return;
      await leaveGroup(groupId, userEmail, userId, user);
      await removeMemberFromGroupPolls(groupId, userEmail);
    },
    [user, userEmail, userId]
  );

  // Delete a group
  const deleteGroup = useCallback(async (groupId) => {
    await deleteQuestingGroup(groupId);
  }, []);

  const revokeInvite = useCallback(
    async (groupId, inviteeEmail) => {
      if (!userId) return;
      await revokeGroupInvite(groupId, inviteeEmail);
    },
    [userId]
  );

  // Check if user is owner of a group
  const isOwner = useCallback(
    (group) => {
      return group?.creatorId === userId;
    },
    [userId]
  );

  // Check if user can manage a group (owner or member-managed)
  const canManage = useCallback(
    (group) => {
      if (!group || !userId) return false;
      return group.creatorId === userId ||
        (group.memberManaged && group.memberIds?.includes(userId));
    },
    [userId]
  );

  return {
    groups,
    pendingInvites,
    loading,
    groupColors,
    getGroupColor,
    setGroupColor,
    createGroup,
    updateGroup,
    inviteMember,
    acceptInvite,
    declineInvite,
    removeMember,
    revokeInvite,
    leave,
    deleteGroup,
    isOwner,
    canManage,
    GROUP_COLORS,
  };
}
