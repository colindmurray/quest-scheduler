import { serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, startOfDay, isBefore, startOfHour } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "../../app/useAuth";
import { useUserSettings } from "../../hooks/useUserSettings";
import { useFriends } from "../../hooks/useFriends";
import { useQuestingGroups } from "../../hooks/useQuestingGroups";
import { useCalendarNavigation } from "../../hooks/useCalendarNavigation";
import { CalendarJumpControls } from "../../components/ui/calendar-jump-controls";
import { useUserProfiles, useUserProfilesByIds } from "../../hooks/useUserProfiles";
import { useSchedulerEditorData } from "./hooks/useSchedulerEditorData";
import { APP_URL } from "../../lib/config";
import {
  addSchedulerSlot,
  deleteField,
  deleteSchedulerSlot,
  deleteSchedulerVote,
  setScheduler,
  updateScheduler,
  upsertSchedulerSlot,
  upsertSchedulerVote,
} from "../../lib/data/schedulers";
import { resolveIdentifier } from "../../lib/identifiers";
import { buildNotificationActor, emitPollEvent } from "../../lib/data/notification-events";
import { sendPendingPollInvites, revokePollInvite } from "../../lib/data/pollInvites";
import { findUserIdsByEmails } from "../../lib/data/users";
import { buildEmailSet, normalizeEmail, normalizeEmailList } from "../../lib/utils";
import { formatZonedDateTime, formatZonedTime, shouldShowTimeZone, toDisplayDate } from "../../lib/time";
import { validateInviteCandidate } from "./utils/invite-utils";
import { InvitePanel } from "./components/invite-panel";
import { QuestingGroupSelect } from "./components/questing-group-select";
import { SchedulerFormHeader } from "./components/scheduler-form-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { AvatarStack } from "../../components/ui/voter-avatars";
import { buildColorMap, uniqueUsers } from "../../components/ui/voter-avatar-utils";
import { DatePicker } from "../../components/ui/date-picker";
import { Switch } from "../../components/ui/switch";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./calendar-styles.css";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { CalendarToolbar } from "./components/CalendarToolbar";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

const DragAndDropCalendar = withDragAndDrop(Calendar);

