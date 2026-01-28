import { useMemo, useCallback, useEffect } from "react";
import { useAuth } from "../app/AuthProvider";
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

  const incomingRef = useMemo(() => {
    if (!user?.email) return null;
    return incomingFriendRequestsQuery(user.email.toLowerCase());
  }, [user?.email]);

  const outgoingRef = useMemo(() => {
    if (!user?.uid) return null;
    return outgoingFriendRequestsQuery(user.uid);
  }, [user?.uid]);

  const acceptedFromRef = useMemo(() => {
    if (!user?.email) return null;
    return acceptedFriendRequestsFromQuery(user.email.toLowerCase());
  }, [user?.email]);

  const acceptedToRef = useMemo(() => {
    if (!user?.email) return null;
    return acceptedFriendRequestsToQuery(user.email.toLowerCase());
  }, [user?.email]);

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
    if (!user?.uid || incoming.data.length === 0) return;
    syncFriendRequestNotifications(user.uid, incoming.data).catch((err) => {
      console.error("Failed to sync friend request notifications:", err);
    });
  }, [user?.uid, incoming.data]);

  const sendFriendRequest = useCallback(
    async (identifier) => {
      if (!user?.uid || !user?.email) return;
      return createFriendRequest({
        fromUserId: user.uid,
        fromEmail: user.email,
        toIdentifier: identifier,
        fromDisplayName: user.displayName,
      });
    },
    [user?.uid, user?.email, user?.displayName]
  );

  const acceptFriendRequestById = useCallback(
    async (requestId) => {
      if (!user?.uid || !user?.email) return;
      return acceptFriendRequest(requestId, {
        userId: user.uid,
        userEmail: user.email,
      });
    },
    [user?.uid, user?.email]
  );

  const declineFriendRequestById = useCallback(
    async (requestId) => {
      if (!user?.email) return;
      return declineFriendRequest(requestId, { userId: user.uid, userEmail: user.email });
    },
    [user?.email, user?.uid]
  );

  const removeFriendById = useCallback(
    async (requestId) => {
      if (!user?.email) return;
      return removeFriend(requestId, { userEmail: user.email });
    },
    [user?.email]
  );

  const getInviteCode = useCallback(async () => {
    if (!user?.uid) return null;
    return ensureFriendInviteCode({
      userId: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    });
  }, [user?.uid, user?.email, user?.displayName, user?.photoURL]);

  const acceptInviteLink = useCallback(
    async (inviteCode) => {
      if (!user?.uid || !user?.email) return null;
      return acceptFriendInviteLink(inviteCode, {
        userId: user.uid,
        userEmail: user.email,
      });
    },
    [user?.uid, user?.email]
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
