import { useMemo, useCallback } from "react";
import { useAuth } from "../app/AuthProvider";
import { useFirestoreCollection } from "./useFirestoreCollection";
import {
  blockedUsersQuery,
  blockUserByIdentifier,
  unblockUserByIdentifier,
} from "../lib/data/blocks";

export function useBlockedUsers() {
  const { user } = useAuth();

  const blockedRef = useMemo(() => {
    if (!user?.uid) return null;
    return blockedUsersQuery(user.uid);
  }, [user?.uid]);

  const blockedUsers = useFirestoreCollection(blockedRef);

  const blockUser = useCallback(async (identifier) => {
    if (!identifier) return;
    return blockUserByIdentifier(identifier);
  }, []);

  const unblockUser = useCallback(async (identifier) => {
    if (!identifier) return;
    return unblockUserByIdentifier(identifier);
  }, []);

  return {
    blockedUsers: blockedUsers.data,
    loading: blockedUsers.loading,
    blockUser,
    unblockUser,
  };
}