export default function CreateSchedulerPage() {
  const { id: editId } = useParams();
  const isEditing = Boolean(editId);
  const { user } = useAuth();
  const { settings, timezoneMode, timezone, getSessionDefaults } = useUserSettings();
  const { friends } = useFriends();
  const { groups, getGroupColor } = useQuestingGroups();
  const navigate = useNavigate();
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [invites, setInvites] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [inviteInput, setInviteInput] = useState("");
  const [slots, setSlots] = useState([]);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState("month");
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState(null);
  const [inviteError, setInviteError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(null);
  const [draftTime, setDraftTime] = useState("18:00");
  const [draftDuration, setDraftDuration] = useState(240);
  const [allowLinkSharing, setAllowLinkSharing] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [timezoneInitialized, setTimezoneInitialized] = useState(false);
  const [loadedFromPoll, setLoadedFromPoll] = useState(false);
  const [initialSlotIds, setInitialSlotIds] = useState(new Set());
  const [initialSlotTimes, setInitialSlotTimes] = useState({});
  const [calendarUpdateOpen, setCalendarUpdateOpen] = useState(false);
  const [calendarUpdateChecked, setCalendarUpdateChecked] = useState(false);

  const { schedulerDocRef, scheduler, slotsSnapshot, votesSnapshot } = useSchedulerEditorData({
    schedulerId: editId,
    isEditing,
  });

  const inviteEmails = useMemo(() => invites, [invites]);
  const explicitParticipantIds = useMemo(
    () => scheduler.data?.participantIds || [],
    [scheduler.data?.participantIds]
  );
  const { profiles: participantProfilesById } = useUserProfilesByIds(explicitParticipantIds);
  const explicitParticipantEmails = useMemo(() => {
    if (!explicitParticipantIds.length) return [];
    return explicitParticipantIds
      .map((id) => participantProfilesById[id]?.email)
      .filter(Boolean)
      .map((email) => normalizeEmail(email));
  }, [explicitParticipantIds, participantProfilesById]);
  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) return null;
    return groups.find((g) => g.id === selectedGroupId) || null;
  }, [selectedGroupId, groups]);
  const groupMemberIds = useMemo(
    () => selectedGroup?.memberIds || [],
    [selectedGroup?.memberIds]
  );
  const { profiles: groupMemberProfiles } = useUserProfilesByIds(groupMemberIds);
  const groupMemberEmails = useMemo(() => {
    if (!groupMemberIds.length) return [];
    return groupMemberIds
      .map((id) => groupMemberProfiles[id]?.email)
      .filter(Boolean)
      .map((email) => normalizeEmail(email));
  }, [groupMemberIds, groupMemberProfiles]);
  const groupMemberSet = useMemo(() => buildEmailSet(groupMemberEmails), [groupMemberEmails]);
  const profileEmails = useMemo(() => {
    return normalizeEmailList([
      ...invites,
      ...pendingInvites,
      ...groupMemberEmails,
      user?.email,
    ]);
  }, [invites, pendingInvites, groupMemberEmails, user?.email]);
  const { enrichUsers } = useUserProfiles(profileEmails);
  const groupUsers = useMemo(() => {
    if (!groupMemberIds.length) return [];
    const profiles = groupMemberIds.map((id) => groupMemberProfiles[id]).filter(Boolean);
    if (profiles.length > 0) return profiles;
    return enrichUsers(groupMemberEmails);
  }, [groupMemberIds, groupMemberProfiles, enrichUsers, groupMemberEmails]);
  const inviteUsers = useMemo(() => enrichUsers(invites), [enrichUsers, invites]);
  const pendingInviteUsers = useMemo(
    () => enrichUsers(pendingInvites),
    [enrichUsers, pendingInvites]
  );
  const friendSet = useMemo(() => buildEmailSet(friends), [friends]);
  const recommendedEmails = useMemo(() => {
    const userEmail = user?.email ? normalizeEmail(user.email) : null;
    return friends
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
      .filter((email) => email !== userEmail)
      .filter((email) => !invites.includes(email))
      .filter((email) => !pendingInvites.includes(email))
      .filter((email) => !groupMemberSet.has(email));
  }, [friends, invites, pendingInvites, groupMemberSet, user?.email]);
  const recommendedUsers = useMemo(() => enrichUsers(recommendedEmails), [enrichUsers, recommendedEmails]);
  const includedUser = useMemo(() => {
    if (!user?.email) return null;
    const [profile] = enrichUsers([user.email]);
    if (!profile) {
      return { email: user.email, displayName: user.displayName || null };
    }
    if (!profile.displayName && user.displayName) {
      return { ...profile, displayName: user.displayName };
    }
    return profile;
  }, [enrichUsers, user?.email, user?.displayName]);
  const defaultDuration = settings?.defaultDurationMinutes ?? 60;
  const effectiveTimezone = selectedTimezone;
  const showTimeZone = useMemo(() => shouldShowTimeZone(settings), [settings]);
  const calendarEvents = useMemo(
    () =>
      slots.map((slot) => ({
        ...slot,
        start: toDisplayDate(
          slot.start instanceof Date ? slot.start : new Date(slot.start),
          effectiveTimezone
        ),
        end: toDisplayDate(
          slot.end instanceof Date ? slot.end : new Date(slot.end),
          effectiveTimezone
        ),
        title: formatZonedTime(slot.start, effectiveTimezone, "h:mm a", { showTimeZone }),
      })),
    [slots, effectiveTimezone, showTimeZone]
  );
  const {
    scrollToTime,
    selectedEventId,
    setSelectedEventId,
    hasEvents,
    hasEventsInView,
    jumpNext,
    jumpPrev,
    jumpNextWindow,
    jumpPrevWindow,
  } = useCalendarNavigation({
    events: calendarEvents,
    view: calendarView,
    date: calendarDate,
    height: 420,
    onNavigate: setCalendarDate,
  });

  const calendarKey =
    calendarView === "month"
      ? `month-${calendarDate.toDateString()}`
      : `${calendarView}-${calendarDate.toDateString()}-${scrollToTime?.getTime?.() || 0}`;
  const invalidSlotIds = useMemo(() => {
    if (!isEditing) return new Set();
    const now = Date.now();
    return new Set(
      slots.filter((slot) => slot.start && new Date(slot.start).getTime() < now).map((slot) => slot.id)
    );
  }, [isEditing, slots]);
  const hasInvalidSlots = isEditing && invalidSlotIds.size > 0;

  useEffect(() => {
    if (timezoneInitialized) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezoneMode === "manual" && timezone) {
      setSelectedTimezone(timezone);
    } else {
      setSelectedTimezone(detected);
    }
    setTimezoneInitialized(true);
  }, [timezoneInitialized, timezoneMode, timezone]);

  useEffect(() => {
    if (!isEditing || loadedFromPoll) return;
    if (!scheduler.data || slotsSnapshot.loading) return;
    if (scheduler.data.creatorId && scheduler.data.creatorId !== user?.uid) return;
    if (explicitParticipantIds.length > 0 && explicitParticipantEmails.length === 0) return;
    setTitle(scheduler.data.title || "");
    setDescription(scheduler.data.description || "");
    setAllowLinkSharing(Boolean(scheduler.data.allowLinkSharing));
    const creatorEmail = scheduler.data.creatorEmail || user?.email;
    setInvites(explicitParticipantEmails.filter((email) => email && email !== creatorEmail));
    const pendingList = (scheduler.data.pendingInvites || [])
      .filter((email) => email && email !== creatorEmail)
      .map((email) => normalizeEmail(email));
    setPendingInvites(pendingList);
    if (scheduler.data.questingGroupId && !selectedGroupId) {
      setSelectedGroupId(scheduler.data.questingGroupId);
    }
    setSlots(
      slotsSnapshot.data.map((slot) => ({
        id: slot.id,
        start: slot.start ? new Date(slot.start) : new Date(),
        end: slot.end ? new Date(slot.end) : new Date(),
        persisted: true,
      }))
    );
    setInitialSlotIds(new Set(slotsSnapshot.data.map((slot) => slot.id)));
    const slotTimes = {};
    slotsSnapshot.data.forEach((slot) => {
      const start = slot.start ? new Date(slot.start).getTime() : null;
      const end = slot.end ? new Date(slot.end).getTime() : null;
      slotTimes[slot.id] = { start, end };
    });
    setInitialSlotTimes(slotTimes);
    if (scheduler.data.timezone) {
      setSelectedTimezone(scheduler.data.timezone);
      setTimezoneInitialized(true);
    }
    setLoadedFromPoll(true);
  }, [
    isEditing,
    loadedFromPoll,
    scheduler.data,
    slotsSnapshot.loading,
    slotsSnapshot.data,
    user?.uid,
    user?.email,
    explicitParticipantIds.length,
    explicitParticipantEmails,
    selectedGroupId,
  ]);

  useEffect(() => {
    if (!selectedGroup) return;
    setInvites((prev) => prev.filter((email) => !groupMemberSet.has(normalizeEmail(email))));
    setPendingInvites((prev) => prev.filter((email) => !groupMemberSet.has(normalizeEmail(email))));
  }, [selectedGroup, groupMemberSet]);

  useEffect(() => {
    if (!isEditing) return;
    const groupId = scheduler.data?.questingGroupId;
    if (!groupId) {
      setSelectedGroupId(null);
      return;
    }
    if (selectedGroupId && selectedGroupId !== groupId) {
      return;
    }
    if (!groups.length) return;
    const exists = groups.find((group) => group.id === groupId);
    if (exists) {
      setSelectedGroupId(groupId);
    } else {
      setSelectedGroupId(null);
    }
  }, [isEditing, scheduler.data?.questingGroupId, groups, selectedGroupId]);

  const slotVoters = useMemo(() => {
    if (!isEditing) return {};
    const map = {};
    votesSnapshot.data.forEach((voteDoc) => {
      if (!voteDoc?.userEmail) return;
      const userInfo = { email: voteDoc.userEmail, avatar: voteDoc.userAvatar };
      Object.entries(voteDoc.votes || {}).forEach(([slotId, value]) => {
        if (!map[slotId]) {
          map[slotId] = { preferred: [], feasible: [] };
        }
        if (value === "PREFERRED") {
          map[slotId].preferred = uniqueUsers([...map[slotId].preferred, userInfo]);
          map[slotId].feasible = uniqueUsers([...map[slotId].feasible, userInfo]);
        } else if (value === "FEASIBLE") {
          map[slotId].feasible = uniqueUsers([...map[slotId].feasible, userInfo]);
        }
      });
    });
    return map;
  }, [isEditing, votesSnapshot.data]);

  const tallies = useMemo(() => {
    if (!isEditing) return {};
    const map = {};
    votesSnapshot.data.forEach((voteDoc) => {
      Object.entries(voteDoc.votes || {}).forEach(([slotId, value]) => {
        if (!map[slotId]) map[slotId] = { feasible: 0, preferred: 0 };
        if (value === "PREFERRED") {
          map[slotId].preferred += 1;
          map[slotId].feasible += 1;
        } else if (value === "FEASIBLE") {
          map[slotId].feasible += 1;
        }
      });
    });
    return map;
  }, [isEditing, votesSnapshot.data]);

  const colorMap = useMemo(() => {
    if (!isEditing) return {};
    const voterEmails = votesSnapshot.data.map((voteDoc) => voteDoc.userEmail).filter(Boolean);
    const set = new Set([...(explicitParticipantEmails || []), ...voterEmails]);
    return buildColorMap(Array.from(set).sort((a, b) => a.localeCompare(b)));
  }, [isEditing, explicitParticipantEmails, votesSnapshot.data]);


  const removeSlot = (slotId) => {
    setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
  };

  const openModalForDate = (date) => {
    const safeDate = date instanceof Date ? date : new Date(date);
    setDraftDate(safeDate);
    const weekday = getDay(safeDate);
    const sessionDefaults = getSessionDefaults(weekday);
    setDraftTime(sessionDefaults.time);
    setDraftDuration(sessionDefaults.durationMinutes);
    setModalOpen(true);
  };

  const saveDraftSlot = () => {
    if (!draftDate || !draftTime) {
      console.error("Missing draft date/time", { draftDate, draftTime });
      toast.error("Select a date and time before adding a slot");
      return;
    }
    const dateStr = format(draftDate, "yyyy-MM-dd");
    const startUtc = fromZonedTime(`${dateStr}T${draftTime}:00`, effectiveTimezone);

    // Validate that the slot isn't in the past
    if (startUtc < new Date()) {
      toast.error("Cannot add a slot in the past. Please select a future time.");
      return;
    }

    const endUtc = new Date(
      startUtc.getTime() + Number(draftDuration || 0) * 60 * 1000
    );
    setSlots((prev) => [
      ...prev,
      { id: crypto.randomUUID(), start: startUtc, end: endUtc },
    ]);
    setModalOpen(false);
  };

  const addSlotFromSelection = (slotInfo) => {
    if (!slotInfo?.start) return;
    const startDate = slotInfo.start instanceof Date ? slotInfo.start : new Date(slotInfo.start);

    // Block adding slots in the past
    if (startDate < new Date()) {
      return; // Silently ignore - visual cues already indicate non-interactivity
    }

    const start = fromZonedTime(
      format(startDate, "yyyy-MM-dd'T'HH:mm:ss"),
      effectiveTimezone
    );
    const selectedMinutes =
      slotInfo.end && slotInfo.end > slotInfo.start
        ? Math.round((slotInfo.end - slotInfo.start) / 60000)
        : 0;
    const durationMinutes =
      selectedMinutes > 30 ? selectedMinutes : defaultDuration;
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    setSlots((prev) => [...prev, { id: crypto.randomUUID(), start, end }]);
  };


  const updateSlotTimes = (slotId, start, end) => {
    setSlots((prev) =>
      prev.map((slot) => (slot.id === slotId ? { ...slot, start, end } : slot))
    );
  };

  const sendPendingInvites = async (pendingRecipients, schedulerId, pollTitle) => {
    const pending = pendingRecipients || [];
    if (pending.length === 0) return { added: [], rejected: [] };
    const response = await sendPendingPollInvites(schedulerId, pending, pollTitle);
    const added = response?.added || [];
    const rejected = response?.rejected || [];

    if (rejected.length > 0) {
      const blocked = rejected.filter((item) => item.reason === "blocked").map((item) => item.email);
      const limited = rejected.filter((item) => item.reason === "limit").map((item) => item.email);
      if (blocked.length > 0) {
        toast.error(`Couldn't invite: ${blocked.join(", ")} (blocked).`);
      }
      if (limited.length > 0) {
        toast.error(`Invite limit reached for: ${limited.join(", ")}.`);
      }
    }

    return response;
  };

  const resolveParticipantIdsByEmail = async (emails) => {
    const normalized = normalizeEmailList(emails);
    const resolved = await findUserIdsByEmails(normalized);
    if (user?.uid && user?.email) {
      resolved[normalizeEmail(user.email)] = user.uid;
    }
    return resolved;
  };

  const getPollInputs = () => {
    const explicitParticipants = Array.from(
      new Set([user.email, ...inviteEmails].filter(Boolean).map(normalizeEmail))
    );
    const pendingList = Array.from(
      new Set(pendingInvites.filter(Boolean).map(normalizeEmail))
    ).filter(
      (email) => !explicitParticipants.includes(email) && !groupMemberSet.has(email)
    );
    const creatorEmail = normalizeEmail(user.email);
    const pollTitle = title || "Untitled poll";
    const pollDescription = (description || "").trim();
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timezoneModeForScheduler =
      selectedTimezone === detectedTimezone ? "auto" : "manual";
    return {
      explicitParticipants,
      pendingList,
      creatorEmail,
      pollTitle,
      pollDescription,
      timezoneModeForScheduler,
    };
  };

  const deleteCalendarEntry = async () => {
    if (!editId) return;
    const functions = getFunctions();
    const deleteEvent = httpsCallable(functions, "googleCalendarDeleteEvent");
    await deleteEvent({ schedulerId: editId });
  };

  const saveEdits = async ({ updateCalendar } = {}) => {
    if (!schedulerDocRef || !editId) return false;
    setSubmitting(true);
    let success = false;
    try {
      const {
        explicitParticipants,
        pendingList,
        creatorEmail,
        pollTitle,
        pollDescription,
        timezoneModeForScheduler,
      } = getPollInputs();
      const inviteRecipients = Array.from(
        new Set([...explicitParticipants, ...pendingList].filter(Boolean))
      )
        .map((email) => normalizeEmail(email))
        .filter(
          (email) =>
            email &&
            email !== creatorEmail &&
            !groupMemberSet.has(email)
        );
      const participantIdMap = await resolveParticipantIdsByEmail([
        creatorEmail,
        ...inviteRecipients,
      ]);
      const participantIds = Array.from(
        new Set(Object.values(participantIdMap).filter(Boolean))
      );

      if (updateCalendar && scheduler.data?.googleEventId) {
        await deleteCalendarEntry();
      }

      const previousParticipantIds = new Set(scheduler.data?.participantIds || []);
      const previousPending = new Set(
        (scheduler.data?.pendingInvites || []).map((email) => normalizeEmail(email))
      );
      const inviteRecipientSet = new Set(inviteRecipients);
      const newPendingRecipients = inviteRecipients.filter((email) => {
        if (previousPending.has(email)) return false;
        const userId = participantIdMap[email];
        if (userId && previousParticipantIds.has(userId)) return false;
        return true;
      });
      const removedPendingRecipients = Array.from(previousPending).filter(
        (email) => !inviteRecipientSet.has(email)
      );
      await updateScheduler(editId, {
        title: pollTitle,
        description: pollDescription,
        participantIds,
        allowLinkSharing,
        timezone: effectiveTimezone,
        timezoneMode: timezoneModeForScheduler,
        questingGroupId: selectedGroup?.id || null,
        questingGroupName: selectedGroup?.name || null,
        participants: deleteField(),
        updatedAt: serverTimestamp(),
      });

      const currentSlotIds = new Set(slots.map((slot) => slot.id));
      const removedIds = Array.from(initialSlotIds).filter(
        (slotId) => !currentSlotIds.has(slotId)
      );
      const addedCount = slots.filter((slot) => !initialSlotIds.has(slot.id)).length;
      const changedCount = slots.filter((slot) => {
        if (!initialSlotIds.has(slot.id)) return false;
        const initial = initialSlotTimes[slot.id];
        if (!initial) return false;
        const start = slot.start instanceof Date ? slot.start.getTime() : new Date(slot.start).getTime();
        const end = slot.end instanceof Date ? slot.end.getTime() : new Date(slot.end).getTime();
        return start !== initial.start || end !== initial.end;
      }).length;
      const removedCount = removedIds.length;
      const hasSlotChanges = addedCount + changedCount + removedCount > 0;
      const summaryParts = [];
      if (addedCount) summaryParts.push(`${addedCount} slot${addedCount === 1 ? "" : "s"} added`);
      if (removedCount) summaryParts.push(`${removedCount} slot${removedCount === 1 ? "" : "s"} removed`);
      if (changedCount) summaryParts.push(`${changedCount} slot${changedCount === 1 ? "" : "s"} updated`);
      const changeSummary = summaryParts.join(", ");

      await Promise.all(
        slots.map((slot) => {
          const data = {
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
          };
          if (!initialSlotIds.has(slot.id)) {
            data.stats = { feasible: 0, preferred: 0 };
          }
          return upsertSchedulerSlot(editId, slot.id, data);
        })
      );

      const allowedParticipantIds = new Set([
        ...participantIds,
        ...groupMemberIds,
      ]);

      if (removedIds.length > 0) {
        await Promise.all(
          removedIds.map((slotId) => deleteSchedulerSlot(editId, slotId))
        );
      }

      await Promise.all(
        votesSnapshot.data.map((voteDoc) => {
          const voterId = voteDoc.id;
          if (voterId && !allowedParticipantIds.has(voterId)) {
            return deleteSchedulerVote(editId, voteDoc.id);
          }
          const votes = voteDoc.votes || {};
          let changed = false;
          const nextVotes = { ...votes };
          removedIds.forEach((slotId) => {
            if (nextVotes[slotId]) {
              delete nextVotes[slotId];
              changed = true;
            }
          });
          if (!changed) return Promise.resolve();
          return upsertSchedulerVote(editId, voteDoc.id, {
            votes: nextVotes,
            updatedAt: serverTimestamp(),
          });
        })
      );

      if (removedPendingRecipients.length > 0) {
        await Promise.allSettled(
          removedPendingRecipients.map((email) => revokePollInvite(editId, email))
        );
      }

      if (newPendingRecipients.length > 0) {
        try {
          await sendPendingInvites(newPendingRecipients, editId, pollTitle);
        } catch (inviteErr) {
          console.error("Failed to send pending invites:", inviteErr);
          toast.error(inviteErr?.message || "Failed to send pending invites.");
        }
      }

      if (hasSlotChanges) {
        try {
          const recipientUserIds = Array.from(
            new Set([...participantIds, ...groupMemberIds].filter(Boolean))
          ).filter((participantId) => participantId !== user?.uid);
          if (recipientUserIds.length > 0) {
            await emitPollEvent({
              eventType: "SLOT_CHANGED",
              schedulerId: editId,
              pollTitle,
              actor: buildNotificationActor(user),
              payload: {
                pollTitle,
                changeSummary,
              },
              recipients: {
                userIds: recipientUserIds,
                emails: [],
              },
              dedupeKey: `poll:${editId}:slot-change`,
            });
          }
        } catch (notifyErr) {
          console.error("Failed to notify participants about slot updates:", notifyErr);
        }
      }

      navigate(`/scheduler/${editId}`);
      success = true;
    } catch (err) {
      console.error("Failed to save session poll:", err);
      toast.error(err.message || "Failed to save session poll");
    } finally {
      setSubmitting(false);
    }
    return success;
  };

  const createPoll = async () => {
    setSubmitting(true);
    try {
      const {
        explicitParticipants,
        pendingList,
        creatorEmail,
        pollTitle,
        pollDescription,
        timezoneModeForScheduler,
      } = getPollInputs();
      const inviteRecipients = Array.from(
        new Set([...explicitParticipants, ...pendingList].filter(Boolean))
      )
        .map((email) => normalizeEmail(email))
        .filter(
          (email) =>
            email &&
            email !== creatorEmail &&
            !groupMemberSet.has(email)
        );
      const participantIdMap = await resolveParticipantIdsByEmail([
        creatorEmail,
        ...inviteRecipients,
      ]);
      const participantIds = Array.from(
        new Set(Object.values(participantIdMap).filter(Boolean))
      );

      const schedulerId = crypto.randomUUID();

      await setScheduler(schedulerId, {
        title: pollTitle,
        description: pollDescription,
        creatorId: user.uid,
        creatorEmail: user.email,
        status: "OPEN",
        participantIds,
        pendingInvites: [],
        allowLinkSharing,
        timezone: effectiveTimezone,
        timezoneMode: timezoneModeForScheduler,
        winningSlotId: null,
        googleEventId: null,
        questingGroupId: selectedGroup?.id || null,
        questingGroupName: selectedGroup?.name || null,
        createdAt: serverTimestamp(),
      });

      await Promise.all(
        slots.map((slot) => {
          return addSchedulerSlot(schedulerId, {
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            stats: { feasible: 0, preferred: 0 },
          });
        })
      );

      if (inviteRecipients.length > 0) {
        try {
          await sendPendingInvites(inviteRecipients, schedulerId, pollTitle);
        } catch (inviteErr) {
          console.error("Failed to send pending invites:", inviteErr);
          toast.error(inviteErr?.message || "Failed to send pending invites.");
        }
      }

      setCreatedId(schedulerId);
      toast.success("Session poll created");
      navigate(`/scheduler/${schedulerId}`);
    } catch (err) {
      console.error("Failed to save session poll:", err);
      toast.error(err.message || "Failed to save session poll");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();

    if (!user) {
      console.error("Create poll blocked: user not signed in");
      toast.error("You must be signed in to create a session poll");
      return;
    }

    if (!slots.length) {
      console.error("Create poll blocked: no slots");
      toast.error("Add at least one slot");
      return;
    }

    if (hasInvalidSlots) {
      console.error("Create poll blocked: past slots", { invalidSlotIds });
      toast.error("Remove past slots before saving");
      return;
    }

    if (isEditing) {
      if (scheduler.data?.googleEventId) {
        setCalendarUpdateChecked(false);
        setCalendarUpdateOpen(true);
        return;
      }
      await saveEdits();
      return;
    }

    await createPoll();
  };

  const confirmEditSave = async () => {
    const success = await saveEdits({ updateCalendar: calendarUpdateChecked });
    if (success) {
      setCalendarUpdateOpen(false);
      setCalendarUpdateChecked(false);
    }
  };

  const addInvite = async (input) => {
    const raw = String(input || "").trim();
    if (!raw) return;
    let resolved;
    try {
      resolved = await resolveIdentifier(raw);
    } catch (err) {
      setInviteError(err.message || "Enter a valid email or Discord username.");
      return;
    }
    const validation = validateInviteCandidate({
      email: resolved.email,
      selfEmail: user?.email,
      groupMemberSet,
      existingInvites: invites,
      pendingInvites,
    });
    if (!validation.ok) {
      setInviteError(validation.error);
      return;
    }
    const normalized = validation.normalized;
    if (friendSet.has(normalized)) {
      setInvites((prev) => [...prev, normalized]);
    } else {
      setPendingInvites((prev) => [...prev, normalized]);
    }
    setInviteInput("");
    setInviteError(null);
  };

  const removeInvite = (email) => {
    setInvites((prev) => prev.filter((item) => item !== email));
  };

  const removePendingInvite = (email) => {
    setPendingInvites((prev) => prev.filter((item) => item !== email));
  };

  const handleGroupChange = (groupId) => {
    if (!groupId || groupId === "none") {
      setSelectedGroupId(null);
      return;
    }
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    setSelectedGroupId(groupId);
  };

  if (isEditing && scheduler.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading session poll...</p>
      </div>
    );
  }

  if (isEditing && (!scheduler.data || scheduler.data?.status === "ARCHIVED")) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600 dark:text-slate-400">
        Session poll not found.
      </div>
    );
  }

  if (isEditing && scheduler.data?.creatorId && scheduler.data.creatorId !== user?.uid) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600 dark:text-slate-400">
        Only the creator can edit this poll.
      </div>
    );
  }

  if (isEditing && scheduler.data?.status === "FINALIZED") {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600 dark:text-slate-400">
        This poll is finalized. Re-open it before editing.
      </div>
    );
  }
  if (isEditing && scheduler.data?.status === "CANCELLED") {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600 dark:text-slate-400">
        This poll is cancelled. Clone it to propose new times.
      </div>
    );
  }

  return (
    <>
      <form
        onSubmit={handleCreate}
        className="rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-900 dark:shadow-slate-900/50"
      >
          <SchedulerFormHeader
            title={isEditing ? "Edit Session Poll" : "Create Session Poll"}
            subtitle={
              isEditing
                ? "Update slots and invitees without losing existing votes."
                : "Add a few proposed session slots to kick off voting."
            }
            onBack={() => navigate(isEditing ? `/scheduler/${editId}` : "/dashboard")}
          />

          <div className="mt-6 grid gap-4">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Session poll title
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Campaign 12 scheduling"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Session poll description
              <textarea
                className="mt-2 min-h-[96px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Optional details, agenda, or expectations for the session."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <div className="grid gap-2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Timezone</span>
              <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
                <SelectTrigger className="h-12 rounded-2xl px-4">
                  <SelectValue placeholder="Select a timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                    Auto (browser) · {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </SelectItem>
                  {(Intl.supportedValuesOf
                    ? Intl.supportedValuesOf("timeZone")
                    : [
                        "UTC",
                        "America/Los_Angeles",
                        "America/Denver",
                        "America/Chicago",
                        "America/New_York",
                      ]
                  ).map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Questing Group Selector */}
            <QuestingGroupSelect
              groups={groups}
              selectedId={selectedGroupId}
              onChange={(value) => handleGroupChange(value)}
            />

            <InvitePanel
              includedUser={includedUser}
              groupName={selectedGroup?.name || null}
              groupColor={selectedGroup ? getGroupColor(selectedGroup.id) : null}
              groupMembers={groupUsers}
              groupAvatarSize={24}
              inviteUsers={inviteUsers}
              onRemoveInvite={removeInvite}
              pendingInviteUsers={pendingInviteUsers}
              onRemovePendingInvite={removePendingInvite}
              recommendedUsers={recommendedUsers}
              onAddInvite={addInvite}
              inputValue={inviteInput}
              onInputChange={setInviteInput}
              onAddInput={() => addInvite(inviteInput)}
              error={inviteError}
            />

            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Anyone with link
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Allow anyone with the poll URL to join and vote.
                  </p>
                </div>
                <Switch checked={allowLinkSharing} onCheckedChange={setAllowLinkSharing} />
              </div>
              {allowLinkSharing && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Anyone with the link can join after accepting the invite prompt.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Proposed slots
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (calendarView === "month") {
                    openModalForDate(new Date());
                  } else {
                    addSlotFromSelection({
                      start: new Date(),
                      end: new Date(Date.now() + defaultDuration * 60 * 1000),
                    });
                  }
                }}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                + Add slot
              </button>
            </div>
            <div className="mt-4 rounded-3xl border border-slate-200/70 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <DragAndDropCalendar
                key={calendarKey}
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                selectable="ignoreEvents"
                scrollToTime={scrollToTime}
                enableAutoScroll={calendarView !== "month"}
                date={calendarDate}
                onNavigate={(nextDate) => setCalendarDate(nextDate)}
                view={calendarView}
                onView={(nextView) => setCalendarView(nextView)}
                views={["month", "week", "day"]}
                components={{
                  toolbar: CalendarToolbar,
                }}
                onSelectEvent={(event) => setSelectedEventId(event.id)}
                onDrillDown={(date) => {
                  if (calendarView === "month") {
                    openModalForDate(date);
                  }
                }}
                resizable
                draggableAccessor={() => true}
                onSelectSlot={(slotInfo) => {
                  try {
                    const slotStart = slotInfo.start instanceof Date ? slotInfo.start : new Date(slotInfo.start);

                    if (calendarView === "month") {
                      // Block past days (not including today)
                      const today = startOfDay(new Date());
                      if (isBefore(startOfDay(slotStart), today)) {
                        return; // Silently ignore - visual cues indicate non-interactivity
                      }
                      openModalForDate(slotInfo.start);
                      return;
                    }
                    // Week/day views - addSlotFromSelection handles past time validation
                    addSlotFromSelection(slotInfo);
                  } catch (err) {
                    console.error("Failed to handle slot selection:", err, slotInfo);
                    toast.error("Unable to add slot. Please try again.");
                  }
                }}
                onEventDrop={({ event, start, end }) => {
                  // Block dropping events to past times
                  if (start < new Date()) {
                    toast.error("Cannot move slot to a past time");
                    return;
                  }
                  updateSlotTimes(event.id, start, end);
                }}
                onEventResize={({ event, start, end }) => {
                  // Block resizing events to start in the past
                  if (start < new Date()) {
                    toast.error("Cannot resize slot to start in the past");
                    return;
                  }
                  updateSlotTimes(event.id, start, end);
                }}
                dayPropGetter={(date) => {
                  if (isBefore(date, startOfDay(new Date()))) {
                    return { className: "rbc-past-day" };
                  }
                  return {};
                }}
                slotPropGetter={(date) => {
                  if (isBefore(date, startOfHour(new Date()))) {
                    return { className: "rbc-past-slot" };
                  }
                  return {};
                }}
                eventPropGetter={(event) => {
                  const isInvalid = invalidSlotIds.has(event.id);
                  const isSelected = selectedEventId === event.id;
                  if (!isInvalid && !isSelected) return {};
                  return {
                    style: {
                      ...(isInvalid
                        ? { backgroundColor: "#dc2626", borderColor: "#b91c1c" }
                        : {}),
                      ...(isSelected
                        ? {
                            boxShadow:
                              "0 0 0 2px rgba(59, 130, 246, 0.7), 0 0 12px rgba(59, 130, 246, 0.35)",
                          }
                        : {}),
                    },
                  };
                }}
                style={{ height: 420 }}
              />
              <div className="mt-3 flex justify-end">
                <CalendarJumpControls
                  hasEvents={hasEvents}
                  hasEventsInView={hasEventsInView}
                  onPrev={jumpPrev}
                  onNext={jumpNext}
                  onPrevWindow={jumpPrevWindow}
                  onNextWindow={jumpNextWindow}
                  label="Jump to slot"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Month view opens a modal. Week/day views add slots instantly and support drag/resize.
            </p>
            <div className="mt-4 space-y-2">
              {slots.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No slots added yet. Click on the calendar to add one.
                </p>
              )}
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 dark:bg-slate-900 ${
                    invalidSlotIds.has(slot.id)
                      ? "border-red-300 bg-red-50/60 dark:border-red-700 dark:bg-red-900/20"
                      : "border-slate-200/70 bg-white dark:border-slate-700"
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatZonedDateTime(
                        slot.start,
                        effectiveTimezone,
                        "MMM d, yyyy · h:mm a",
                        { showTimeZone }
                      )}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Duration {Math.round((slot.end - slot.start) / 60000)} min
                    </p>
                    {isEditing && (
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold">★ Preferred</span>
                          <AvatarStack
                            users={(slotVoters[slot.id] || {}).preferred || []}
                            max={6}
                            size={20}
                            colorMap={colorMap}
                          />
                          <span className="text-slate-400 dark:text-slate-500">
                            {(tallies[slot.id]?.preferred || 0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold">✓ Feasible</span>
                          <AvatarStack
                            users={(slotVoters[slot.id] || {}).feasible || []}
                            max={6}
                            size={20}
                            colorMap={colorMap}
                          />
                          <span className="text-slate-400 dark:text-slate-500">
                            {(tallies[slot.id]?.feasible || 0)}
                          </span>
                        </div>
                      </div>
                    )}
                    {invalidSlotIds.has(slot.id) && (
                      <p className="mt-2 text-xs font-semibold text-red-500 dark:text-red-400">
                        This slot is in the past. Remove it to save.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSlot(slot.id)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-900/30 dark:hover:border-red-800 dark:hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {hasInvalidSlots && (
            <p className="mt-4 text-sm text-red-500 dark:text-red-400">
              Remove past slots before saving changes.
            </p>
          )}

          {createdId && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200">
              Session poll created. Share link: {`${APP_URL}/scheduler/${createdId}`}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {submitting
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                  ? "Update poll"
                  : "Create poll"}
            </button>
          </div>
      </form>
      <Dialog
        open={calendarUpdateOpen}
        onOpenChange={(open) => {
          setCalendarUpdateOpen(open);
          if (open) {
            setCalendarUpdateChecked(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Google Calendar entry</DialogTitle>
            <DialogDescription>
              This poll has an existing calendar event. Confirm if it should be updated before saving changes.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={calendarUpdateChecked}
                onChange={(event) => setCalendarUpdateChecked(event.target.checked)}
              />
              Yes, update Google Calendar entry (delete the linked event)
            </label>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              You can create a new event again when the poll is finalized.
            </p>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCalendarUpdateOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmEditSave}
              disabled={submitting}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Continue"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a slot</DialogTitle>
            <DialogDescription>
              Choose a date and time in {effectiveTimezone}.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-1">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Date
              </span>
              <DatePicker
                date={draftDate}
                onSelect={setDraftDate}
                placeholder="Select a date"
              />
            </div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Start time
              <input
                type="time"
                value={draftTime}
                onChange={(event) => setDraftTime(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Duration (min)
              <input
                type="number"
                min="30"
                step="30"
                value={draftDuration}
                onChange={(event) => setDraftDuration(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveDraftSlot}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
            >
              Add slot
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
