import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, Plus, Search, X } from "lucide-react";
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
import {
  deleteBasicPoll,
  deleteEmbeddedBasicPoll,
  fetchDashboardEmbeddedBasicPolls,
  fetchDashboardGroupBasicPolls,
  finalizeBasicPollForParent,
  reopenBasicPollForParent,
} from "../../lib/data/basicPolls";
import { LoadingState } from "../../components/ui/spinner";
import { useUserProfiles, useUserProfilesByIds } from "../../hooks/useUserProfiles";
import { UserIdentity } from "../../components/UserIdentity";
import { useSchedulerAttendance } from "./hooks/useSchedulerAttendance";
import { normalizeEmail } from "../../lib/utils";
import { coerceDate, resolveDisplayTimeZone, shouldShowTimeZone } from "../../lib/time";
import { NextSessionCard } from "./components/NextSessionCard";
import { SessionCard } from "./components/SessionCard";
import { DashboardCalendar } from "./components/DashboardCalendar";
import { MobileAgendaView } from "./components/MobileAgendaView";
import { buildAttendanceSummary } from "./lib/attendance";
import { PastSessionsSection } from "./components/past-sessions-section";
import { SectionHeader } from "./components/section-header";
import { TabButton } from "./components/tab-button";
import { BasicPollCard } from "../../components/polls/basic-poll-card";
import { GroupBasicPollModal } from "./components/group-basic-poll-modal";
import { CreateGroupPollModal } from "../basic-polls/components/CreateGroupPollModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { DatePicker } from "../../components/ui/date-picker";

const toDate = coerceDate;

function resolvePollDeadline(poll = {}) {
  return toDate(poll?.settings?.deadlineAt || poll?.deadlineAt || null);
}

function buildBasicPollArchiveKey(poll) {
  if (!poll?.parentType || !poll?.parentId || !poll?.pollId) return null;
  return `basic:${poll.parentType}:${poll.parentId}:${poll.pollId}`;
}

function toCardUser(profile = {}, userId) {
  return {
    id: userId,
    email: profile?.email || `user:${userId}`,
    avatar: profile?.photoURL || null,
    displayName: profile?.displayName || userId,
  };
}

function canManageGroupPoll(group, userId) {
  if (!group || !userId) return false;
  return (
    group.creatorId === userId ||
    (group.memberManaged === true &&
      Array.isArray(group.memberIds) &&
      group.memberIds.includes(userId)) ||
    (group.memberPermissionsEnabled === true &&
      group.memberPermissions?.[userId]?.isManager === true)
  );
}

const DASHBOARD_STATUS_OPTIONS = [
  {
    value: "OPEN",
    label: "Open",
    description: "Open session polls and open general polls.",
  },
  {
    value: "FINALIZED",
    label: "Finalized",
    description: "Finalized session polls and finalized general polls.",
  },
  {
    value: "CANCELLED",
    label: "Cancelled",
    description: "Cancelled session polls.",
  },
  {
    value: "CLOSED",
    label: "Closed",
    description: "Closed general polls that are not finalized.",
  },
  {
    value: "ARCHIVED",
    label: "Archived",
    description: "Archived session and general polls.",
  },
];

