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

  /**
   * Get the default start time and duration for a given weekday (0-6, Sunday=0).
   * Handles both simple mode (same for all days) and per-day mode.
   * Also handles migration from old string format.
   */
  const getSessionDefaults = useCallback(
    (weekday) => {
      const settings = data?.settings;
      const globalDuration = settings?.defaultDurationMinutes ?? 240;

      // Check if we have the new defaultStartTimes format
      const startTimes = settings?.defaultStartTimes;
      if (startTimes && startTimes[weekday]) {
        const val = startTimes[weekday];
        if (typeof val === "string") {
          // Old format: just a time string - use global duration
          return { time: val, durationMinutes: globalDuration };
        } else if (val && typeof val === "object") {
          // New format: object with time and durationMinutes
          return {
            time: val.time || "18:00",
            durationMinutes: val.durationMinutes ?? globalDuration,
          };
        }
      }

      // Fallback: use simple mode settings or defaults
      const simpleTime = settings?.defaultStartTime ?? "18:00";
      return { time: simpleTime, durationMinutes: globalDuration };
    },
    [data?.settings]
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
    getSessionDefaults,
  };
}
