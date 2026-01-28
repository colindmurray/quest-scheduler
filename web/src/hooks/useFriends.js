import { useMemo, useCallback, useEffect } from "react";
import { useAuth } from "../app/useAuth";
import { useFirestoreCollection } from "./useFirestoreCollection";
import {
  incomingFriendRequestsQuery,
  outgoingFriendRequestsQuery,
  acceptedFriendRequestsFromQuery,
  acceptedFriendRequestsToQuery,
  createFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  syncFriendRequestNotifications,
  ensureFriendInviteCode,
  acceptFriendInviteLink,
  removeFriend,
} from "../lib/data/friends";

export function useFriends() {
  const { user } = useAuth();
  const userId = user?.uid || null;
  const userEmail = user?.email || null;
  const userEmailLower = userEmail ? userEmail.toLowerCase() : null;
  const userDisplayName = user?.displayName || null;
  const userPhotoURL = user?.photoURL || null;

  const incomingRef = useMemo(() => {
    if (!userEmailLower) return null;
    return incomingFriendRequestsQuery(userEmailLower);
  }, [userEmailLower]);

  const outgoingRef = useMemo(() => {
    if (!userId) return null;
    return outgoingFriendRequestsQuery(userId);
  }, [userId]);

  const acceptedFromRef = useMemo(() => {
    if (!userEmailLower) return null;
    return acceptedFriendRequestsFromQuery(userEmailLower);
  }, [userEmailLower]);

  const acceptedToRef = useMemo(() => {
    if (!userEmailLower) return null;
    return acceptedFriendRequestsToQuery(userEmailLower);
  }, [userEmailLower]);

  const incoming = useFirestoreCollection(incomingRef);
  const outgoing = useFirestoreCollection(outgoingRef);
  const acceptedFrom = useFirestoreCollection(acceptedFromRef);
  const acceptedTo = useFirestoreCollection(acceptedToRef);

  const loading =
    incoming.loading || outgoing.loading || acceptedFrom.loading || acceptedTo.loading;

  const { friends, friendRequestMap } = useMemo(() => {
    const emails = new Set();
    const map = new Map();
    acceptedFrom.data.forEach((request) => {
      if (request?.toEmail) {
        emails.add(request.toEmail);
        map.set(request.toEmail, request.id);
      }
    });
    acceptedTo.data.forEach((request) => {
      if (request?.fromEmail) {
        emails.add(request.fromEmail);
        map.set(request.fromEmail, request.id);
      }
    });
    return { friends: Array.from(emails), friendRequestMap: map };
  }, [acceptedFrom.data, acceptedTo.data]);

  useEffect(() => {
    if (!userId || incoming.data.length === 0) return;
    syncFriendRequestNotifications(userId, incoming.data).catch((err) => {
      console.error("Failed to sync friend request notifications:", err);
    });
  }, [userId, incoming.data]);

  const sendFriendRequest = useCallback(
    async (identifier) => {
      if (!userId || !userEmail) return;
      return createFriendRequest({
        fromUserId: userId,
        fromEmail: userEmail,
        toIdentifier: identifier,
        fromDisplayName: userDisplayName,
      });
    },
    [userId, userEmail, userDisplayName]
  );

  const acceptFriendRequestById = useCallback(
    async (requestId) => {
      if (!userId || !userEmail) return;
      return acceptFriendRequest(requestId, {
        userId,
        userEmail,
      });
    },
    [userId, userEmail]
  );

  const declineFriendRequestById = useCallback(
    async (requestId) => {
      if (!userEmail) return;
      return declineFriendRequest(requestId, { userId, userEmail });
    },
    [userEmail, userId]
  );

  const removeFriendById = useCallback(
    async (requestId) => {
      if (!userEmail) return;
      return removeFriend(requestId, { userEmail });
    },
    [userEmail]
  );

  const getInviteCode = useCallback(async () => {
    if (!userId) return null;
    return ensureFriendInviteCode({
      userId,
      email: userEmail,
      displayName: userDisplayName,
      photoURL: userPhotoURL,
    });
  }, [userId, userEmail, userDisplayName, userPhotoURL]);

  const acceptInviteLink = useCallback(
    async (inviteCode) => {
      if (!userId || !userEmail) return null;
      return acceptFriendInviteLink(inviteCode, {
        userId,
        userEmail,
      });
    },
    [userId, userEmail]
  );

  return {
    friends,
    friendRequestMap,
    incomingRequests: incoming.data,
    outgoingRequests: outgoing.data,
    loading,
    sendFriendRequest,
    acceptFriendRequest: acceptFriendRequestById,
    declineFriendRequest: declineFriendRequestById,
    removeFriend: removeFriendById,
    getInviteCode,
    acceptInviteLink,
  };
}
