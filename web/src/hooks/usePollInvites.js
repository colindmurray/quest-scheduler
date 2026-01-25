import { useCallback, useMemo } from "react";
import { useAuth } from "../app/AuthProvider";
import { useFirestoreCollection } from "./useFirestoreCollection";
import {
  acceptPollInvite,
  declinePollInvite,
  pollPendingInvitesQuery,
} from "../lib/data/pollInvites";

export function usePollInvites() {
  const { user } = useAuth();

  const pendingRef = useMemo(() => {
    if (!user?.email) return null;
    return pollPendingInvitesQuery(user.email.toLowerCase());
  }, [user?.email]);

  const pendingInvites = useFirestoreCollection(pendingRef);

  const acceptInvite = useCallback(
    async (schedulerId) => {
      if (!user?.email) return;
      return acceptPollInvite(schedulerId, user.email, user.uid);
    },
    [user?.email, user?.uid]
  );

  const declineInvite = useCallback(
    async (schedulerId) => {
      if (!user?.email) return;
      return declinePollInvite(schedulerId, user.email, user.uid);
    },
    [user?.email, user?.uid]
  );

  return {
    pendingInvites: pendingInvites.data,
    loading: pendingInvites.loading,
    acceptInvite,
    declineInvite,
  };
}
