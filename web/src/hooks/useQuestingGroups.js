import { useMemo, useCallback, useEffect } from "react";
import { doc, setDoc, serverTimestamp, collection } from "firebase/firestore";
import { useAuth } from "../app/AuthProvider";
import { useFirestoreCollection } from "./useFirestoreCollection";
import { useFirestoreDoc } from "./useFirestoreDoc";
import { useUserProfilesByIds } from "./useUserProfiles";
import { db } from "../lib/firebase";
import { findUserIdByEmail } from "../lib/data/users";
import { ensureGroupInviteNotification } from "../lib/data/notifications";
import { useFriends } from "./useFriends";
import { APP_URL } from "../lib/config";
import { createEmailMessage } from "../lib/emailTemplates";
import { createFriendRequest } from "../lib/data/friends";
import { resolveIdentifier } from "../lib/identifiers";
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

  // Query for groups user is a member of
  const groupsByIdQueryRef = useMemo(() => {
    if (!user?.uid) return null;
    return userGroupsByIdQuery(user.uid);
  }, [user?.uid]);

  // Query for pending invitations
  const invitesQueryRef = useMemo(() => {
    if (!user?.email) return null;
    return userPendingInvitesQuery(user.email.toLowerCase());
  }, [user?.email]);

  // Get user settings for group colors
  const userRef = useMemo(() => (user ? doc(db, "users", user.uid) : null), [user]);
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
  const friendSet = useMemo(
    () => new Set((friends || []).map((email) => email.toLowerCase())),
    [friends]
  );

  useEffect(() => {
    if (!user?.uid || pendingInvites.length === 0) return;
    pendingInvites.forEach((group) => {
      if (!group?.id) return;
      const inviteMeta = group.pendingInviteMeta?.[user.email?.toLowerCase?.() || ""] || {};
      ensureGroupInviteNotification(user.uid, {
        groupId: group.id,
        groupName: group.name || "Questing Group",
        inviterEmail: inviteMeta.invitedByEmail || group.creatorEmail || "Unknown",
      }).catch((err) => {
        console.error("Failed to sync group invite notification:", err);
      });
    });
  }, [user?.uid, user?.email, pendingInvites]);

  // Get group colors from user settings
  const groupColors = userData?.groupColors || {};

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
      if (!userRef) return;
      await setDoc(
        userRef,
        {
          groupColors: {
            ...groupColors,
            [groupId]: color,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [userRef, groupColors]
  );

  // Create a new group
  const createGroup = useCallback(
    async (name, memberManaged = false) => {
      if (!user?.uid || !user?.email) return null;
      return createQuestingGroup({
        name,
        creatorId: user.uid,
        creatorEmail: user.email,
        memberManaged,
      });
    },
    [user?.uid, user?.email]
  );

  // Update group settings
  const updateGroup = useCallback(async (groupId, updates) => {
    await updateQuestingGroup(groupId, updates);
  }, []);

  // Invite a member (also sends email notification)
  const inviteMember = useCallback(
    async (groupId, groupName, inviteeIdentifier, { sendFriendInvite = false } = {}) => {
      if (!user?.email) return;
      const resolved = await resolveIdentifier(inviteeIdentifier);
      const normalizedInvitee = resolved.email.toLowerCase();
      const shouldSendFriendInvite = sendFriendInvite && !friendSet.has(normalizedInvitee);

      await inviteMemberToGroup(
        groupId,
        groupName,
        user.email,
        normalizedInvitee,
        resolved.userId || null,
        user.uid
      );

      // Send email notification
      const inviteUrl = `${APP_URL}/friends?tab=groups`;
      const message = createEmailMessage({
        subject: `You've been invited to join "${groupName}"`,
        title: "Questing Group Invitation",
        intro: `${user.email} invited you to join the questing group "${groupName}".`,
        ctaLabel: "View invite",
        ctaUrl: inviteUrl,
        extraLines: ["Log in to accept or decline this invitation."],
      });
      try {
        await setDoc(doc(collection(db, "mail")), {
          to: normalizedInvitee,
          message,
        });
      } catch (err) {
        console.warn("Failed to queue group invite email:", err);
      }

      if (shouldSendFriendInvite) {
        try {
          await createFriendRequest(
            {
              fromUserId: user.uid,
              fromEmail: user.email,
              toEmail: normalizedInvitee,
              fromDisplayName: user.displayName || null,
            },
            { sendEmail: false }
          );
        } catch (err) {
          console.warn("Failed to send friend request with group invite:", err);
        }
      }
    },
    [user?.email, user?.uid, user?.displayName, friendSet]
  );

  // Accept invitation
  const acceptInvite = useCallback(
    async (groupId) => {
      if (!user?.email) return;
      await acceptGroupInvitation(groupId, user.email, user.uid);
    },
    [user?.email, user?.uid]
  );

  // Decline invitation
  const declineInvite = useCallback(
    async (groupId) => {
      if (!user?.email) return;
      await declineGroupInvitation(groupId, user.email, user.uid);
    },
    [user?.email, user?.uid]
  );

  // Remove a member (also removes from polls)
  const removeMember = useCallback(
    async (groupId, groupName, memberEmail, removeFromPolls = true) => {
      const memberUserId = await findUserIdByEmail(memberEmail);
      await removeMemberFromGroup(groupId, groupName, memberEmail, memberUserId);

      if (removeFromPolls) {
        await removeMemberFromGroupPolls(groupId, memberEmail);
      }
    },
    []
  );

  // Leave a group
  const leave = useCallback(
    async (groupId) => {
      if (!user?.email) return;
      await leaveGroup(groupId, user.email, user.uid);
      await removeMemberFromGroupPolls(groupId, user.email);
    },
    [user?.email, user?.uid]
  );

  // Delete a group
  const deleteGroup = useCallback(async (groupId) => {
    await deleteQuestingGroup(groupId);
  }, []);

  const revokeInvite = useCallback(
    async (groupId, inviteeEmail) => {
      if (!user?.uid) return;
      await revokeGroupInvite(groupId, inviteeEmail);
    },
    [user?.uid]
  );

  // Check if user is owner of a group
  const isOwner = useCallback(
    (group) => {
      return group?.creatorId === user?.uid;
    },
    [user?.uid]
  );

  // Check if user can manage a group (owner or member-managed)
  const canManage = useCallback(
    (group) => {
      if (!group || !user?.uid) return false;
      return group.creatorId === user.uid ||
        (group.memberManaged && group.memberIds?.includes(user.uid));
    },
    [user?.uid, user?.email]
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
