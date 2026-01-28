import { useEffect, useMemo } from "react";
import { useAuth } from "../app/useAuth";
import { useFirestoreCollection } from "./useFirestoreCollection";
import { incomingFriendRequestsQuery } from "../lib/data/friends";
import { userPendingInvitesQuery } from "../lib/data/questingGroups";
import { pollPendingInvitesQuery } from "../lib/data/pollInvites";
import { ensureFriendRequestNotification, ensureGroupInviteNotification, ensurePollInviteNotification } from "../lib/data/notifications";

export function useNotificationSync() {
  const { user } = useAuth();
  const userId = user?.uid || null;
  const userEmail = user?.email || null;
  const userEmailLower = userEmail ? userEmail.toLowerCase() : null;

  const incomingRequestsRef = useMemo(() => {
    if (!userEmailLower) return null;
    return incomingFriendRequestsQuery(userEmailLower);
  }, [userEmailLower]);

  const pendingGroupsRef = useMemo(() => {
    if (!userEmailLower) return null;
    return userPendingInvitesQuery(userEmailLower);
  }, [userEmailLower]);

  const pendingPollsRef = useMemo(() => {
    if (!userEmailLower) return null;
    return pollPendingInvitesQuery(userEmailLower);
  }, [userEmailLower]);

  const incomingRequests = useFirestoreCollection(incomingRequestsRef);
  const pendingGroups = useFirestoreCollection(pendingGroupsRef);
  const pendingPolls = useFirestoreCollection(pendingPollsRef);

  useEffect(() => {
    if (!userId || incomingRequests.data.length === 0) return;
    Promise.all(
      incomingRequests.data.map((request) => {
        if (!request?.id) return null;
        return ensureFriendRequestNotification(userId, {
          requestId: request.id,
          fromEmail: request.fromEmail || "Unknown",
        });
      })
    ).catch((err) => {
      console.error("Failed to sync friend request notifications:", err);
    });
  }, [userId, incomingRequests.data]);

  useEffect(() => {
    if (!userId || pendingGroups.data.length === 0) return;
    pendingGroups.data.forEach((group) => {
      if (!group?.id) return;
      const inviteMeta = group.pendingInviteMeta?.[userEmailLower || ""] || {};
      ensureGroupInviteNotification(userId, {
        groupId: group.id,
        groupName: group.name || "Questing Group",
        inviterEmail: inviteMeta.invitedByEmail || group.creatorEmail || "Unknown",
      }).catch((err) => {
        console.error("Failed to sync group invite notification:", err);
      });
    });
  }, [userId, userEmailLower, pendingGroups.data]);

  useEffect(() => {
    if (!userId || pendingPolls.data.length === 0) return;
    pendingPolls.data.forEach((poll) => {
      if (!poll?.id) return;
      const inviteMeta = poll.pendingInviteMeta?.[userEmailLower || ""] || {};
      ensurePollInviteNotification(userId, {
        schedulerId: poll.id,
        schedulerTitle: poll.title || "Session Poll",
        inviterEmail: inviteMeta.invitedByEmail || poll.creatorEmail || "Unknown",
      }).catch((err) => {
        console.error("Failed to sync poll invite notification:", err);
      });
    });
  }, [userId, userEmailLower, pendingPolls.data]);
}
