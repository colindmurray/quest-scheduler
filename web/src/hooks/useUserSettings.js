import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useMemo, useCallback } from "react";
import { useAuth } from "../app/AuthProvider";
import { useFirestoreDoc } from "./useFirestoreDoc";
import { db } from "../lib/firebase";

export function useUserSettings() {
  const { user } = useAuth();
  const userRef = useMemo(() => (user ? doc(db, "users", user.uid) : null), [user]);
  const { data, loading } = useFirestoreDoc(userRef);

  const archivedPolls = useMemo(() => data?.archivedPolls || [], [data?.archivedPolls]);
  const groupColors = useMemo(() => data?.groupColors || {}, [data?.groupColors]);
  const calendarSyncPreference = data?.calendarSyncPreference || "poll";

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

  const setCalendarSyncPreference = useCallback(
    async (preference) => {
      if (!userRef) return;
      await setDoc(
        userRef,
        {
          calendarSyncPreference: preference,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [userRef]
  );

  const setGroupColor = useCallback(
    async (groupId, color) => {
      if (!userRef) return;
      await setDoc(
        userRef,
        {
          groupColors: {
            ...groupColors,
            [groupId]: color,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [userRef, groupColors]
  );

  return {
    loading,
    settings: data?.settings,
    timezone:
      data?.settings?.timezoneMode === "manual"
        ? data?.settings?.timezone
        : undefined,
    timezoneMode: data?.settings?.timezoneMode ?? "auto",
    archivedPolls,
    archivePoll,
    unarchivePoll,
    isArchived,
    groupColors,
    setGroupColor,
    calendarSyncPreference,
    setCalendarSyncPreference,
  };
}
