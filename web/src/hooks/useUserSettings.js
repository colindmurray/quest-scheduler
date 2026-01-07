import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useMemo, useCallback } from "react";
import { useAuth } from "../app/AuthProvider";
import { useFirestoreDoc } from "./useFirestoreDoc";
import { db } from "../lib/firebase";

export function useUserSettings() {
  const { user } = useAuth();
  const userRef = useMemo(() => (user ? doc(db, "users", user.uid) : null), [user]);
  const { data, loading } = useFirestoreDoc(userRef);

  const archivedPolls = data?.archivedPolls || [];

  const archivePoll = useCallback(
    async (pollId) => {
      if (!userRef || !pollId) return;
      const currentArchived = data?.archivedPolls || [];
      if (currentArchived.includes(pollId)) return;
      await setDoc(
        userRef,
        {
          archivedPolls: [...currentArchived, pollId],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [userRef, data?.archivedPolls]
  );

  const unarchivePoll = useCallback(
    async (pollId) => {
      if (!userRef || !pollId) return;
      const currentArchived = data?.archivedPolls || [];
      if (!currentArchived.includes(pollId)) return;
      await setDoc(
        userRef,
        {
          archivedPolls: currentArchived.filter((id) => id !== pollId),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [userRef, data?.archivedPolls]
  );

  const isArchived = useCallback(
    (pollId) => archivedPolls.includes(pollId),
    [archivedPolls]
  );

  return {
    loading,
    settings: data?.settings,
    addressBook: data?.addressBook || [],
    timezone:
      data?.settings?.timezoneMode === "manual"
        ? data?.settings?.timezone
        : undefined,
    timezoneMode: data?.settings?.timezoneMode ?? "auto",
    archivedPolls,
    archivePoll,
    unarchivePoll,
    isArchived,
  };
}
