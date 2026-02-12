import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../../app/useAuth";
import { useSafeNavigate } from "../../hooks/useSafeNavigate";
import { useSchedulersByCreator, useSchedulersByGroupIds, useSchedulersByParticipant } from "../../hooks/useSchedulers";
import { useUserSettings } from "../../hooks/useUserSettings";
import { useQuestingGroups } from "../../hooks/useQuestingGroups";
import { usePollInvites } from "../../hooks/usePollInvites";
import { useNotifications } from "../../hooks/useNotifications";
import {
  pollInviteNotificationId,
  pollInviteLegacyNotificationId,
} from "../../lib/data/notifications";
import { LoadingState } from "../../components/ui/spinner";
import { useUserProfiles, useUserProfilesByIds } from "../../hooks/useUserProfiles";
import { useSchedulerAttendance } from "./hooks/useSchedulerAttendance";
import { normalizeEmail } from "../../lib/utils";
import { coerceDate, resolveDisplayTimeZone, shouldShowTimeZone } from "../../lib/time";
import { useDashboardBasicPollSource } from "./hooks/use-dashboard-basic-poll-source";
import { useDashboardBasicPollActions } from "./hooks/use-dashboard-basic-poll-actions";
import { NextSessionCard } from "./components/NextSessionCard";
import { SessionCard } from "./components/SessionCard";
import { DashboardCalendar } from "./components/DashboardCalendar";
import { MobileAgendaView } from "./components/MobileAgendaView";
import { buildAttendanceSummary } from "./lib/attendance";
import { PastSessionsSection } from "./components/past-sessions-section";
import { SectionHeader } from "./components/section-header";
import { DashboardFilterBar } from "./components/dashboard-filter-bar";
import { PendingInvitesSection } from "./components/pending-invites-section";
import { GeneralPollsSection } from "./components/general-polls-section";
import {
  DASHBOARD_STATUS_ORDER,
  describeDateFilterSelection,
  describeStatusFilterSelection,
  isWithinDateWindow,
  matchesSearch,
  normalizeDateRangeBounds,
  normalizeSearchValue,
  resolveBasicPollDashboardStatus,
  resolveSessionDashboardStatus,
  toDayEndMs,
  toDayStartMs,
} from "./lib/dashboard-filters";
import {
  bucketDashboardBasicPolls,
  buildUsersFromIds,
  canManageGroupPoll,
  deriveDashboardBasicPollItems,
} from "./lib/dashboard-basic-polls";
import { GroupBasicPollModal } from "./components/group-basic-poll-modal";
import { CreateGroupPollModal } from "../basic-polls/components/CreateGroupPollModal";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";

const toDate = coerceDate;

function parseGroupPollModalFromSearch(search) {
  const params = new URLSearchParams(search || "");
  const groupId = String(params.get("groupPollGroupId") || "").trim();
  const pollId = String(params.get("groupPollId") || "").trim();
  if (!groupId || !pollId) return null;
  return { groupId, pollId };
}