const DASHBOARD_STATUS_ORDER = DASHBOARD_STATUS_OPTIONS.map((option) => option.value);

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesSearch(fields, query) {
  if (!query) return true;
  const haystack = fields
    .map((field) => String(field || ""))
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function toDayStartMs(value) {
  const date = toDate(value);
  if (!date) return null;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function toDayEndMs(value) {
  const date = toDate(value);
  if (!date) return null;
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

function isWithinDateWindow(value, fromMs, toMs) {
  if (fromMs === null && toMs === null) return true;
  const date = toDate(value);
  if (!date) return false;
  const time = date.getTime();
  if (fromMs !== null && time < fromMs) return false;
  if (toMs !== null && time > toMs) return false;
  return true;
}

function resolveSessionDashboardStatus(scheduler, archivedPollSet) {
  if (archivedPollSet.has(scheduler.id)) return "ARCHIVED";
  if (scheduler.status === "FINALIZED") return "FINALIZED";
  if (scheduler.status === "CANCELLED") return "CANCELLED";
  return "OPEN";
}

function resolveBasicPollDashboardStatus(poll) {
  if (poll.isArchived || poll.state === "ARCHIVED") return "ARCHIVED";
  if (poll.pollStatus === "FINALIZED") return "FINALIZED";
  if (poll.state === "CLOSED") return "CLOSED";
  return "OPEN";
}

function describeStatusFilterSelection(selectedValues) {
  if (!selectedValues?.length) return "Any status";
  if (selectedValues.length === 1) {
    const option = DASHBOARD_STATUS_OPTIONS.find((entry) => entry.value === selectedValues[0]);
    return option?.label || selectedValues[0];
  }
  return `${selectedValues.length} statuses`;
}

function describeDateFilterSelection(from, to) {
  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  const formatDate = (value) =>
    value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (fromDate && toDateValue) return `${formatDate(fromDate)} to ${formatDate(toDateValue)}`;
  if (fromDate) return `From ${formatDate(fromDate)}`;
  if (toDateValue) return `Until ${formatDate(toDateValue)}`;
  return "Date range";
}

function normalizeDateRangeBounds(from, to) {
  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  if (fromDate && toDateValue && fromDate.getTime() > toDateValue.getTime()) {
    return { from: toDateValue, to: fromDate };
  }
  return { from: fromDate, to: toDateValue };
}

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
  const navigate = useNavigate();
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
  const [basicPollSourceItems, setBasicPollSourceItems] = useState([]);
  const [basicPollLoading, setBasicPollLoading] = useState(false);
  const [basicPollArchiveBusy, setBasicPollArchiveBusy] = useState({});
  const [basicPollActionBusy, setBasicPollActionBusy] = useState({});
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
  const profileLookupIds = useMemo(
    () => Array.from(new Set([...allParticipantIds, ...allGroupMemberIds, ...basicPollVoterIds])),
    [allParticipantIds, allGroupMemberIds, basicPollVoterIds]
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

  useEffect(() => {
    let cancelled = false;

    async function loadBasicPolls() {
      if (!user?.uid) {
        setBasicPollSourceItems([]);
        return;
      }

      const groupIdsForFetch = groupIdsKey ? groupIdsKey.split("|") : [];
      const schedulerIdsForFetch = dashboardSchedulerIdsKey
        ? dashboardSchedulerIdsKey.split("|")
        : [];

      setBasicPollLoading(true);
      try {
        const [groupPolls, embeddedPolls] = await Promise.all([
          fetchDashboardGroupBasicPolls(groupIdsForFetch, user.uid),
          fetchDashboardEmbeddedBasicPolls(schedulerIdsForFetch, user.uid),
        ]);

        if (!cancelled) {
          setBasicPollSourceItems([...(groupPolls || []), ...(embeddedPolls || [])]);
        }
      } catch (error) {
        console.error("Failed to load dashboard basic polls:", error);
        if (!cancelled) setBasicPollSourceItems([]);
      } finally {
        if (!cancelled) setBasicPollLoading(false);
      }
    }

    if (!isLoading) {
      loadBasicPolls();
    }

    return () => {
      cancelled = true;
    };
  }, [
    basicPollRefreshNonce,
    dashboardSchedulerIdsKey,
    groupIdsKey,
    isLoading,
    user?.uid,
  ]);

  const basicPollItems = useMemo(() => {
    return (basicPollSourceItems || [])
      .map((poll) => {
        const schedulerMeta =
          poll.parentType === "scheduler" ? schedulerMetaById.get(poll.parentId) || null : null;
        const group = poll.parentType === "group" ? groupsById[poll.parentId] || null : null;
        if (selectedGroupFilterId) {
          if (poll.parentType === "group" && poll.parentId !== selectedGroupFilterId) return null;
          if (
            poll.parentType === "scheduler" &&
            schedulerMeta?.questingGroupId !== selectedGroupFilterId
          ) {
            return null;
          }
        }
        const archiveKey = buildBasicPollArchiveKey(poll);
        const deadlineAt = resolvePollDeadline(poll);
        const isDeadlineOpen = !deadlineAt || deadlineAt.getTime() > Date.now();
        const pollStatus = poll?.status || "OPEN";
        const isOpen =
          pollStatus === "OPEN" &&
          isDeadlineOpen &&
          (poll.parentType !== "scheduler" || schedulerMeta?.status !== "CANCELLED");
        const isArchived = Boolean(archiveKey && archivedPolls.includes(archiveKey));
        const state = isArchived
          ? "ARCHIVED"
          : isOpen
            ? poll.hasVoted
              ? "OPEN_VOTED"
              : "NEEDS_VOTE"
            : "CLOSED";
        const eligibleIds =
          poll.parentType === "group"
            ? (group?.memberIds || []).filter(Boolean)
            : (schedulerMeta?.participantIds || []).filter(Boolean);
        const voterIds = Array.from(
          new Set((Array.isArray(poll.voterIds) ? poll.voterIds : []).filter(Boolean))
        );
        const votedIdSet = new Set(voterIds);
        const pendingIds = eligibleIds.filter((userId) => !votedIdSet.has(userId));
        const canManage =
          poll.parentType === "group"
            ? canManageGroupPoll(group, user?.uid)
            : Boolean(schedulerMeta?.creatorId && user?.uid && schedulerMeta.creatorId === user.uid);

        return {
          ...poll,
          archiveKey,
          isArchived,
          state,
          isOpen,
          deadlineAt,
          pollStatus,
          contextLabel:
            poll.parentType === "group"
              ? `in ${groupNameById.get(poll.parentId) || "Questing group"}`
              : `in ${schedulerMeta?.title || "Session poll"}`,
          accentColor:
            poll.parentType === "group"
              ? getGroupColor(poll.parentId)
              : schedulerMeta?.questingGroupId
                ? getGroupColor(schedulerMeta.questingGroupId)
                : null,
          voteLink:
            poll.parentType === "group"
              ? `/groups/${poll.parentId}/polls/${poll.pollId}`
              : `/scheduler/${poll.parentId}?poll=${poll.pollId}`,
          eligibleIds,
          voterIds,
          pendingIds,
          eligibleCount: eligibleIds.length,
          votedCount: voterIds.length,
          canManage,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const stateOrder = {
          NEEDS_VOTE: 0,
          OPEN_VOTED: 1,
          CLOSED: 2,
          ARCHIVED: 3,
        };
        const leftState = stateOrder[left.state] ?? 99;
        const rightState = stateOrder[right.state] ?? 99;
        if (leftState !== rightState) return leftState - rightState;
        const leftDeadline = left.deadlineAt ? left.deadlineAt.getTime() : Number.MAX_SAFE_INTEGER;
        const rightDeadline = right.deadlineAt ? right.deadlineAt.getTime() : Number.MAX_SAFE_INTEGER;
        if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
        return String(left.title || "").localeCompare(String(right.title || ""));
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

  const buildUsersFromIds = useCallback(
    (userIds = []) => {
      return (userIds || []).map((userId) => toCardUser(participantProfilesById[userId] || {}, userId));
    },
    [participantProfilesById]
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
  const basicPollBuckets = useMemo(() => {
    return {
      "needs-vote": filteredBasicPollItems.filter((poll) => poll.state === "NEEDS_VOTE"),
      "open-voted": filteredBasicPollItems.filter((poll) => poll.state === "OPEN_VOTED"),
      closed: filteredBasicPollItems.filter((poll) => poll.state === "CLOSED"),
      archived: filteredBasicPollItems.filter((poll) => poll.state === "ARCHIVED"),
    };
  }, [filteredBasicPollItems]);
  const visibleBasicPolls = useMemo(
    () =>
      (basicPollBuckets[basicPollTab] || []).map((poll) => ({
        ...poll,
        eligibleUsers: buildUsersFromIds(poll.eligibleIds),
        votedUsers: buildUsersFromIds(poll.voterIds),
        pendingUsers: buildUsersFromIds(poll.pendingIds),
      })),
    [basicPollBuckets, basicPollTab, buildUsersFromIds]
  );

  const handleToggleBasicPollArchive = useCallback(
    async (poll) => {
      if (!poll?.archiveKey) return;
      setBasicPollArchiveBusy((current) => ({ ...current, [poll.archiveKey]: true }));
      try {
        if (poll.isArchived) {
          await unarchivePoll(poll.archiveKey);
        } else {
          await archivePoll(poll.archiveKey);
        }
      } catch (error) {
        console.error("Failed to update basic poll archive state:", error);
      } finally {
        setBasicPollArchiveBusy((current) => ({ ...current, [poll.archiveKey]: false }));
      }
    },
    [archivePoll, unarchivePoll]
  );

  const withBasicPollActionBusy = useCallback(async (poll, actionKey, actionFn) => {
    if (!poll?.archiveKey || !actionKey || typeof actionFn !== "function") return;
    const busyKey = `${poll.archiveKey}:${actionKey}`;
    setBasicPollActionBusy((current) => ({ ...current, [busyKey]: true }));
    try {
      await actionFn();
    } finally {
      setBasicPollActionBusy((current) => ({ ...current, [busyKey]: false }));
    }
  }, []);

  const handleFinalizeBasicPoll = useCallback(
    async (poll) => {
      if (!poll?.parentType || !poll?.parentId || !poll?.pollId) return;
      await withBasicPollActionBusy(poll, "finalize", async () => {
        await finalizeBasicPollForParent(poll.parentType, poll.parentId, poll.pollId);
        refreshBasicPolls();
      });
    },
    [refreshBasicPolls, withBasicPollActionBusy]
  );

  const handleReopenBasicPoll = useCallback(
    async (poll) => {
      if (!poll?.parentType || !poll?.parentId || !poll?.pollId) return;
      await withBasicPollActionBusy(poll, "reopen", async () => {
        await reopenBasicPollForParent(poll.parentType, poll.parentId, poll.pollId);
        refreshBasicPolls();
      });
    },
    [refreshBasicPolls, withBasicPollActionBusy]
  );

  const handleDeleteBasicPoll = useCallback(
    async (poll) => {
      if (!poll?.parentType || !poll?.parentId || !poll?.pollId) return;
      const confirmed = window.confirm(
        `Delete "${poll.title || "this poll"}"? This will remove all votes.`
      );
      if (!confirmed) return;
      await withBasicPollActionBusy(poll, "delete", async () => {
        if (poll.parentType === "group") {
          await deleteBasicPoll(poll.parentId, poll.pollId, { useServer: true });
        } else {
          await deleteEmbeddedBasicPoll(poll.parentId, poll.pollId, { useServer: true });
        }
        refreshBasicPolls();
      });
    },
    [refreshBasicPolls, withBasicPollActionBusy]
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

      <section className="rounded-2xl border border-slate-200/70 bg-white/95 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          <div className="order-1 flex flex-wrap items-center gap-2 md:order-2 md:flex-nowrap">
            {visibleDashboardFilterKeys.map((filterKey) => {
              let label = "";
              let accentColor = null;
              if (filterKey === "group") {
                label = dashboardGroupFilterLabel;
                accentColor = selectedGroupFilterColor;
              } else if (filterKey === "status") {
                label = dashboardStatusChipLabel;
              } else if (filterKey === "date") {
                label = dashboardDateChipLabel;
              }
              return (
                <Popover
                  key={filterKey}
                  open={dashboardFilterEditor === filterKey}
                  onOpenChange={(open) => handleDashboardFilterEditorOpenChange(filterKey, open)}
                >
                  <div className="group relative">
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 pr-7 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        title={`Edit ${filterKey} filter`}
                      >
                        <span aria-hidden="true" className="inline-flex w-3.5 justify-center">
                          {filterKey === "group" ? (
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: accentColor || "#94a3b8" }}
                            />
                          ) : null}
                        </span>
                        <span className="max-w-[220px] truncate text-center leading-none">
                          {label}
                        </span>
                        <span aria-hidden="true" className="inline-flex w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeDashboardFilter(filterKey);
                      }}
                      className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 opacity-0 transition-opacity hover:bg-slate-400/15 hover:text-slate-700 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-600/30 dark:hover:text-slate-200"
                      aria-label={`Remove ${filterKey} filter`}
                      title={`Remove ${filterKey} filter`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <PopoverContent
                    align="end"
                    className={filterKey === "date" ? "w-[30rem] p-3" : "w-72 p-3"}
                  >
                    {filterKey === "group" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Questing group
                        </p>
                        <Select
                          value={selectedGroupFilterId || "none"}
                          onValueChange={(value) =>
                            setSelectedGroupFilterId(value === "none" ? null : value)
                          }
                        >
                          <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm dark:border-slate-600 dark:bg-slate-900">
                            <SelectValue placeholder="Select a questing group" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Choose a questing group</SelectItem>
                            {(groups || []).map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: getGroupColor(group.id) }}
                                  />
                                  <span>{group.name || "Questing group"}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    {filterKey === "status" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Status
                        </p>
                        <div className="space-y-1">
                          {DASHBOARD_STATUS_OPTIONS.map((option) => {
                            const checked = dashboardStatusFilterSet.has(option.value);
                            return (
                              <label
                                key={option.value}
                                className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                                title={option.description}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleDashboardStatusFilter(option.value)}
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand-primary focus:ring-brand-primary/40 dark:border-slate-600"
                                />
                                <span className="text-slate-700 dark:text-slate-200">{option.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        {dashboardStatusFilters.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setDashboardStatusFilters([])}
                            className="text-xs font-semibold text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {filterKey === "date" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Date range
                          </p>
                          {(effectiveDashboardDateFrom || effectiveDashboardDateTo) ? (
                            <button
                              type="button"
                              onClick={() => {
                                setDashboardDateFrom(null);
                                setDashboardDateTo(null);
                              }}
                              className="text-xs font-semibold text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <DatePicker
                            date={effectiveDashboardDateFrom}
                            onSelect={handleDashboardDateFromChange}
                            placeholder="From date"
                            className="h-10 min-w-[13rem] rounded-xl border-slate-200 text-sm dark:border-slate-600"
                          />
                          <DatePicker
                            date={effectiveDashboardDateTo}
                            onSelect={handleDashboardDateToChange}
                            placeholder="To date"
                            className="h-10 min-w-[13rem] rounded-xl border-slate-200 text-sm dark:border-slate-600"
                          />
                        </div>
                      </div>
                    ) : null}
                  </PopoverContent>
                </Popover>
              );
            })}
            <Popover open={dashboardFilterPickerOpen} onOpenChange={setDashboardFilterPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={availableDashboardFilters.length === 0}
                  className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Filter
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Add filter
                </p>
                <div className="space-y-1">
                  {availableDashboardFilters.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                      All filters are already active.
                    </p>
                  ) : (
                    availableDashboardFilters.map((filterOption) => (
                      <button
                        key={filterOption.key}
                        type="button"
                        onClick={() => handleAddDashboardFilter(filterOption.key)}
                        className="flex w-full flex-col items-start rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {filterOption.label}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {filterOption.description}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <label
            className="relative order-2 w-full min-w-0 md:order-1 md:min-w-[33%] md:flex-[1_1_32rem]"
            title="Search session and general poll titles and descriptions"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="search"
              value={dashboardSearchText}
              onChange={(event) => setDashboardSearchText(event.target.value)}
              placeholder="Search title or description"
              aria-label="Search title or description"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition-colors focus:border-brand-primary/70 focus:ring-2 focus:ring-brand-primary/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>
      </section>

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
          {visiblePendingInvites.length > 0 && (
            <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
              <SectionHeader
                title="Pending poll invites"
                subtitle="Session polls waiting for your response"
              />
              <div className="mt-4 space-y-2">
                {visiblePendingInvites.map((invite) => {
                  const meta = invite.pendingInviteMeta?.[normalizedUserEmail] || {};
                  const inviterEmail = meta.invitedByEmail || invite.creatorEmail || null;
                  const inviterProfile = inviterEmail
                    ? inviterMap.get(normalizeEmail(inviterEmail)) || { email: inviterEmail }
                    : null;
                  const isBusy = Boolean(pendingInviteBusy[invite.id]);
                  return (
                    <div
                      key={invite.id}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/40"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenInvite(invite.id)}
                        className="flex flex-1 flex-col text-left"
                      >
                        <p className="text-sm font-semibold">{invite.title || "Session Poll"}</p>
                        <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-200/80">
                          Invited by{" "}
                          {inviterProfile ? (
                            <UserIdentity user={inviterProfile} />
                          ) : (
                            "Unknown"
                          )}
                        </p>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-800/60 dark:text-amber-200">
                          Review
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Accept invite"
                            onClick={() => handleAcceptInvite(invite)}
                            disabled={isBusy}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Decline invite"
                            onClick={() => handleDeclineInvite(invite)}
                            disabled={isBusy}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
            <SectionHeader
              title="General Polls"
              subtitle="Standalone and add-on polls."
              action={
                hasQuestingGroupMembership ? (
                  <button
                    type="button"
                    aria-label="Create new general poll"
                    onClick={() => setCreateGeneralPollOpen(true)}
                    disabled={!canCreateGeneralPoll}
                    title={
                      canCreateGeneralPoll
                        ? "Create a new general poll"
                        : "You need manager access to create a general poll"
                    }
                    className="flex items-center gap-1 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    New poll
                  </button>
                ) : null
              }
            />
            <div className="mt-3 flex w-fit gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-700">
              <TabButton
                active={basicPollTab === "needs-vote"}
                onClick={() => setBasicPollTab("needs-vote")}
              >
                Needs vote ({basicPollBuckets["needs-vote"].length})
              </TabButton>
              <TabButton
                active={basicPollTab === "open-voted"}
                onClick={() => setBasicPollTab("open-voted")}
              >
                Open voted ({basicPollBuckets["open-voted"].length})
              </TabButton>
              <TabButton active={basicPollTab === "closed"} onClick={() => setBasicPollTab("closed")}>
                Closed ({basicPollBuckets.closed.length})
              </TabButton>
              <TabButton
                active={basicPollTab === "archived"}
                onClick={() => setBasicPollTab("archived")}
              >
                Archived ({basicPollBuckets.archived.length})
              </TabButton>
            </div>
            <div className="mt-4 space-y-3">
              {basicPollLoading ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading general polls...</p>
              ) : visibleBasicPolls.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {basicPollTab === "needs-vote"
                    ? "No open general polls need your vote right now."
                    : basicPollTab === "open-voted"
                      ? "No open general polls where you've already voted."
                      : basicPollTab === "closed"
                        ? "No closed general polls right now."
                        : "No archived general polls yet."}
                </p>
              ) : (
                visibleBasicPolls.slice(0, 5).map((poll) => (
                  <BasicPollCard
                    key={`${poll.parentType}:${poll.parentId}:${poll.pollId}`}
                    poll={poll}
                    onOpen={() => handleOpenBasicPoll(poll)}
                    onArchiveToggle={() => handleToggleBasicPollArchive(poll)}
                    archiveBusy={Boolean(basicPollArchiveBusy[poll.archiveKey])}
                    onFinalizePoll={() => handleFinalizeBasicPoll(poll)}
                    onReopenPoll={() => handleReopenBasicPoll(poll)}
                    onEditPoll={() => handleEditBasicPoll(poll)}
                    onDeletePoll={() => handleDeleteBasicPoll(poll)}
                    canManage={Boolean(poll.canManage)}
                    actionBusy={Boolean(
                      basicPollActionBusy[`${poll.archiveKey}:finalize`] ||
                        basicPollActionBusy[`${poll.archiveKey}:reopen`] ||
                        basicPollActionBusy[`${poll.archiveKey}:delete`]
                    )}
                  />
                ))
              )}
              {visibleBasicPolls.length > 5 ? (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  +{visibleBasicPolls.length - 5} more
                </p>
              ) : null}
            </div>
          </section>
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
    </div>
  );
}
