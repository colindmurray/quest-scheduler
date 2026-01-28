import { useMemo, useCallback } from "react";
import { useAuth } from "../app/useAuth";
import { useFirestoreCollection } from "./useFirestoreCollection";
import {
  blockedUsersQuery,
  blockUserByIdentifier,
  unblockUserByIdentifier,
} from "../lib/data/blocks";

export function useBlockedUsers() {
  const { user } = useAuth();
  const userId = user?.uid || null;

  const blockedRef = useMemo(() => {
    if (!userId) return null;
    return blockedUsersQuery(userId);
  }, [userId]);

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