export default function DashboardPage({
  initialGroupFilterId = null,
  initialSearchText = "",
  initialStatusFilters = [],
  initialDateFrom = null,
  initialDateTo = null,
}) {
  const safeNavigate = useSafeNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const {
    archivedPolls,
    loading: settingsLoading,
    settings,
    archivePoll,
    unarchivePoll,
  } = useUserSettings();
  const { groups, getGroupColor } = useQuestingGroups();
  const normalizedUserEmail = normalizeEmail(user?.email) || "";
  const groupIds = useMemo(
    () => (groups || []).map((group) => group.id).filter(Boolean),
    [groups]
  );
  const { pendingInvites, loading: pendingInvitesLoading, acceptInvite, declineInvite } = usePollInvites();
  const { removeLocal: removeNotification } = useNotifications();
  const [pastSessionsTab, setPastSessionsTab] = useState("finalized");
  const [basicPollTab, setBasicPollTab] = useState("needs-vote");
  const [isMobile, setIsMobile] = useState(false);
  const initialGroupPollModal = useMemo(
    () => parseGroupPollModalFromSearch(location.search),
    [location.search]
  );
  const [activeGroupPollModal, setActiveGroupPollModal] = useState(initialGroupPollModal);
  const [editingGeneralPoll, setEditingGeneralPoll] = useState(null);
  const [createGeneralPollOpen, setCreateGeneralPollOpen] = useState(false);
  const [selectedGroupFilterId, setSelectedGroupFilterId] = useState(initialGroupFilterId);
  const [dashboardSearchText, setDashboardSearchText] = useState(initialSearchText);
  const [dashboardStatusFilters, setDashboardStatusFilters] = useState(initialStatusFilters);
  const [dashboardDateFrom, setDashboardDateFrom] = useState(toDate(initialDateFrom));
  const [dashboardDateTo, setDashboardDateTo] = useState(toDate(initialDateTo));
  const [dashboardFilterEditor, setDashboardFilterEditor] = useState(null);
  const [dashboardFilterPickerOpen, setDashboardFilterPickerOpen] = useState(false);
  const [pendingDashboardFilterKey, setPendingDashboardFilterKey] = useState(null);
  const skipNextFilterDismissRef = useRef(new Set());
  const [basicPollRefreshNonce, setBasicPollRefreshNonce] = useState(0);
  const hasQuestingGroupMembership = groupIds.length > 0;
  const selectedGroupFilter = useMemo(
    () => (groups || []).find((group) => group.id === selectedGroupFilterId) || null,
    [groups, selectedGroupFilterId]
  );
  const selectedGroupFilterColor = useMemo(() => {
    if (!selectedGroupFilterId) return null;
    return getGroupColor(selectedGroupFilterId);
  }, [getGroupColor, selectedGroupFilterId]);
  const dashboardSearchQuery = useMemo(
    () => normalizeSearchValue(dashboardSearchText),
    [dashboardSearchText]
  );
  const dashboardStatusFilterSet = useMemo(
    () => new Set(dashboardStatusFilters),
    [dashboardStatusFilters]
  );
  const normalizedDashboardDateRange = useMemo(
    () => normalizeDateRangeBounds(dashboardDateFrom, dashboardDateTo),
    [dashboardDateFrom, dashboardDateTo]
  );
  const effectiveDashboardDateFrom = normalizedDashboardDateRange.from;
  const effectiveDashboardDateTo = normalizedDashboardDateRange.to;
  const dashboardDateFromMs = useMemo(
    () => toDayStartMs(effectiveDashboardDateFrom),
    [effectiveDashboardDateFrom]
  );
  const dashboardDateToMs = useMemo(
    () => toDayEndMs(effectiveDashboardDateTo),
    [effectiveDashboardDateTo]
  );
  const hasDashboardDateFilter = dashboardDateFromMs !== null || dashboardDateToMs !== null;
  const dashboardGroupFilterLabel = selectedGroupFilter?.name || "Questing group";
  const dashboardStatusChipLabel =
    dashboardStatusFilters.length > 0 ? describeStatusFilterSelection(dashboardStatusFilters) : "Status";
  const dashboardDateChipLabel =
    hasDashboardDateFilter
      ? describeDateFilterSelection(effectiveDashboardDateFrom, effectiveDashboardDateTo)
      : "Date range";
  const activeDashboardFilterKeys = useMemo(() => {
    const keys = [];
    if (hasQuestingGroupMembership && selectedGroupFilterId) keys.push("group");
    if (dashboardStatusFilters.length > 0) keys.push("status");
    if (hasDashboardDateFilter) keys.push("date");
    return keys;
  }, [
    dashboardStatusFilters.length,
    hasDashboardDateFilter,
    hasQuestingGroupMembership,
    selectedGroupFilterId,
  ]);
  const availableDashboardFilters = useMemo(() => {
    const unavailable = new Set(activeDashboardFilterKeys);
    if (pendingDashboardFilterKey) unavailable.add(pendingDashboardFilterKey);
    const options = [];
    if (hasQuestingGroupMembership && !unavailable.has("group")) {
      options.push({
        key: "group",
        label: "Questing group",
        description: "Limit dashboard cards to one questing group.",
      });
    }
    if (!unavailable.has("status")) {
      options.push({
        key: "status",
        label: "Status",
        description: "Filter by open, finalized, cancelled, closed, or archived.",
      });
    }
    if (!unavailable.has("date")) {
      options.push({
        key: "date",
        label: "Date range",
        description: "Filter by date window.",
      });
    }
    return options;
  }, [
    activeDashboardFilterKeys,
    hasQuestingGroupMembership,
    pendingDashboardFilterKey,
  ]);
  const visibleDashboardFilterKeys = useMemo(() => {
    const keys = new Set(activeDashboardFilterKeys);
    if (dashboardFilterEditor) keys.add(dashboardFilterEditor);
    if (pendingDashboardFilterKey) keys.add(pendingDashboardFilterKey);
    return ["group", "status", "date"].filter((key) => keys.has(key));
  }, [activeDashboardFilterKeys, dashboardFilterEditor, pendingDashboardFilterKey]);
  const generalPollCreationGroups = useMemo(
    () => (groups || []).filter((group) => canManageGroupPoll(group, user?.uid)),
    [groups, user?.uid]
  );
  const canCreateGeneralPoll = generalPollCreationGroups.length > 0;
  const defaultCreateGeneralPollGroupId = useMemo(() => {
    if (
      selectedGroupFilterId &&
      generalPollCreationGroups.some((group) => group.id === selectedGroupFilterId)
    ) {
      return selectedGroupFilterId;
    }
    return generalPollCreationGroups[0]?.id || null;
  }, [generalPollCreationGroups, selectedGroupFilterId]);
  const refreshBasicPolls = useCallback(() => {
    setBasicPollRefreshNonce((value) => value + 1);
  }, []);
  const {
    basicPollArchiveBusy,
    basicPollActionBusy,
    deletePollRequest,
    handleToggleBasicPollArchive,
    handleFinalizeBasicPoll,
    handleReopenBasicPoll,
    handleDeleteBasicPoll,
    confirmDeleteBasicPoll,
    clearDeletePollRequest,
  } = useDashboardBasicPollActions({
    archivePoll,
    unarchivePoll,
    refreshBasicPolls,
  });
  useEffect(() => {
    if (!initialGroupPollModal?.groupId || !initialGroupPollModal?.pollId) return;
    setActiveGroupPollModal((current) => {
      if (
        current?.groupId === initialGroupPollModal.groupId &&
        current?.pollId === initialGroupPollModal.pollId
      ) {
        return current;
      }
      return initialGroupPollModal;
    });
  }, [initialGroupPollModal]);
  const hasDashboardFilterValue = useCallback(
    (filterKey) => {
      if (filterKey === "group") return Boolean(selectedGroupFilterId);
      if (filterKey === "status") return dashboardStatusFilters.length > 0;
      if (filterKey === "date")
        return Boolean(effectiveDashboardDateFrom || effectiveDashboardDateTo);
      return false;
    },
    [
      effectiveDashboardDateFrom,
      effectiveDashboardDateTo,
      dashboardStatusFilters,
      selectedGroupFilterId,
    ]
  );
  const toggleDashboardStatusFilter = useCallback((statusValue) => {
    setDashboardStatusFilters((current) => {
      const next = current.includes(statusValue)
        ? current.filter((value) => value !== statusValue)
        : [...current, statusValue];
      return DASHBOARD_STATUS_ORDER.filter((value) => next.includes(value));
    });
  }, []);
  const handleDashboardDateFromChange = useCallback((nextDate) => {
    const normalized = toDate(nextDate);
    setDashboardDateFrom(normalized || null);
    if (!normalized) return;
    setDashboardDateTo((current) => {
      if (!current) return current;
      return current.getTime() < normalized.getTime() ? normalized : current;
    });
  }, []);
  const handleDashboardDateToChange = useCallback((nextDate) => {
    const normalized = toDate(nextDate);
    setDashboardDateTo(normalized || null);
    if (!normalized) return;
    setDashboardDateFrom((current) => {
      if (!current) return current;
      return current.getTime() > normalized.getTime() ? normalized : current;
    });
  }, []);
  const openDashboardFilterEditor = useCallback(
    (filterKey, { fromAdd = false } = {}) => {
      if (!filterKey) return;
      if (fromAdd) setPendingDashboardFilterKey(filterKey);
      setDashboardFilterEditor(filterKey);
    },
    []
  );
  const handleDashboardFilterEditorOpenChange = useCallback(
    (filterKey, open) => {
      if (open) {
        setDashboardFilterEditor(filterKey);
        return;
      }
      if (skipNextFilterDismissRef.current.has(filterKey)) {
        skipNextFilterDismissRef.current.delete(filterKey);
        return;
      }
      if (!hasDashboardFilterValue(filterKey)) {
        if (filterKey === "group") setSelectedGroupFilterId(null);
        if (filterKey === "status") setDashboardStatusFilters([]);
        if (filterKey === "date") {
          setDashboardDateFrom(null);
          setDashboardDateTo(null);
        }
      }
      setDashboardFilterEditor((current) => (current === filterKey ? null : current));
      setPendingDashboardFilterKey((current) => (current === filterKey ? null : current));
    },
    [hasDashboardFilterValue]
  );
  const handleAddDashboardFilter = useCallback(
    (filterKey) => {
      setDashboardFilterPickerOpen(false);
      skipNextFilterDismissRef.current.add(filterKey);
      openDashboardFilterEditor(filterKey, { fromAdd: true });
    },
    [openDashboardFilterEditor]
  );
  const removeDashboardFilter = useCallback((filterKey) => {
    if (filterKey === "group") {
      setSelectedGroupFilterId(null);
    } else if (filterKey === "status") {
      setDashboardStatusFilters([]);
    } else if (filterKey === "date") {
      setDashboardDateFrom(null);
      setDashboardDateTo(null);
    }
    setDashboardFilterEditor((current) => (current === filterKey ? null : current));
    setPendingDashboardFilterKey((current) => (current === filterKey ? null : current));
  }, []);
  const {
    data: groupSchedulers,
    loading: groupPollsLoading,
    error: groupPollsError,
  } = useSchedulersByGroupIds(groupIds);
  const [pendingInviteHandledIds, setPendingInviteHandledIds] = useState(() => new Set());
  const [pendingInviteBusy, setPendingInviteBusy] = useState({});

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!selectedGroupFilterId) return;
    const stillExists = (groups || []).some((group) => group.id === selectedGroupFilterId);
    if (!stillExists) {
      setSelectedGroupFilterId(null);
    }
  }, [groups, selectedGroupFilterId]);

  if (groupPollsError) {
    console.error("Failed to load questing group polls:", groupPollsError);
  }

  const allParticipatingById = useSchedulersByParticipant(user?.uid || null);
  const mine = useSchedulersByCreator(user?.uid || null);
  const groupMembersById = useMemo(() => {
    const map = new Map();
    (groups || []).forEach((group) => {
      const members = (group.memberIds || []).filter(Boolean);
      map.set(group.id, members);
    });
    return map;
  }, [groups]);
  const participatingSchedulers = useMemo(() => {
    const deduped = new Map();
    [...allParticipatingById.data, ...groupSchedulers].forEach((scheduler) => {
      deduped.set(scheduler.id, scheduler);
    });
    return Array.from(deduped.values());
  }, [allParticipatingById.data, groupSchedulers]);
  const pendingInvitesFromSchedulers = useMemo(
    () =>
      participatingSchedulers.filter((scheduler) => {
        const pending = scheduler.pendingInvites || [];
        return pending.some((email) => normalizeEmail(email) === normalizedUserEmail);
      }),
    [participatingSchedulers, normalizedUserEmail]
  );
  const effectivePendingInvites =
    pendingInvites && pendingInvites.length > 0
      ? pendingInvites
      : pendingInvitesFromSchedulers;
  const schedulerGroupIdById = useMemo(() => {
    const map = new Map();
    participatingSchedulers.forEach((scheduler) => {
      map.set(scheduler.id, scheduler.questingGroupId || null);
    });
    return map;
  }, [participatingSchedulers]);
  const pendingInviteIdSet = useMemo(
    () => new Set((effectivePendingInvites || []).map((invite) => invite.id)),
    [effectivePendingInvites]
  );
  const inviterEmails = useMemo(
    () =>
      (effectivePendingInvites || [])
        .map((invite) => {
          const meta = invite.pendingInviteMeta?.[normalizedUserEmail || ""] || {};
          return meta.invitedByEmail || invite.creatorEmail || null;
        })
        .filter(Boolean),
    [effectivePendingInvites, normalizedUserEmail]
  );
  const { enrichUsers } = useUserProfiles(inviterEmails);
  const inviterMap = useMemo(() => {
    const map = new Map();
    const enriched = enrichUsers(inviterEmails);
    enriched.forEach((entry) => {
      if (entry?.email) {
        map.set(normalizeEmail(entry.email), entry);
      }
    });
    return map;
  }, [enrichUsers, inviterEmails]);
  const visiblePendingInvites = useMemo(() => {
    return (effectivePendingInvites || []).filter((invite) => {
      if (pendingInviteHandledIds.has(invite.id)) return false;
      if (!selectedGroupFilterId) return true;
      const inviteGroupId = invite.questingGroupId || schedulerGroupIdById.get(invite.id) || null;
      return inviteGroupId === selectedGroupFilterId;
    });
  }, [
    effectivePendingInvites,
    pendingInviteHandledIds,
    schedulerGroupIdById,
    selectedGroupFilterId,
  ]);
  const activeSchedulers = useMemo(
    () =>
      participatingSchedulers.filter(
        (scheduler) => !pendingInviteIdSet.has(scheduler.id)
      ),
    [participatingSchedulers, pendingInviteIdSet]
  );
  const filteredActiveSchedulers = useMemo(() => {
    if (!selectedGroupFilterId) return activeSchedulers;
    return activeSchedulers.filter(
      (scheduler) => scheduler.questingGroupId === selectedGroupFilterId
    );
  }, [activeSchedulers, selectedGroupFilterId]);
  const allParticipantIds = useMemo(() => {
    const ids = new Set();
    filteredActiveSchedulers.forEach((scheduler) => {
      (scheduler.participantIds || []).forEach((id) => {
        if (id) ids.add(id);
      });
      if (scheduler.questingGroupId) {
        const groupMembers = groupMembersById.get(scheduler.questingGroupId) || [];
        groupMembers.forEach((id) => {
          if (id) ids.add(id);
        });
      }
    });
    return Array.from(ids);
  }, [filteredActiveSchedulers, groupMembersById]);
  const allGroupMemberIds = useMemo(() => {
    const ids = new Set();
    (groups || []).forEach((group) => {
      (group.memberIds || []).forEach((memberId) => {
        if (memberId) ids.add(memberId);
      });
    });
    return Array.from(ids);
  }, [groups]);
  const profileLookupIds = useMemo(
    () => Array.from(new Set([...allParticipantIds, ...allGroupMemberIds])),
    [allParticipantIds, allGroupMemberIds]
  );
  const { profiles: participantProfilesById } = useUserProfilesByIds(profileLookupIds);

  const { slotsByScheduler, votesByScheduler, votersByScheduler } =
    useSchedulerAttendance(filteredActiveSchedulers);

  // Enrich schedulers with slot data and voters
  const showTimeZone = useMemo(() => shouldShowTimeZone(settings), [settings]);
  const enrichedSchedulers = useMemo(() => {
    return filteredActiveSchedulers.map((scheduler) => {
      const slots = slotsByScheduler[scheduler.id] || [];
      const voteDocs = votesByScheduler[scheduler.id] || [];
      const winningSlot = scheduler.winningSlotId
        ? slots.find((s) => s.id === scheduler.winningSlotId)
        : null;

      // Get the first future slot for open polls
      const now = new Date();
      const futureSlots = slots
        .filter((s) => s.start && new Date(s.start) > now)
        .sort((a, b) => new Date(a.start) - new Date(b.start));

      const voters = (votersByScheduler[scheduler.id] || []).map((voter) => ({
        ...voter,
        email: voter.email ? normalizeEmail(voter.email) : voter.email,
      }));
      const groupMemberIds = scheduler.questingGroupId
        ? groupMembersById.get(scheduler.questingGroupId) || []
        : [];
      const participantIds = Array.from(
        new Set(
          [...(scheduler.participantIds || []), ...groupMemberIds].filter(Boolean)
        )
      );
      const participantProfiles = participantIds
        .map((id) => participantProfilesById[id])
        .filter(Boolean);
      const participantEmails = Array.from(
        new Set(
          participantProfiles
            .map((profile) => normalizeEmail(profile.email))
            .filter(Boolean)
        )
      );
      const participantEmailById = new Map(
        participantProfiles
          .filter((profile) => profile?.email)
          .map((profile) => [profile.id, normalizeEmail(profile.email)])
      );
      const respondedIds = voteDocs.map((voteDoc) => voteDoc.id).filter(Boolean);
      const respondedSet = new Set(respondedIds);
      const pollPriorityAtMs =
        (scheduler.finalizedSlotPriorityAtMs && scheduler.winningSlotId
          ? scheduler.finalizedSlotPriorityAtMs[scheduler.winningSlotId]
          : null) ?? scheduler.finalizedAtMs ?? null;
      const { confirmed, unavailable } = buildAttendanceSummary({
        schedulerId: scheduler.id,
        status: scheduler.status,
        winningSlotId: scheduler.winningSlotId,
        winningSlotStart: winningSlot?.start || null,
        winningSlotEnd: winningSlot?.end || null,
        pollPriorityAtMs,
        busyByUserId: participantProfilesById,
        voteDocs,
        participantEmailById,
      });
      const unresponded = participantIds
        .filter((id) => !respondedSet.has(id))
        .map((id) => participantEmailById.get(id))
        .filter(Boolean);

      const displayTimeZone = resolveDisplayTimeZone({
        pollTimeZone: scheduler.timezone,
        settings,
      });

      return {
        ...scheduler,
        effectiveParticipants: participantEmails,
        effectiveParticipantIds: participantIds,
        winningSlot,
        slots,
        firstSlot: futureSlots[0] || null,
        votedCount: voteDocs.length,
        voters,
        displayTimeZone,
        showTimeZone,
        attendanceSummary: {
          confirmed,
          unavailable,
          unresponded,
        },
      };
    });
  }, [
    filteredActiveSchedulers,
    slotsByScheduler,
    votesByScheduler,
    votersByScheduler,
    groupMembersById,
    participantProfilesById,
    settings,
    showTimeZone,
  ]);

  const archivedSchedulerIdSet = useMemo(
    () =>
      new Set(
        (archivedPolls || []).filter(
          (value) => typeof value === "string" && !value.startsWith("basic:")
        )
      ),
    [archivedPolls]
  );
  const filteredEnrichedSchedulers = useMemo(() => {
    return enrichedSchedulers.filter((scheduler) => {
      const status = resolveSessionDashboardStatus(scheduler, archivedSchedulerIdSet);
      if (dashboardStatusFilterSet.size > 0 && !dashboardStatusFilterSet.has(status)) {
        return false;
      }
      if (!matchesSearch([scheduler.title, scheduler.description], dashboardSearchQuery)) {
        return false;
      }
      const sessionDate = scheduler.winningSlot?.start || scheduler.firstSlot?.start || null;
      return isWithinDateWindow(sessionDate, dashboardDateFromMs, dashboardDateToMs);
    });
  }, [
    archivedSchedulerIdSet,
    dashboardDateFromMs,
    dashboardDateToMs,
    dashboardSearchQuery,
    dashboardStatusFilterSet,
    enrichedSchedulers,
  ]);
  const filteredSchedulerIdSet = useMemo(
    () => new Set(filteredEnrichedSchedulers.map((scheduler) => scheduler.id)),
    [filteredEnrichedSchedulers]
  );

  // Filter into categories
  const upcomingOpen = useMemo(() => {
    return filteredEnrichedSchedulers.filter(
      (s) => s.status === "OPEN" && !archivedPolls.includes(s.id)
    );
  }, [filteredEnrichedSchedulers, archivedPolls]);
  const groupNameById = useMemo(() => {
    const map = new Map();
    (groups || []).forEach((group) => {
      map.set(group.id, group.name || "Questing group");
    });
    return map;
  }, [groups]);
  const schedulerMetaById = useMemo(() => {
    const map = new Map();
    enrichedSchedulers.forEach((scheduler) => {
      map.set(scheduler.id, {
        title: scheduler.title || "Session poll",
        status: scheduler.status,
        participantIds: scheduler.effectiveParticipantIds || [],
        questingGroupId: scheduler.questingGroupId || null,
        creatorId: scheduler.creatorId || null,
      });
    });
    return map;
  }, [enrichedSchedulers]);
  const dashboardSchedulerIds = useMemo(
    () =>
      enrichedSchedulers
        .filter((scheduler) => !archivedPolls.includes(scheduler.id))
        .map((scheduler) => scheduler.id),
    [enrichedSchedulers, archivedPolls]
  );
  const groupIdsKey = useMemo(
    () => Array.from(new Set((groupIds || []).filter(Boolean))).sort().join("|"),
    [groupIds]
  );
  const dashboardSchedulerIdsKey = useMemo(
    () =>
      Array.from(new Set((dashboardSchedulerIds || []).filter(Boolean)))
        .sort()
        .join("|"),
    [dashboardSchedulerIds]
  );

  const upcomingFinalized = useMemo(() => {
    const now = new Date();
    return filteredEnrichedSchedulers.filter((s) => {
      if (s.status !== "FINALIZED" || archivedPolls.includes(s.id)) return false;
      if (!s.winningSlot?.start) return false;
      return new Date(s.winningSlot.start) > now;
    });
  }, [filteredEnrichedSchedulers, archivedPolls]);

  const pastFinalized = useMemo(() => {
    const now = new Date();
    return filteredEnrichedSchedulers.filter((s) => {
      if (s.status !== "FINALIZED" || archivedPolls.includes(s.id)) return false;
      if (!s.winningSlot?.start) return true; // No date = past
      return new Date(s.winningSlot.start) <= now;
    });
  }, [filteredEnrichedSchedulers, archivedPolls]);

  const cancelledSessions = useMemo(() => {
    return filteredEnrichedSchedulers.filter(
      (s) => s.status === "CANCELLED" && !archivedPolls.includes(s.id)
    );
  }, [filteredEnrichedSchedulers, archivedPolls]);

  const archivedSessions = useMemo(() => {
    return filteredEnrichedSchedulers.filter((s) => archivedPolls.includes(s.id));
  }, [filteredEnrichedSchedulers, archivedPolls]);

  const mySessions = useMemo(() => {
    return mine.data.filter((scheduler) => {
      if (!filteredSchedulerIdSet.has(scheduler.id)) return false;
      if (archivedPolls.includes(scheduler.id)) return false;
      if (!selectedGroupFilterId) return true;
      return scheduler.questingGroupId === selectedGroupFilterId;
    });
  }, [mine.data, filteredSchedulerIdSet, archivedPolls, selectedGroupFilterId]);

  // Find the next upcoming finalized session
  const nextSession = useMemo(() => {
    const sorted = [...upcomingFinalized].sort((a, b) => {
      const aDate = a.winningSlot?.start ? new Date(a.winningSlot.start) : new Date(9999, 0);
      const bDate = b.winningSlot?.start ? new Date(b.winningSlot.start) : new Date(9999, 0);
      return aDate - bDate;
    });
    return sorted[0] || null;
  }, [upcomingFinalized]);

  // Sessions that need user's vote - check if user has actually voted
  const needsVote = useMemo(() => {
    if (!user?.uid) return new Set();
    return new Set(
      upcomingOpen
        .filter((s) => {
          const voters = s.voters || [];
          const hasVoted = voters.some((v) => v.id === user.uid);
          return !hasVoted;
        })
        .map((s) => s.id)
    );
  }, [upcomingOpen, user?.uid]);

  // All sessions for calendar view
  const calendarSessions = useMemo(() => {
    return [...upcomingFinalized, ...pastFinalized];
  }, [upcomingFinalized, pastFinalized]);

  // Sessions for mobile agenda view (includes open polls)
  const mobileAgendaSessions = useMemo(() => {
    return [...upcomingOpen, ...upcomingFinalized];
  }, [upcomingOpen, upcomingFinalized]);

  // Detect conflicts between finalized sessions
  const conflictMap = useMemo(() => {
    const conflicts = new Map();
    const finalizedWithDates = upcomingFinalized.filter((s) => s.winningSlot?.start && s.winningSlot?.end);

    for (let i = 0; i < finalizedWithDates.length; i++) {
      for (let j = i + 1; j < finalizedWithDates.length; j++) {
        const a = finalizedWithDates[i];
        const b = finalizedWithDates[j];
        const aStart = new Date(a.winningSlot.start);
        const aEnd = new Date(a.winningSlot.end);
        const bStart = new Date(b.winningSlot.start);
        const bEnd = new Date(b.winningSlot.end);

        // Check if they overlap
        if (aStart < bEnd && bStart < aEnd) {
          if (!conflicts.has(a.id)) conflicts.set(a.id, []);
          if (!conflicts.has(b.id)) conflicts.set(b.id, []);
          conflicts.get(a.id).push(b.title || "Untitled");
          conflicts.get(b.id).push(a.title || "Untitled");
        }
      }
    }
    return conflicts;
  }, [upcomingFinalized]);

  // Create a lookup map for groups by ID
  const groupsById = useMemo(() => {
    const map = {};
    (groups || []).forEach((g) => {
      map[g.id] = g;
    });
    return map;
  }, [groups]);

  const isLoading =
    allParticipatingById.loading ||
    groupPollsLoading ||
    mine.loading ||
    settingsLoading ||
    pendingInvitesLoading;
  const { basicPollSourceItems, basicPollLoading } = useDashboardBasicPollSource({
    userId: user?.uid,
    groupIdsKey,
    dashboardSchedulerIdsKey,
    isReady: !isLoading,
    refreshNonce: basicPollRefreshNonce,
  });

  const basicPollItems = useMemo(() => {
    return deriveDashboardBasicPollItems({
      basicPollSourceItems,
      selectedGroupFilterId,
      archivedPolls,
      schedulerMetaById,
      groupsById,
      groupNameById,
      getGroupColor,
      userId: user?.uid,
    });
  }, [
    archivedPolls,
    basicPollSourceItems,
    getGroupColor,
    groupNameById,
    groupsById,
    schedulerMetaById,
    selectedGroupFilterId,
    user?.uid,
  ]);
  const basicPollVoterIds = useMemo(
    () =>
      Array.from(
        new Set(
          (basicPollSourceItems || []).flatMap((poll) =>
            Array.isArray(poll?.voterIds) ? poll.voterIds : []
          )
        )
      ),
    [basicPollSourceItems]
  );
  const { profiles: basicPollVoterProfilesById } = useUserProfilesByIds(basicPollVoterIds);
  const pollCardProfilesById = useMemo(
    () => ({
      ...(participantProfilesById || {}),
      ...(basicPollVoterProfilesById || {}),
    }),
    [basicPollVoterProfilesById, participantProfilesById]
  );
  const filteredBasicPollItems = useMemo(() => {
    return basicPollItems.filter((poll) => {
      const status = resolveBasicPollDashboardStatus(poll);
      if (dashboardStatusFilterSet.size > 0 && !dashboardStatusFilterSet.has(status)) {
        return false;
      }
      if (!matchesSearch([poll.title, poll.description], dashboardSearchQuery)) {
        return false;
      }
      return isWithinDateWindow(poll.deadlineAt, dashboardDateFromMs, dashboardDateToMs);
    });
  }, [
    basicPollItems,
    dashboardDateFromMs,
    dashboardDateToMs,
    dashboardSearchQuery,
    dashboardStatusFilterSet,
  ]);
  const basicPollBuckets = useMemo(
    () => bucketDashboardBasicPolls(filteredBasicPollItems),
    [filteredBasicPollItems]
  );
  const visibleBasicPolls = useMemo(
    () =>
      (basicPollBuckets[basicPollTab] || []).map((poll) => ({
        ...poll,
        eligibleUsers: buildUsersFromIds(poll.eligibleIds, pollCardProfilesById),
        votedUsers: buildUsersFromIds(poll.voterIds, pollCardProfilesById),
        pendingUsers: buildUsersFromIds(poll.pendingIds, pollCardProfilesById),
      })),
    [basicPollBuckets, basicPollTab, pollCardProfilesById]
  );

  const handleEditBasicPoll = useCallback(
    (poll) => {
      if (poll?.parentType === "group" && poll?.parentId && poll?.pollId) {
        setActiveGroupPollModal(null);
        setCreateGeneralPollOpen(false);
        setEditingGeneralPoll({
          groupId: poll.parentId,
          pollId: poll.pollId,
          poll: {
            ...poll,
            parentType: "group",
            parentId: poll.parentId,
            pollId: poll.pollId,
          },
        });
        return;
      }
      if (!poll?.voteLink) return;
      safeNavigate(poll.voteLink, { compareMode: "pathname+search" });
    },
    [safeNavigate]
  );

  const handleOpenBasicPoll = useCallback(
    (poll) => {
      if (!poll?.voteLink) return;
      if (poll.parentType === "group") {
        setActiveGroupPollModal({
          groupId: poll.parentId,
          pollId: poll.pollId,
        });
        return;
      }
      safeNavigate(poll.voteLink, { compareMode: "pathname+search" });
    },
    [safeNavigate]
  );

  const handleCreatedGeneralPoll = useCallback(
    (pollId, groupId) => {
      refreshBasicPolls();
      if (!pollId || !groupId) return;
      setActiveGroupPollModal({
        groupId,
        pollId,
      });
    },
    [refreshBasicPolls]
  );

  const handleEditedGeneralPoll = useCallback(
    (pollId, groupId) => {
      setEditingGeneralPoll(null);
      refreshBasicPolls();
      if (!pollId || !groupId) return;
      setActiveGroupPollModal({ groupId, pollId });
    },
    [refreshBasicPolls]
  );

  const handleOpenInvite = (inviteId) => {
    const target = `/scheduler/${inviteId}`;
    safeNavigate(target);
  };

  const markPendingInviteHandled = (inviteId) => {
    setPendingInviteHandledIds((prev) => {
      const next = new Set(prev);
      next.add(inviteId);
      return next;
    });
  };

  const setInviteBusy = (inviteId, isBusy) => {
    setPendingInviteBusy((prev) => ({
      ...prev,
      [inviteId]: isBusy,
    }));
  };

  const handleDeclineInvite = async (invite) => {
    if (!invite) return;
    setInviteBusy(invite.id, true);
    try {
      await declineInvite(invite.id);
      [
        pollInviteNotificationId(invite.id, user?.email),
        pollInviteLegacyNotificationId(invite.id),
      ]
        .filter(Boolean)
        .forEach((id) => removeNotification(id));
      markPendingInviteHandled(invite.id);
    } catch (err) {
      console.error("Failed to decline poll invite:", err);
    } finally {
      setInviteBusy(invite.id, false);
    }
  };

  const handleAcceptInvite = async (invite) => {
    if (!invite) return;
    setInviteBusy(invite.id, true);
    try {
      await acceptInvite(invite.id);
      [
        pollInviteNotificationId(invite.id, user?.email),
        pollInviteLegacyNotificationId(invite.id),
      ]
        .filter(Boolean)
        .forEach((id) => removeNotification(id));
      markPendingInviteHandled(invite.id);
    } catch (err) {
      console.error("Failed to accept poll invite:", err);
    } finally {
      setInviteBusy(invite.id, false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <LoadingState message="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Next Session Highlight */}
      {nextSession && (
        <NextSessionCard
          scheduler={nextSession}
          winningSlot={nextSession.winningSlot}
          groupColor={
            nextSession.questingGroupId
              ? getGroupColor(nextSession.questingGroupId)
              : null
          }
          participants={nextSession.effectiveParticipants || []}
          displayTimeZone={nextSession.displayTimeZone}
          showTimeZone={nextSession.showTimeZone}
        />
      )}

      <DashboardFilterBar
        visibleDashboardFilterKeys={visibleDashboardFilterKeys}
        dashboardFilterEditor={dashboardFilterEditor}
        handleDashboardFilterEditorOpenChange={handleDashboardFilterEditorOpenChange}
        removeDashboardFilter={removeDashboardFilter}
        dashboardGroupFilterLabel={dashboardGroupFilterLabel}
        selectedGroupFilterColor={selectedGroupFilterColor}
        dashboardStatusChipLabel={dashboardStatusChipLabel}
        dashboardDateChipLabel={dashboardDateChipLabel}
        selectedGroupFilterId={selectedGroupFilterId}
        setSelectedGroupFilterId={setSelectedGroupFilterId}
        groups={groups}
        getGroupColor={getGroupColor}
        dashboardStatusFilterSet={dashboardStatusFilterSet}
        toggleDashboardStatusFilter={toggleDashboardStatusFilter}
        dashboardStatusFilters={dashboardStatusFilters}
        setDashboardStatusFilters={setDashboardStatusFilters}
        effectiveDashboardDateFrom={effectiveDashboardDateFrom}
        effectiveDashboardDateTo={effectiveDashboardDateTo}
        setDashboardDateFrom={setDashboardDateFrom}
        setDashboardDateTo={setDashboardDateTo}
        handleDashboardDateFromChange={handleDashboardDateFromChange}
        handleDashboardDateToChange={handleDashboardDateToChange}
        dashboardFilterPickerOpen={dashboardFilterPickerOpen}
        setDashboardFilterPickerOpen={setDashboardFilterPickerOpen}
        availableDashboardFilters={availableDashboardFilters}
        handleAddDashboardFilter={handleAddDashboardFilter}
        dashboardSearchText={dashboardSearchText}
        setDashboardSearchText={setDashboardSearchText}
      />

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar / Upcoming Sessions - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Calendar Section */}
          <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
            <SectionHeader
              title="Upcoming Sessions"
              subtitle="Session polls and finalized sessions"
            />

            <div className="mt-4">
              {isMobile ? (
                <MobileAgendaView
                  sessions={mobileAgendaSessions}
                  getGroupColor={getGroupColor}
                  needsVote={needsVote}
                />
              ) : (
                <DashboardCalendar
                  sessions={calendarSessions}
                  getGroupColor={getGroupColor}
                  focusedDate={dashboardDateFrom}
                  height={400}
                />
              )}
            </div>

            {/* Session List Below Calendar */}
            {(upcomingOpen.length > 0 || upcomingFinalized.length > 0) && (
              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Finalized Sessions
                  </p>
                  {upcomingFinalized.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No finalized sessions yet.
                    </p>
                  )}
                  {upcomingFinalized.map((scheduler) => (
                    <SessionCard
                      key={scheduler.id}
                      scheduler={scheduler}
                      winningSlot={scheduler.winningSlot}
                      slots={scheduler.slots}
                      displayTimeZone={scheduler.displayTimeZone}
                      showTimeZone={scheduler.showTimeZone}
                      conflictsWith={conflictMap.get(scheduler.id) || []}
                      attendanceSummary={scheduler.attendanceSummary}
                      groupColor={
                        scheduler.questingGroupId
                          ? getGroupColor(scheduler.questingGroupId)
                            : null
                        }
                        participants={scheduler.effectiveParticipants || []}
                        voters={scheduler.voters || []}
                        questingGroup={
                          scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null
                        }
                      />
                    ))}
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Pending Sessions
                  </p>
                  {upcomingOpen.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No pending session polls right now.
                    </p>
                  )}
                  {upcomingOpen.map((scheduler) => (
                    <SessionCard
                      key={scheduler.id}
                      scheduler={scheduler}
                      showVoteNeeded={needsVote.has(scheduler.id)}
                      slots={scheduler.slots}
                      displayTimeZone={scheduler.displayTimeZone}
                      showTimeZone={scheduler.showTimeZone}
                      attendanceSummary={scheduler.attendanceSummary}
                      groupColor={
                        scheduler.questingGroupId
                          ? getGroupColor(scheduler.questingGroupId)
                          : null
                      }
                      participants={scheduler.effectiveParticipants || []}
                      voters={scheduler.voters || []}
                      votedCount={scheduler.votedCount}
                      questingGroup={
                        scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {upcomingOpen.length === 0 && upcomingFinalized.length === 0 && (
              <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
                No upcoming sessions. Create a new poll to get started!
              </div>
            )}
          </section>
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          <PendingInvitesSection
            visiblePendingInvites={visiblePendingInvites}
            normalizedUserEmail={normalizedUserEmail}
            inviterMap={inviterMap}
            pendingInviteBusy={pendingInviteBusy}
            onOpenInvite={handleOpenInvite}
            onAcceptInvite={handleAcceptInvite}
            onDeclineInvite={handleDeclineInvite}
          />
          <GeneralPollsSection
            hasQuestingGroupMembership={hasQuestingGroupMembership}
            canCreateGeneralPoll={canCreateGeneralPoll}
            onCreateGeneralPoll={() => setCreateGeneralPollOpen(true)}
            basicPollTab={basicPollTab}
            setBasicPollTab={setBasicPollTab}
            basicPollBuckets={basicPollBuckets}
            basicPollLoading={basicPollLoading}
            visibleBasicPolls={visibleBasicPolls}
            basicPollArchiveBusy={basicPollArchiveBusy}
            basicPollActionBusy={basicPollActionBusy}
            onOpenBasicPoll={handleOpenBasicPoll}
            onToggleBasicPollArchive={handleToggleBasicPollArchive}
            onFinalizeBasicPoll={handleFinalizeBasicPoll}
            onReopenBasicPoll={handleReopenBasicPoll}
            onEditBasicPoll={handleEditBasicPoll}
            onDeleteBasicPoll={handleDeleteBasicPoll}
          />
          {/* My Session Polls */}
          <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
            <SectionHeader
              title="My Session Polls"
              subtitle="Polls you created"
              action={
                <Link
                  to="/create"
                  className="flex items-center gap-1 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90"
                >
                  <Plus className="h-3 w-3" />
                  New poll
                </Link>
              }
            />

            <div className="mt-4 space-y-2">
              {mySessions.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You haven't created any polls yet.
                </p>
              )}
              {mySessions.slice(0, 5).map((scheduler) => {
                // Find enriched version if available
                const enriched = enrichedSchedulers.find((s) => s.id === scheduler.id);
                return (
                  <SessionCard
                    key={scheduler.id}
                    scheduler={scheduler}
                    winningSlot={enriched?.winningSlot}
                    slots={enriched?.slots || []}
                    displayTimeZone={enriched?.displayTimeZone || scheduler.timezone}
                    showTimeZone={enriched?.showTimeZone ?? showTimeZone}
                    groupColor={
                      scheduler.questingGroupId
                        ? getGroupColor(scheduler.questingGroupId)
                        : null
                    }
                    attendanceSummary={enriched?.attendanceSummary}
                    participants={enriched?.effectiveParticipants || []}
                    voters={enriched?.voters || []}
                    questingGroup={scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null}
                  />
                );
              })}
              {mySessions.length > 5 && (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  +{mySessions.length - 5} more
                </p>
              )}
            </div>
          </section>

          <PastSessionsSection
            pastSessionsTab={pastSessionsTab}
            onTabChange={setPastSessionsTab}
            pastFinalized={pastFinalized}
            cancelledSessions={cancelledSessions}
            archivedSessions={archivedSessions}
            getGroupColor={getGroupColor}
            groupsById={groupsById}
          />
        </div>
      </div>
      <CreateGroupPollModal
        open={createGeneralPollOpen}
        onOpenChange={setCreateGeneralPollOpen}
        groupOptions={generalPollCreationGroups}
        initialGroupId={defaultCreateGeneralPollGroupId}
        creatorId={user?.uid}
        onCreated={handleCreatedGeneralPoll}
      />
      <CreateGroupPollModal
        open={Boolean(editingGeneralPoll)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingGeneralPoll(null);
        }}
        mode="edit"
        groupId={editingGeneralPoll?.groupId || null}
        groupName={
          editingGeneralPoll?.groupId
            ? groupNameById.get(editingGeneralPoll.groupId) || "Questing group"
            : "Questing group"
        }
        initialPoll={editingGeneralPoll?.poll || null}
        onEdited={handleEditedGeneralPoll}
      />
      {activeGroupPollModal ? (
        <GroupBasicPollModal
          groupId={activeGroupPollModal.groupId}
          pollId={activeGroupPollModal.pollId}
          onClose={() => setActiveGroupPollModal(null)}
          onEditPoll={(pollDetails) => {
            if (!pollDetails?.groupId || !pollDetails?.pollId) return;
            setActiveGroupPollModal(null);
            setEditingGeneralPoll({
              groupId: pollDetails.groupId,
              pollId: pollDetails.pollId,
              poll: {
                ...(pollDetails.poll || {}),
                parentType: "group",
                parentId: pollDetails.groupId,
                pollId: pollDetails.pollId,
              },
            });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deletePollRequest)}
        onOpenChange={(open) => {
          if (!open) clearDeletePollRequest();
        }}
        title={`Delete "${deletePollRequest?.title || "this poll"}"?`}
        description="This will remove all votes and cannot be undone."
        confirmLabel="Delete poll"
        confirming={Boolean(
          deletePollRequest?.archiveKey &&
            basicPollActionBusy[`${deletePollRequest.archiveKey}:delete`]
        )}
        onConfirm={confirmDeleteBasicPoll}
        variant="destructive"
      />
    </div>
  );
}
