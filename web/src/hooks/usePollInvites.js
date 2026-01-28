import { useCallback, useMemo } from "react";
import { useAuth } from "../app/useAuth";
import { useFirestoreCollection } from "./useFirestoreCollection";
import {
  acceptPollInvite,
  declinePollInvite,
  pollPendingInvitesQuery,
} from "../lib/data/pollInvites";

export function usePollInvites() {
  const { user } = useAuth();
  const userId = user?.uid || null;
  const userEmail = user?.email || null;
  const userEmailLower = userEmail ? userEmail.toLowerCase() : null;

  const pendingRef = useMemo(() => {
    if (!userEmailLower) return null;
    return pollPendingInvitesQuery(userEmailLower);
  }, [userEmailLower]);

  const pendingInvites = useFirestoreCollection(pendingRef);

  const acceptInvite = useCallback(
    async (schedulerId) => {
      if (!userEmail) return;
      return acceptPollInvite(schedulerId, userEmail, userId);
    },
    [userEmail, userId]
  );

  const declineInvite = useCallback(
    async (schedulerId) => {
      if (!userEmail) return;
      return declinePollInvite(schedulerId, userEmail, userId);
    },
    [userEmail, userId]
  );

  return {
    pendingInvites: pendingInvites.data,
    loading: pendingInvites.loading,
    acceptInvite,
    declineInvite,
  };
}
