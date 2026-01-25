import { useEffect, useMemo } from "react";
import { useAuth } from "../app/AuthProvider";
import { useFirestoreCollection } from "./useFirestoreCollection";
import { incomingFriendRequestsQuery } from "../lib/data/friends";
import { userPendingInvitesQuery } from "../lib/data/questingGroups";
import { pollPendingInvitesQuery } from "../lib/data/pollInvites";
import { ensureFriendRequestNotification, ensureGroupInviteNotification, ensurePollInviteNotification } from "../lib/data/notifications";

export function useNotificationSync() {
  const { user } = useAuth();

  const incomingRequestsRef = useMemo(() => {
    if (!user?.email) return null;
    return incomingFriendRequestsQuery(user.email.toLowerCase());
  }, [user?.email]);

  const pendingGroupsRef = useMemo(() => {
    if (!user?.email) return null;
    return userPendingInvitesQuery(user.email.toLowerCase());
  }, [user?.email]);

  const pendingPollsRef = useMemo(() => {
    if (!user?.email) return null;
    return pollPendingInvitesQuery(user.email.toLowerCase());
  }, [user?.email]);

  const incomingRequests = useFirestoreCollection(incomingRequestsRef);
  const pendingGroups = useFirestoreCollection(pendingGroupsRef);
  const pendingPolls = useFirestoreCollection(pendingPollsRef);

  useEffect(() => {
    if (!user?.uid || incomingRequests.data.length === 0) return;
    Promise.all(
      incomingRequests.data.map((request) => {
        if (!request?.id) return null;
        return ensureFriendRequestNotification(user.uid, {
          requestId: request.id,
          fromEmail: request.fromEmail || "Unknown",
        });
      })
    ).catch((err) => {
      console.error("Failed to sync friend request notifications:", err);
    });
  }, [user?.uid, incomingRequests.data]);

  useEffect(() => {
    if (!user?.uid || pendingGroups.data.length === 0) return;
    pendingGroups.data.forEach((group) => {
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
  }, [user?.uid, user?.email, pendingGroups.data]);

  useEffect(() => {
    if (!user?.uid || pendingPolls.data.length === 0) return;
    pendingPolls.data.forEach((poll) => {
      if (!poll?.id) return;
      const inviteMeta = poll.pendingInviteMeta?.[user.email?.toLowerCase?.() || ""] || {};
      ensurePollInviteNotification(user.uid, {
        schedulerId: poll.id,
        schedulerTitle: poll.title || "Session Poll",
        inviterEmail: inviteMeta.invitedByEmail || poll.creatorEmail || "Unknown",
      }).catch((err) => {
        console.error("Failed to sync poll invite notification:", err);
      });
    });
  }, [user?.uid, user?.email, pendingPolls.data]);
}
