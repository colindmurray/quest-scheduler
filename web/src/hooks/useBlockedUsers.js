import { useMemo, useCallback } from "react";
import { useAuth } from "../app/AuthProvider";
import { useFirestoreCollection } from "./useFirestoreCollection";
import {
  blockedUsersQuery,
  blockUserByEmail,
  unblockUserByEmail,
} from "../lib/data/blocks";

export function useBlockedUsers() {
  const { user } = useAuth();

  const blockedRef = useMemo(() => {
    if (!user?.uid) return null;
    return blockedUsersQuery(user.uid);
  }, [user?.uid]);

  const blockedUsers = useFirestoreCollection(blockedRef);

  const blockUser = useCallback(async (email) => {
    if (!email) return;
    return blockUserByEmail(email);
  }, []);

  const unblockUser = useCallback(async (email) => {
    if (!email) return;
    return unblockUserByEmail(email);
  }, []);

  return {
    blockedUsers: blockedUsers.data,
    loading: blockedUsers.loading,
    blockUser,
    unblockUser,
  };
}
