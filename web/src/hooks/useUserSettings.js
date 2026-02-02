import { useMemo, useCallback } from "react";
import { useAuth } from "../app/useAuth";
import { useFirestoreDoc } from "./useFirestoreDoc";
import {
  userSettingsRef,
  addArchivedPoll,
  removeArchivedPoll,
  setCalendarSyncPreference as persistCalendarSyncPreference,
  setGroupColor as persistGroupColor,
} from "../lib/data/settings";

export function useUserSettings() {
  const { user } = useAuth();
  const userRef = useMemo(() => userSettingsRef(user?.uid || null), [user?.uid]);
  const { data, loading } = useFirestoreDoc(userRef);

  const archivedPolls = useMemo(() => data?.archivedPolls || [], [data?.archivedPolls]);
  const groupColors = useMemo(() => data?.groupColors || {}, [data?.groupColors]);
  const calendarSyncPreference = data?.calendarSyncPreference || "poll";

  const archivePoll = useCallback(
    async (pollId) => {
      const currentArchived = data?.archivedPolls || [];
      return addArchivedPoll(user?.uid, pollId, currentArchived);
    },
    [user?.uid, data?.archivedPolls]
  );

  const unarchivePoll = useCallback(
    async (pollId) => {
      const currentArchived = data?.archivedPolls || [];
      return removeArchivedPoll(user?.uid, pollId, currentArchived);
    },
    [user?.uid, data?.archivedPolls]
  );

  const isArchived = useCallback(
    (pollId) => archivedPolls.includes(pollId),
    [archivedPolls]
  );

  const setCalendarSyncPreference = useCallback(
    async (preference) => {
      return persistCalendarSyncPreference(user?.uid, preference);
    },
    [user?.uid]
  );

  const setGroupColor = useCallback(
    async (groupId, color) => {
      return persistGroupColor(user?.uid, groupColors, groupId, color);
    },
    [user?.uid, groupColors]
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
    autoConvertPollTimes: data?.settings?.autoConvertPollTimes !== false,
    hideTimeZone: data?.settings?.hideTimeZone === true,
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
