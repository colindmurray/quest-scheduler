import { serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, isSameDay, isBefore, startOfDay, startOfHour } from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import {
  Check,
  MoreVertical,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  RotateCcw,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { useAuth } from "../../app/useAuth";
import { useUserSettings } from "../../hooks/useUserSettings";
import { useFriends } from "../../hooks/useFriends";
import { useQuestingGroups } from "../../hooks/useQuestingGroups";
import { useCalendarNavigation } from "../../hooks/useCalendarNavigation";
import { useSchedulerData } from "./hooks/useSchedulerData";
import { useSchedulerEmbeddedPollVotes } from "./hooks/useSchedulerEmbeddedPollVotes";
import { useNotifications } from "../../hooks/useNotifications";
import { useUserProfiles, useUserProfilesByIds } from "../../hooks/useUserProfiles";
import {
  deleteSchedulerVote,
  deleteSchedulerWithRelatedData,
  fetchSchedulersByIds,
  setScheduler,
  updateScheduler,
  upsertSchedulerSlot,
  upsertSchedulerVote,
} from "../../lib/data/schedulers";
import { Switch } from "../../components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { AvatarBubble, AvatarStack, VotingAvatarStack } from "../../components/ui/voter-avatars";
import { buildColorMap } from "../../components/ui/voter-avatar-utils";
import { UserIdentity } from "../../components/UserIdentity";
import { LoadingState } from "../../components/ui/spinner";
import { CalendarJumpControls } from "../../components/ui/calendar-jump-controls";
import { PollStatusMeta } from "../../components/poll-status-meta";
import { buildEmailSet, isValidEmail, normalizeEmail, normalizeEmailList } from "../../lib/utils";
import { getUserLabel } from "../../lib/identity";
import { resolveIdentifier } from "../../lib/identifiers";
import {
  pollInviteNotificationId,
  pollInviteLegacyNotificationId,
} from "../../lib/data/notifications";
import { fetchPublicProfilesByIds, findUserIdByEmail, findUserIdsByEmails } from "../../lib/data/users";
import { acceptPollInvite, declinePollInvite, removeParticipantFromPoll, revokePollInvite } from "../../lib/data/pollInvites";
import {
  breakBasicPollTieForParent,
  cloneEmbeddedBasicPolls,
  deleteBasicPollVote,
  finalizeEmbeddedBasicPoll,
  fetchRequiredEmbeddedPollFinalizeSummary,
  reopenEmbeddedBasicPoll,
  submitBasicPollVote,
} from "../../lib/data/basicPolls";
import {
  addRankedOptionToVoteDraft,
  moveRankedOptionInVoteDraft,
  removeRankedOptionFromVoteDraft,
  setMultipleChoiceOptionOnVoteDraft,
  setOtherTextOnVoteDraft,
} from "../../lib/basic-polls/vote-draft";
import { hasSubmittedVoteForPoll } from "../../lib/basic-polls/vote-submission";
import { buildNotificationActor, emitPollEvent } from "../../lib/data/notification-events";
import { validateInviteCandidate } from "./utils/invite-utils";
import { nudgeDiscordSessionPoll, repostDiscordPollCard } from "../../lib/data/discord";
import { filterSlotsByRequiredAttendance } from "./utils/required-attendance";
import {
  formatZonedDateTimeRange,
  formatZonedTime,
  formatZonedTimeRange,
  resolveDisplayTimeZone,
  resolvePollTimeZone,
  shouldShowTimeZone,
  toDisplayDate,
} from "../../lib/time";
import { CloneDialog } from "./components/clone-dialog";
import { CopyVotesDialog } from "./components/copy-votes-dialog";
import { FinalizeDialog } from "./components/finalize-dialog";
import { PendingVotesDialog } from "./components/pending-votes-dialog";
import { FinalizeEmbeddedPollsChoiceDialog } from "./components/finalize-embedded-polls-choice-dialog";
import { RequiredEmbeddedFinalizeWarningDialog } from "./components/required-embedded-finalize-warning-dialog";
import { VoteDialog } from "./components/vote-dialog";
import { VoteToggle } from "./components/vote-toggle";
import { ReopenDialog } from "./components/reopen-dialog";
import { DeleteDialog } from "./components/delete-dialog";
import { CancelDialog } from "./components/cancel-dialog";
import { InvitePromptDialog } from "./components/invite-prompt-dialog";
import { LeaveDialog } from "./components/leave-dialog";
import { RemoveParticipantDialog } from "./components/remove-participant-dialog";
import { RevokeInviteDialog } from "./components/revoke-invite-dialog";
import { CalendarToolbar } from "./components/CalendarToolbar";
import { BasicPollVotingCard } from "../../components/polls/basic-poll-voting-card";
import { PollDiscordMetaRow } from "../../components/polls/poll-discord-meta-row";
import { PollMarkdownContent } from "../../components/polls/poll-markdown-content";
import { PollNudgeButton, getNudgeCooldownRemaining } from "../../components/polls/poll-nudge-button";
import { PollOptionNoteDialog } from "../../components/polls/poll-option-note-dialog";
import { buildEffectiveTallies, buildUserBlockInfo } from "./utils/effective-votes";
import { canUserCopyVotes } from "./utils/copy-votes-eligibility";
import { shouldEmitPollLifecycleEvent } from "./utils/poll-lifecycle-notifications";
import { parseEmbeddedPollIdFromSearch } from "./utils/embedded-poll-deep-link";
import {
  formatCompactDuration,
  getNextCycleVoteValue,
} from "./utils/calendar-month-vote-controls";
import { hasSubmittedSchedulerVote, isAttendingVote } from "../../lib/vote-utils";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./calendar-styles.css";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

export default function SchedulerPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, archivePoll, unarchivePoll, isArchived } = useUserSettings();
  const { friends } = useFriends();
  const { getGroupColor, groups } = useQuestingGroups();
  const { removeLocal: removeNotification } = useNotifications();
  const {
    scheduler,
    schedulerDocRef,
    questingGroup,
    slots,
    allVotes,
    userVote,
    userVoteRef,
  } = useSchedulerData({ schedulerId: id, user });
  const [view, setView] = useState("list");
  const [draftVotes, setDraftVotes] = useState({});
  const [saving, setSaving] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [sortMode, setSortMode] = useState("preferred");
  const [requiredAttendance, setRequiredAttendance] = useState([]);
  const [noTimesWork, setNoTimesWork] = useState(false);
  const [finalizeSlotId, setFinalizeSlotId] = useState(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDuration, setEventDuration] = useState(240);
  const [eventAttendees, setEventAttendees] = useState("");
  const [createCalendarEvent, setCreateCalendarEvent] = useState(true);
  const [deleteOldEvent, setDeleteOldEvent] = useState(true);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [pendingVotesOpen, setPendingVotesOpen] = useState(false);
  const [pendingFinalizeSlotId, setPendingFinalizeSlotId] = useState(null);
  const [pendingFinalizeBusy, setPendingFinalizeBusy] = useState(false);
  const [requiredFinalizeWarningOpen, setRequiredFinalizeWarningOpen] = useState(false);
  const [requiredFinalizeSummary, setRequiredFinalizeSummary] = useState([]);
  const [requiredFinalizeChecking, setRequiredFinalizeChecking] = useState(false);
  const [finalizeEmbeddedChoiceOpen, setFinalizeEmbeddedChoiceOpen] = useState(false);
  const [finalizeOutstandingEmbeddedPolls, setFinalizeOutstandingEmbeddedPolls] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneTitle, setCloneTitle] = useState("");
  const [cloneInvites, setCloneInvites] = useState([]);
  const [cloneInviteInput, setCloneInviteInput] = useState("");
  const [cloneInviteError, setCloneInviteError] = useState(null);
  const [cloneSaving, setCloneSaving] = useState(false);
  const [cloneClearVotes, setCloneClearVotes] = useState(false);
  const [cloneGroupId, setCloneGroupId] = useState(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [restoreSaving, setRestoreSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteUpdateCalendar, setDeleteUpdateCalendar] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenUpdateCalendar, setReopenUpdateCalendar] = useState(false);
  const [invitePromptOpen, setInvitePromptOpen] = useState(false);
  const [invitePromptBusy, setInvitePromptBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [nudgeSending, setNudgeSending] = useState(false);
  const [repostSending, setRepostSending] = useState(false);
  const [removeMemberOpen, setRemoveMemberOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [revokeInviteOpen, setRevokeInviteOpen] = useState(false);
  const [inviteToRevoke, setInviteToRevoke] = useState(null);
  const [copyVotesOpen, setCopyVotesOpen] = useState(false);
  const [blockingSchedulersById, setBlockingSchedulersById] = useState({});
  const {
    embeddedPolls,
    embeddedPollsLoading,
    embeddedPollVoteCounts,
    embeddedVotesByPoll,
    embeddedMyVotes,
    embeddedVoteDrafts,
    setEmbeddedVoteDrafts,
  } = useSchedulerEmbeddedPollVotes({
    schedulerId: id,
    userId: user?.uid || null,
  });
  const [embeddedSubmittingByPoll, setEmbeddedSubmittingByPoll] = useState({});
  const [embeddedClearingByPoll, setEmbeddedClearingByPoll] = useState({});
  const [embeddedVoteErrors, setEmbeddedVoteErrors] = useState({});
  const [embeddedLifecycleBusyByPoll, setEmbeddedLifecycleBusyByPoll] = useState({});
  const [embeddedOptionNoteViewer, setEmbeddedOptionNoteViewer] = useState(null);
  const embeddedPollCardRefs = useRef({});
  const [targetEmbeddedPollId, setTargetEmbeddedPollId] = useState(null);
  const [handledEmbeddedPollId, setHandledEmbeddedPollId] = useState(null);
  const [highlightedEmbeddedPollId, setHighlightedEmbeddedPollId] = useState(null);
  const isLocked = scheduler.data?.status !== "OPEN";
  const isPollArchived = isArchived(id);
  const isCreator = scheduler.data?.creatorId === user?.uid;
  const normalizedUserEmail = normalizeEmail(user?.email) || null;
  const pollTimeZone = scheduler.data?.timezone || null;
  const displayTimeZone = useMemo(
    () => resolveDisplayTimeZone({ pollTimeZone, settings }),
    [pollTimeZone, settings]
  );
  const showTimeZone = useMemo(() => shouldShowTimeZone(settings), [settings]);
  const pendingInviteEmails = useMemo(
    () => scheduler.data?.pendingInvites || [],
    [scheduler.data?.pendingInvites]
  );
  const pendingInviteEmailSet = useMemo(
    () =>
      new Set(
        pendingInviteEmails
          .map((email) => normalizeEmail(email))
          .filter(Boolean)
      ),
    [pendingInviteEmails]
  );
  const isGroupMember = Boolean(
    scheduler.data?.questingGroupId &&
      user?.uid &&
      questingGroup.data?.memberIds?.includes(user.uid)
  );
  const isExplicitParticipant = useMemo(() => {
    return Boolean(user?.uid && scheduler.data?.participantIds?.includes(user.uid));
  }, [scheduler.data?.participantIds, user?.uid]);
  const isPendingInvite = useMemo(
    () => (normalizedUserEmail ? pendingInviteEmailSet.has(normalizedUserEmail) : false),
    [normalizedUserEmail, pendingInviteEmailSet]
  );
  const isAcceptedParticipant = useMemo(() => {
    if (isGroupMember) return true;
    if (!isExplicitParticipant) return false;
    return !isPendingInvite;
  }, [isGroupMember, isExplicitParticipant, isPendingInvite]);
  const [calendarView, setCalendarView] = useState("month");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [expandedSlots, setExpandedSlots] = useState({});
  const questingGroupMemberIds = useMemo(
    () => questingGroup.data?.memberIds || [],
    [questingGroup.data?.memberIds]
  );
  const { profiles: questingGroupMemberProfiles } = useUserProfilesByIds(questingGroupMemberIds);
  const questingGroupMembers = useMemo(() => {
    if (!questingGroupMemberIds.length) return [];
    return questingGroupMemberIds
      .map((id) => questingGroupMemberProfiles[id]?.email)
      .filter(Boolean)
      .map((email) => normalizeEmail(email));
  }, [questingGroupMemberIds, questingGroupMemberProfiles]);
  const questingGroupMemberSet = useMemo(
    () => new Set(questingGroupMemberIds),
    [questingGroupMemberIds]
  );
  const questingGroupMemberEmailSet = useMemo(
    () => buildEmailSet(questingGroupMembers),
    [questingGroupMembers]
  );
  const questingGroupName =
    questingGroup.data?.name || scheduler.data?.questingGroupName || null;
  const discordMessageUrl = scheduler.data?.discord?.messageUrl || null;
  const discordStatus = scheduler.data?.discord?.messageId
    ? "Posted to Discord"
    : scheduler.data?.questingGroupId && questingGroup.data?.discord?.channelId
      ? "Discord linked"
      : scheduler.data?.questingGroupId
        ? "Discord not linked"
        : null;
  const nudgeCooldownRemaining = useMemo(() => {
    return getNudgeCooldownRemaining(scheduler.data?.discord?.nudgeLastSentAt);
  }, [scheduler.data?.discord?.nudgeLastSentAt]);
  const questingGroupColor = useMemo(() => {
    const groupId = scheduler.data?.questingGroupId;
    if (!groupId) return null;
    return getGroupColor(groupId);
  }, [getGroupColor, scheduler.data?.questingGroupId]);
  const cloneSelectedGroup = useMemo(() => {
    if (!cloneGroupId) return null;
    const match = groups.find((group) => group.id === cloneGroupId);
    if (match) return match;
    if (cloneGroupId === scheduler.data?.questingGroupId) {
      return {
        id: cloneGroupId,
        name: questingGroup.data?.name || scheduler.data?.questingGroupName || "Questing group",
        members: questingGroupMembers || [],
      };
    }
    return {
      id: cloneGroupId,
      name: scheduler.data?.questingGroupName || "Questing group",
      members: [],
    };
  }, [
    cloneGroupId,
    groups,
    questingGroup.data,
    questingGroupMembers,
    scheduler.data?.questingGroupId,
    scheduler.data?.questingGroupName,
  ]);
  const cloneGroupMembers = useMemo(
    () => (cloneSelectedGroup?.members || []).filter(Boolean),
    [cloneSelectedGroup]
  );
  const cloneGroupMemberEmails = useMemo(
    () => normalizeEmailList(cloneGroupMembers),
    [cloneGroupMembers]
  );
  const cloneGroupMemberSet = useMemo(
    () => buildEmailSet(cloneGroupMemberEmails),
    [cloneGroupMemberEmails]
  );
  const cloneGroupColor = useMemo(
    () => (cloneSelectedGroup?.id ? getGroupColor(cloneSelectedGroup.id) : null),
    [cloneSelectedGroup?.id, getGroupColor]
  );
  const cloneInviteSet = useMemo(() => buildEmailSet(cloneInvites), [cloneInvites]);
  const cloneRecommendedEmails = useMemo(() => {
    const userEmail = user?.email ? normalizeEmail(user.email) : null;
    return friends
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
      .filter((email) => email !== userEmail)
      .filter((email) => !cloneInviteSet.has(email))
      .filter((email) => !cloneGroupMemberSet.has(email));
  }, [friends, cloneInviteSet, cloneGroupMemberSet, user?.email]);
  const profileEmails = useMemo(() => {
    return normalizeEmailList([
      ...questingGroupMembers,
      ...cloneGroupMemberEmails,
      ...cloneInvites,
      ...cloneRecommendedEmails,
    ]);
  }, [questingGroupMembers, cloneGroupMemberEmails, cloneInvites, cloneRecommendedEmails]);
  const { enrichUsers } = useUserProfiles(profileEmails);
  const groupUsers = useMemo(() => {
    if (questingGroupMemberIds.length) {
      return questingGroupMemberIds
        .map((id) => {
          const profile = questingGroupMemberProfiles[id];
          if (!profile) return null;
          return {
            ...profile,
            email: profile.email ? normalizeEmail(profile.email) : profile.email,
            avatar: profile.photoURL || null,
          };
        })
        .filter(Boolean);
    }
    return enrichUsers(questingGroupMembers);
  }, [questingGroupMemberIds, questingGroupMemberProfiles, enrichUsers, questingGroupMembers]);
  const cloneGroupUsers = useMemo(
    () => enrichUsers(cloneGroupMembers),
    [enrichUsers, cloneGroupMembers]
  );
  const cloneInviteUsers = useMemo(() => enrichUsers(cloneInvites), [enrichUsers, cloneInvites]);
  const cloneRecommendedUsers = useMemo(
    () => enrichUsers(cloneRecommendedEmails),
    [enrichUsers, cloneRecommendedEmails]
  );
  const cloneGroupOptions = useMemo(() => {
    const base = groups.map((group) => ({
      id: group.id,
      name: group.name,
      members: group.members?.length || 0,
    }));
    if (scheduler.data?.questingGroupId && !base.some((item) => item.id === scheduler.data.questingGroupId)) {
      base.unshift({
        id: scheduler.data.questingGroupId,
        name: scheduler.data.questingGroupName || "Current group",
        members: 0,
      });
    }
    return base;
  }, [groups, scheduler.data?.questingGroupId, scheduler.data?.questingGroupName]);

  useEffect(() => {
    if (!cloneGroupId) return;
    setCloneInvites((prev) =>
      prev.filter((email) => !cloneGroupMemberSet.has(normalizeEmail(email)))
    );
  }, [cloneGroupId, cloneGroupMemberSet]);

  useEffect(() => {
    if (!scheduler.data || !user?.email || !id) return;
    if (isCreator) return;
    const participantMatch = scheduler.data.participantIds?.includes(user?.uid);
    if (isGroupMember) {
      setInvitePromptOpen(false);
      return;
    }
    if (isPendingInvite) {
      setInvitePromptOpen(true);
      return;
    }
    if (scheduler.data.allowLinkSharing && !participantMatch) {
      setInvitePromptOpen(true);
    } else {
      setInvitePromptOpen(false);
    }
  }, [id, scheduler.data, user?.email, user?.uid, isCreator, isGroupMember, isPendingInvite]);

  useEffect(() => {
    if (!userVote.data) return;
    setDraftVotes(userVote.data.votes || {});
    setNoTimesWork(Boolean(userVote.data.noTimesWork));
  }, [userVote.data]);

  function hasSubmittedEmbeddedVote(poll, voteDoc) {
    return hasSubmittedVoteForPoll(poll, voteDoc);
  }

  function openEmbeddedOptionNoteViewer(pollTitle, option) {
    const note = String(option?.note || "").trim();
    if (!note) return;
    setEmbeddedOptionNoteViewer({
      pollTitle: String(pollTitle || "Add-on poll"),
      optionLabel: String(option?.label || "Option"),
      note,
    });
  }

  function canVoteEmbeddedPoll(poll) {
    const pollStatus = poll?.status || "OPEN";
    return Boolean(
      isAcceptedParticipant &&
        scheduler.data?.status !== "CANCELLED" &&
        pollStatus !== "FINALIZED"
    );
  }

  useEffect(() => {
    const pollId = parseEmbeddedPollIdFromSearch(location.search);
    setTargetEmbeddedPollId(pollId);
    setHandledEmbeddedPollId(null);
    if (!pollId) {
      setHighlightedEmbeddedPollId(null);
    }
  }, [location.search]);

  useEffect(() => {
    if (!targetEmbeddedPollId || embeddedPollsLoading || handledEmbeddedPollId === targetEmbeddedPollId) return;
    const hasPoll = embeddedPolls.some((poll) => poll.id === targetEmbeddedPollId);
    if (!hasPoll) return;
    const targetNode = embeddedPollCardRefs.current[targetEmbeddedPollId];
    if (!targetNode || typeof targetNode.scrollIntoView !== "function") return;

    targetNode.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedEmbeddedPollId(targetEmbeddedPollId);
    setHandledEmbeddedPollId(targetEmbeddedPollId);

    const timer = setTimeout(() => {
      setHighlightedEmbeddedPollId((current) =>
        current === targetEmbeddedPollId ? null : current
      );
    }, 4000);

    return () => clearTimeout(timer);
  }, [
    embeddedPolls,
    embeddedPollsLoading,
    handledEmbeddedPollId,
    targetEmbeddedPollId,
  ]);

  const explicitParticipantIds = useMemo(
    () => scheduler.data?.participantIds || [],
    [scheduler.data?.participantIds]
  );
  const { profiles: explicitParticipantProfilesById } = useUserProfilesByIds(
    explicitParticipantIds
  );

  const profilesByUserId = useMemo(() => {
    return {
      ...(explicitParticipantProfilesById || {}),
      ...(questingGroupMemberProfiles || {}),
    };
  }, [explicitParticipantProfilesById, questingGroupMemberProfiles]);

  const pollPriorityAtMs = useMemo(() => {
    if (scheduler.data?.status !== "FINALIZED" || !scheduler.data?.winningSlotId) return null;
    const slotId = scheduler.data.winningSlotId;
    const perSlot = scheduler.data?.finalizedSlotPriorityAtMs?.[slotId] ?? null;
    return perSlot ?? scheduler.data?.finalizedAtMs ?? null;
  }, [
    scheduler.data?.finalizedAtMs,
    scheduler.data?.finalizedSlotPriorityAtMs,
    scheduler.data?.status,
    scheduler.data?.winningSlotId,
  ]);

  const { tallies, slotVoters } = useMemo(() => {
    return buildEffectiveTallies({
      schedulerId: id,
      schedulerStatus: scheduler.data?.status || "OPEN",
      pollPriorityAtMs,
      slots: slots.data,
      voteDocs: allVotes.data,
      profilesById: profilesByUserId,
    });
  }, [allVotes.data, id, pollPriorityAtMs, profilesByUserId, scheduler.data?.status, slots.data]);

  const { infoBySlotId: userBlockersBySlotId } = useMemo(() => {
    return buildUserBlockInfo({
      schedulerId: id,
      schedulerStatus: scheduler.data?.status || "OPEN",
      pollPriorityAtMs,
      slots: slots.data,
      userProfile: user?.uid ? profilesByUserId?.[user.uid] || null : null,
    });
  }, [id, pollPriorityAtMs, profilesByUserId, scheduler.data?.status, slots.data, user?.uid]);

  const blockerSchedulerIds = useMemo(() => {
    const ids = new Set();
    Object.values(userBlockersBySlotId || {}).forEach((blocker) => {
      if (blocker?.sourceSchedulerId) ids.add(blocker.sourceSchedulerId);
    });
    return Array.from(ids);
  }, [userBlockersBySlotId]);

  useEffect(() => {
    if (!blockerSchedulerIds.length) {
      setBlockingSchedulersById((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    let cancelled = false;
    fetchSchedulersByIds(blockerSchedulerIds)
      .then((docs) => {
        if (cancelled) return;
        setBlockingSchedulersById(docs || {});
      })
      .catch((err) => {
        console.warn("Failed to fetch blocking schedulers:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [blockerSchedulerIds.join("|")]);

  const explicitParticipantProfiles = useMemo(() => {
    if (!explicitParticipantIds.length) return [];
    return explicitParticipantIds
      .map((id) => explicitParticipantProfilesById[id])
      .filter(Boolean);
  }, [explicitParticipantIds, explicitParticipantProfilesById]);
  const explicitParticipantEmails = useMemo(
    () =>
      explicitParticipantProfiles
        .map((profile) => profile.email)
        .filter(Boolean)
        .map((email) => normalizeEmail(email)),
    [explicitParticipantProfiles]
  );
  const participantEmails = useMemo(() => {
    const merged = new Set([
      ...explicitParticipantEmails,
      ...questingGroupMembers,
    ]);
    return Array.from(merged);
  }, [explicitParticipantEmails, questingGroupMembers]);
  const { enrichUsers: enrichPendingInviteUsers } = useUserProfiles(pendingInviteEmails);
  const pendingInviteUsers = useMemo(
    () => enrichPendingInviteUsers(pendingInviteEmails),
    [enrichPendingInviteUsers, pendingInviteEmails]
  );
  const submittedVoteDocs = useMemo(
    () => allVotes.data.filter((voteDoc) => hasSubmittedSchedulerVote(voteDoc)),
    [allVotes.data]
  );
  const voterEmails = useMemo(
    () => submittedVoteDocs.map((voteDoc) => voteDoc.userEmail).filter(Boolean),
    [submittedVoteDocs]
  );
  const uniqueEmails = useMemo(() => {
    const set = new Set([...(participantEmails || []), ...(voterEmails || [])]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [participantEmails, voterEmails]);
  const colorMap = useMemo(() => buildColorMap(uniqueEmails), [uniqueEmails]);
  const voteMapById = useMemo(
    () => new Map(allVotes.data.map((voteDoc) => [voteDoc.id, voteDoc])),
    [allVotes.data]
  );
  const submittedVoteMapById = useMemo(
    () => new Map(submittedVoteDocs.map((voteDoc) => [voteDoc.id, voteDoc])),
    [submittedVoteDocs]
  );
  const voteMapByEmail = useMemo(
    () =>
      new Map(
        allVotes.data
          .filter((voteDoc) => voteDoc.userEmail)
          .map((voteDoc) => [normalizeEmail(voteDoc.userEmail), voteDoc])
      ),
    [allVotes.data]
  );
  const submittedVoteMapByEmail = useMemo(
    () =>
      new Map(
        submittedVoteDocs
          .filter((voteDoc) => voteDoc.userEmail)
          .map((voteDoc) => [normalizeEmail(voteDoc.userEmail), voteDoc])
      ),
    [submittedVoteDocs]
  );
  const submittedVoteIdSet = useMemo(
    () =>
      new Set(
        submittedVoteDocs
          .map((voteDoc) => String(voteDoc?.id || "").trim())
          .filter(Boolean)
      ),
    [submittedVoteDocs]
  );
  const participants = useMemo(() => {
    const combined = new Map();
    explicitParticipantIds.forEach((id) => {
      const profile = explicitParticipantProfilesById[id];
      if (profile) combined.set(id, profile);
    });
    questingGroupMemberIds.forEach((id) => {
      const profile = questingGroupMemberProfiles[id];
      if (profile) combined.set(id, profile);
    });
    return Array.from(combined.values()).map((profile) => {
      const vote =
        voteMapById.get(profile.id) ||
        (profile.email ? voteMapByEmail.get(normalizeEmail(profile.email)) : null);
      const submittedVote =
        submittedVoteMapById.get(profile.id) ||
        (profile.email ? submittedVoteMapByEmail.get(normalizeEmail(profile.email)) : null);
      const email = profile.email ? normalizeEmail(profile.email) : vote?.userEmail || null;
      return {
        ...profile,
        email,
        avatar: vote?.userAvatar || profile.photoURL || null,
        hasVoted: Boolean(submittedVote),
        isGroupMember: questingGroupMemberSet.has(profile.id),
        isPendingInvite: email ? pendingInviteEmailSet.has(normalizeEmail(email)) : false,
      };
    });
  }, [
    explicitParticipantIds,
    explicitParticipantProfilesById,
    questingGroupMemberIds,
    questingGroupMemberProfiles,
    voteMapById,
    voteMapByEmail,
    submittedVoteMapById,
    submittedVoteMapByEmail,
    questingGroupMemberSet,
    pendingInviteEmailSet,
  ]);
  const nonGroupParticipants = useMemo(
    () => participants.filter((participant) => !participant.isGroupMember),
    [participants]
  );
  const participantMapByEmail = useMemo(
    () =>
      new Map(
        participants
          .filter((participant) => participant.email)
          .map((participant) => [normalizeEmail(participant.email), participant])
      ),
    [participants]
  );
  const requiredAttendanceOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    participants.forEach((participant) => {
      const email = normalizeEmail(participant.email);
      if (!email || seen.has(email)) return;
      seen.add(email);
      options.push({ ...participant, email });
    });
    return options.sort((a, b) => {
      const aLabel = (getUserLabel(a) || "").toLowerCase();
      const bLabel = (getUserLabel(b) || "").toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [participants]);
  const requiredAttendanceOptionsByEmail = useMemo(
    () => new Map(requiredAttendanceOptions.map((participant) => [participant.email, participant])),
    [requiredAttendanceOptions]
  );
  const requiredAttendanceSet = useMemo(
    () => new Set(requiredAttendance),
    [requiredAttendance]
  );
  const requiredAttendanceUsers = useMemo(
    () =>
      requiredAttendance
        .map((email) => requiredAttendanceOptionsByEmail.get(email))
        .filter(Boolean)
        .map((participant) => participant),
    [requiredAttendance, requiredAttendanceOptionsByEmail]
  );
  const requiredAttendanceLabel = useMemo(() => {
    if (requiredAttendance.length === 0) return "Anyone";
    const selected = requiredAttendance
      .map((email) => requiredAttendanceOptionsByEmail.get(email))
      .filter(Boolean);
    const first = selected[0];
    if (!first) return `${requiredAttendance.length} required`;
    const label = getUserLabel(first) || "Participant";
    if (selected.length > 1) {
      return `${label} +${selected.length - 1}`;
    }
    return label;
  }, [requiredAttendance, requiredAttendanceOptionsByEmail]);
  const requiredAttendanceTitle = useMemo(() => {
    if (requiredAttendance.length === 0) return "No required attendance filter";
    const names = requiredAttendance
      .map((email) => {
        const participant = requiredAttendanceOptionsByEmail.get(email);
        return getUserLabel(participant) || email;
      })
      .filter(Boolean);
    return `Required attendance: ${names.join(", ")}`;
  }, [requiredAttendance, requiredAttendanceOptionsByEmail]);
  const hasRequiredAttendanceFilter = requiredAttendance.length > 0;

  useEffect(() => {
    if (requiredAttendance.length === 0) return;
    const validSet = new Set(requiredAttendanceOptions.map((participant) => participant.email));
    const next = requiredAttendance.filter((email) => validSet.has(email));
    if (next.length === requiredAttendance.length) return;
    setRequiredAttendance(next);
  }, [requiredAttendance, requiredAttendanceOptions]);
  const pendingInviteNonParticipants = useMemo(
    () =>
      pendingInviteUsers.filter((invitee) => {
        const normalized = normalizeEmail(invitee.email);
        if (!normalized) return false;
        return !participantMapByEmail.has(normalized);
      }),
    [pendingInviteUsers, participantMapByEmail]
  );
  const groupUsersWithStatus = useMemo(
    () =>
      groupUsers.map((member) => {
        const vote =
          (member.id && voteMapById.get(member.id)) ||
          (member.email ? voteMapByEmail.get(normalizeEmail(member.email)) : null);
        const submittedVote =
          (member.id && submittedVoteMapById.get(member.id)) ||
          (member.email ? submittedVoteMapByEmail.get(normalizeEmail(member.email)) : null);
        return {
          ...member,
          email: member.email ? normalizeEmail(member.email) : member.email,
          avatar: vote?.userAvatar || member.avatar || member.photoURL || null,
          hasVoted: Boolean(submittedVote),
        };
      }),
    [groupUsers, voteMapById, voteMapByEmail, submittedVoteMapById, submittedVoteMapByEmail]
  );
  const participantIdSet = useMemo(
    () =>
      new Set(
        [...explicitParticipantIds, ...questingGroupMemberIds].filter(Boolean)
      ),
    [explicitParticipantIds, questingGroupMemberIds]
  );
  const nudgeEligibleParticipantIds = useMemo(() => {
    const participantIds = new Set(
      [...explicitParticipantIds, ...questingGroupMemberIds]
        .map((idValue) => String(idValue || "").trim())
        .filter(Boolean)
    );
    if (scheduler.data?.creatorId) {
      participantIds.delete(String(scheduler.data.creatorId));
    }
    return Array.from(participantIds);
  }, [explicitParticipantIds, questingGroupMemberIds, scheduler.data?.creatorId]);
  const sessionPollMissingNudgeUserIds = useMemo(
    () =>
      nudgeEligibleParticipantIds.filter(
        (participantId) => !submittedVoteIdSet.has(String(participantId))
      ),
    [nudgeEligibleParticipantIds, submittedVoteIdSet]
  );
  const hasRequiredEmbeddedNudgeTargets = useMemo(() => {
    if (nudgeEligibleParticipantIds.length === 0) return false;

    const requiredOpenPolls = (embeddedPolls || []).filter((poll) => {
      if (!poll?.required) return false;
      const pollStatus = String(poll?.status || "OPEN").toUpperCase();
      return pollStatus === "OPEN";
    });

    if (requiredOpenPolls.length === 0) return false;

    return requiredOpenPolls.some((poll) => {
      const pollVotes = embeddedVotesByPoll[poll.id] || [];
      const submittedVoterIds = new Set(
        (pollVotes || [])
          .filter((voteDoc) => hasSubmittedEmbeddedVote(poll, voteDoc))
          .map((voteDoc) => String(voteDoc?.id || "").trim())
          .filter(Boolean)
      );

      return nudgeEligibleParticipantIds.some(
        (participantId) => !submittedVoterIds.has(participantId)
      );
    });
  }, [embeddedPolls, embeddedVotesByPoll, nudgeEligibleParticipantIds]);
  const participantCount = participantIdSet.size;
  const voteCount = submittedVoteDocs.length;
  const allVotesIn = useMemo(() => {
    if (scheduler.data?.status !== "OPEN") return false;
    if (!participantCount) return false;
    return voteCount >= participantCount;
  }, [participantCount, scheduler.data?.status, voteCount]);
  const winningSlot = useMemo(() => {
    const winningId = scheduler.data?.winningSlotId;
    if (!winningId) return null;
    return slots.data.find((slot) => slot.id === winningId) || null;
  }, [scheduler.data?.winningSlotId, slots.data]);

  const sortedSlots = useMemo(() => {
    const rows = slots.data.map((slot) => {
      const counts = tallies[slot.id] || { feasible: 0, preferred: 0 };
      return { ...slot, counts };
    });
    return rows.sort((a, b) => {
      const aTime = a.start ? new Date(a.start).getTime() : 0;
      const bTime = b.start ? new Date(b.start).getTime() : 0;
      if (sortMode === "attendance") {
        if (b.counts.feasible !== a.counts.feasible) {
          return b.counts.feasible - a.counts.feasible;
        }
        if (b.counts.preferred !== a.counts.preferred) {
          return b.counts.preferred - a.counts.preferred;
        }
        return aTime - bTime;
      }
      if (b.counts.preferred !== a.counts.preferred) {
        return b.counts.preferred - a.counts.preferred;
      }
      if (b.counts.feasible !== a.counts.feasible) {
        return b.counts.feasible - a.counts.feasible;
      }
      return aTime - bTime;
    });
  }, [slots.data, sortMode, tallies]);

  const filteredSortedSlots = useMemo(
    () =>
      filterSlotsByRequiredAttendance({
        slots: sortedSlots,
        slotVotersById: slotVoters,
        requiredEmails: requiredAttendance,
      }),
    [requiredAttendance, slotVoters, sortedSlots]
  );

  const slotsByDate = useMemo(() => {
    return [...slots.data].sort((a, b) => {
      const aTime = a.start ? new Date(a.start).getTime() : 0;
      const bTime = b.start ? new Date(b.start).getTime() : 0;
      return aTime - bTime;
    });
  }, [slots.data]);

  const pastSlotIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      slots.data
        .filter((slot) => slot.start && new Date(slot.start).getTime() < now)
        .map((slot) => slot.id)
    );
  }, [slots.data]);

  const canCopyVotes = useMemo(() => {
    return canUserCopyVotes({
      slots: slots.data,
      userVoteDoc: userVote.data,
      nowMs: Date.now(),
    });
  }, [slots.data, userVote.data]);

  const calendarEvents = useMemo(() => {
    return slots.data.map((slot) => {
      const startRaw = slot.start ? new Date(slot.start) : new Date();
      const endRaw = slot.end ? new Date(slot.end) : startRaw;
      const displayStart = toDisplayDate(startRaw, displayTimeZone) || startRaw;
      const displayEnd = toDisplayDate(endRaw, displayTimeZone) || endRaw;
      const counts = tallies[slot.id] || { feasible: 0, preferred: 0 };
      const voters = slotVoters[slot.id] || { preferred: [], feasible: [] };
      return {
        id: slot.id,
        start: displayStart,
        end: displayEnd,
        timeLabel: formatZonedTime(startRaw, displayTimeZone, "h:mm a", { showTimeZone }),
        rangeLabel: formatZonedTimeRange({
          start: startRaw,
          end: endRaw,
          timeZone: displayTimeZone,
          showTimeZone,
        }),
        preferredCount: counts.preferred,
        feasibleCount: counts.feasible,
        preferredVoters: voters.preferred,
        feasibleVoters: voters.feasible,
      };
    });
  }, [slots.data, tallies, slotVoters, displayTimeZone]);

  const calendarEventCountByDay = useMemo(() => {
    return calendarEvents.reduce((counts, event) => {
      const dayKey = format(event.start, "yyyy-MM-dd");
      counts[dayKey] = (counts[dayKey] || 0) + 1;
      return counts;
    }, {});
  }, [calendarEvents]);

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
    height: 520,
    onNavigate: setCalendarDate,
  });

  const calendarKey =
    calendarView === "month"
      ? `month-${calendarDate.toDateString()}`
      : `${calendarView}-${calendarDate.toDateString()}-${scrollToTime?.getTime?.() || 0}`;

  const slotsForModal = useMemo(() => {
    if (!modalDate) return [];
    const sameDay = slots.data.filter((slot) => {
      if (!slot.start) return false;
      const displayStart = toDisplayDate(new Date(slot.start), displayTimeZone);
      return displayStart ? isSameDay(displayStart, modalDate) : false;
    });
    return sameDay.sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [modalDate, slots.data, displayTimeZone]);

  const linkedCalendars = useMemo(() => {
    const ids = settings?.googleCalendarIds || [];
    const names = settings?.googleCalendarNames || {};
    return ids
      .map((id) => ({
        id,
        name: names[id] || id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [settings?.googleCalendarIds, settings?.googleCalendarNames]);

  const hasPendingVotes = useMemo(() => {
    const savedVotes = userVote.data?.votes || {};
    const savedNoTimes = Boolean(userVote.data?.noTimesWork);
    const draft = draftVotes || {};
    const keys = new Set([...Object.keys(savedVotes), ...Object.keys(draft)]);
    if (savedNoTimes !== noTimesWork) return true;
    if (keys.size === 0) return false;
    for (const key of keys) {
      if ((savedVotes[key] || null) !== (draft[key] || null)) {
        return true;
      }
    }
    return false;
  }, [draftVotes, userVote.data, noTimesWork]);

  const toggleExpanded = (slotId) => {
    setExpandedSlots((prev) => ({ ...prev, [slotId]: !prev[slotId] }));
  };

  const toggleRequiredAttendance = (email) => {
    setRequiredAttendance((prev) => {
      if (prev.includes(email)) {
        return prev.filter((item) => item !== email);
      }
      return [...prev, email];
    });
  };

  const clearRequiredAttendance = () => {
    setRequiredAttendance([]);
  };

  const handleAcceptInvite = async () => {
    if (!id || !user?.email) return;
    setInvitePromptBusy(true);
    try {
      await acceptPollInvite(id, user.email, user.uid);
      [
        pollInviteNotificationId(id, user.email),
        pollInviteLegacyNotificationId(id),
      ]
        .filter(Boolean)
        .forEach((notificationId) => removeNotification(notificationId));
      setInvitePromptOpen(false);
    } catch (err) {
      console.error("Failed to accept poll invite:", err);
      toast.error(err.message || "Failed to accept invitation");
    } finally {
      setInvitePromptBusy(false);
    }
  };

  const handleDeclineInvite = async () => {
    if (!id || !user?.email) return;
    setInvitePromptBusy(true);
    try {
      if (isPendingInvite) {
        await declinePollInvite(id, user.email, user.uid);
        [
          pollInviteNotificationId(id, user.email),
          pollInviteLegacyNotificationId(id),
        ]
          .filter(Boolean)
          .forEach((notificationId) => removeNotification(notificationId));
      }
      setInvitePromptOpen(false);
      navigate("/dashboard");
    } catch (err) {
      console.error("Failed to decline poll invite:", err);
      toast.error(err.message || "Failed to decline invitation");
    } finally {
      setInvitePromptBusy(false);
    }
  };

  const handleLeavePoll = async () => {
    if (!id || !user?.email) return;
    setLeaveSaving(true);
    try {
      await removeParticipantFromPoll(id, user.email, true, false, user.uid);
      toast.success("You left the poll");
      setLeaveOpen(false);
      navigate("/dashboard");
    } catch (err) {
      console.error("Failed to leave poll:", err);
      toast.error(err.message || "Failed to leave poll");
    } finally {
      setLeaveSaving(false);
    }
  };

  const handleRemoveParticipant = async () => {
    if (!id || !memberToRemove) return;
    const memberEmail = memberToRemove.email || "";
    const memberId = memberToRemove.id || null;
    const isGroupMemberMatch = memberId
      ? questingGroupMemberSet.has(memberId)
      : questingGroupMemberEmailSet.has(normalizeEmail(memberEmail));
    if (isGroupMemberMatch) {
      toast.error("Questing group members cannot be removed from this poll.");
      return;
    }
    try {
      await removeParticipantFromPoll(id, memberEmail, true, true, memberId);
      toast.success("Participant removed");
      setRemoveMemberOpen(false);
      setMemberToRemove(null);
    } catch (err) {
      console.error("Failed to remove participant:", err);
      toast.error(err.message || "Failed to remove participant");
    }
  };

  const handleRevokeInvite = async () => {
    if (!id || !inviteToRevoke) return;
    try {
      const inviteeUserId = await findUserIdByEmail(inviteToRevoke);
      await revokePollInvite(id, inviteToRevoke, inviteeUserId);
      toast.success("Invite removed");
      setRevokeInviteOpen(false);
      setInviteToRevoke(null);
    } catch (err) {
      console.error("Failed to revoke poll invite:", err);
      toast.error(err.message || "Failed to revoke invite");
    }
  };

  const resolveAvatarUser = (userInfo) => {
    if (!userInfo?.email) return userInfo;
    return participantMapByEmail.get(normalizeEmail(userInfo.email)) || userInfo;
  };

  const AvatarBubbleWithColors = ({ user, size = 24 }) => (
    <AvatarBubble user={resolveAvatarUser(user)} size={size} colorMap={colorMap} />
  );

  const AvatarStackWithColors = ({ users, max = 4, size = 20 }) => (
    <AvatarStack
      users={(users || []).map((userInfo) => resolveAvatarUser(userInfo))}
      max={max}
      size={size}
      colorMap={colorMap}
    />
  );

  const EventCell = ({ event }) => {
    const preferredCount = event.preferredCount ?? 0;
    const feasibleCount = event.feasibleCount ?? 0;
    const durationMinutes =
      event.end && event.start ? Math.max(0, Math.round((event.end - event.start) / 60000)) : 0;
    const compactDurationLabel = formatCompactDuration(durationMinutes);
    const rangeLabel = event.rangeLabel || event.timeLabel;

    if (calendarView === "month") {
      const vote = draftVotes[event.id] || null;
      const isPast = pastSlotIds.has(event.id);
      const dayKey = format(event.start, "yyyy-MM-dd");
      const hasMultipleSlots = (calendarEventCountByDay[dayKey] || 0) > 1;
      const canInteract = canVote && !isLocked && !isPast && !noTimesWork;
      const voteState = noTimesWork ? "unavailable" : vote ? vote.toLowerCase() : "none";

      const preventCalendarSelect = (callback) => (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        callback();
      };

      const setFeasible = () => {
        if (!canInteract || vote === "PREFERRED") return;
        setVote(event.id, vote === "FEASIBLE" ? null : "FEASIBLE");
      };

      const setPreferred = () => {
        if (!canInteract) return;
        setVote(event.id, vote === "PREFERRED" ? null : "PREFERRED");
      };

      const cycleVote = () => {
        if (!canInteract) return;
        setVote(event.id, getNextCycleVoteValue(vote));
      };

      return (
        <div
          className="space-y-1"
          data-testid={`month-slot-${event.id}`}
          data-slot-id={event.id}
          data-vote-state={voteState}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <div className="truncate text-xs font-semibold">{event.timeLabel}</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/70">
                {compactDurationLabel}
              </div>
            </div>
            {!noTimesWork && (
              <div className="flex items-center gap-1">
                {hasMultipleSlots ? (
                  <button
                    type="button"
                    data-testid={`month-slot-cycle-${event.id}`}
                    aria-label={`Cycle vote for ${event.timeLabel}`}
                    aria-pressed={vote === "FEASIBLE" || vote === "PREFERRED"}
                    disabled={!canInteract}
                    onMouseDown={(clickEvent) => clickEvent.stopPropagation()}
                    onClick={preventCalendarSelect(cycleVote)}
                    className={`inline-flex h-5 min-w-[2.15rem] items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold transition ${
                      vote === "PREFERRED"
                        ? "border-amber-200 bg-amber-100 text-amber-800"
                        : vote === "FEASIBLE"
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : "border-white/40 bg-white/15 text-white"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {vote === "PREFERRED" ? (
                      <Star size={10} className="fill-current" />
                    ) : vote === "FEASIBLE" ? (
                      <Check size={10} />
                    ) : (
                      "○"
                    )}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      data-testid={`month-slot-feasible-${event.id}`}
                      aria-label={`Toggle feasible vote for ${event.timeLabel}`}
                      aria-pressed={vote === "FEASIBLE" || vote === "PREFERRED"}
                      disabled={!canInteract || vote === "PREFERRED"}
                      onMouseDown={(clickEvent) => clickEvent.stopPropagation()}
                      onClick={preventCalendarSelect(setFeasible)}
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition ${
                        vote === "FEASIBLE" || vote === "PREFERRED"
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : "border-white/40 bg-white/15 text-white"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <Check size={10} />
                    </button>
                    <button
                      type="button"
                      data-testid={`month-slot-preferred-${event.id}`}
                      aria-label={`Toggle preferred vote for ${event.timeLabel}`}
                      aria-pressed={vote === "PREFERRED"}
                      disabled={!canInteract}
                      onMouseDown={(clickEvent) => clickEvent.stopPropagation()}
                      onClick={preventCalendarSelect(setPreferred)}
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition ${
                        vote === "PREFERRED"
                          ? "border-amber-200 bg-amber-100 text-amber-800"
                          : "border-white/40 bg-white/15 text-white"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <Star size={10} className={vote === "PREFERRED" ? "fill-current" : ""} />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/90">
            <span>★ {preferredCount}</span>
            <span className="text-white/70">·</span>
            <span>✓ {feasibleCount}</span>
          </div>
          {noTimesWork && (
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
              Unavailable
            </div>
          )}
        </div>
      );
    }

    if (calendarView === "week") {
      if (durationMinutes <= 30) {
        return (
          <div className="space-y-0.5 text-[10px] font-semibold leading-tight text-white/90">
            {rangeLabel} · ★ {preferredCount} · ✓ {feasibleCount}
          </div>
        );
      }
      if (durationMinutes < 120) {
        return (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-white/95">{rangeLabel}</div>
            <div className="flex items-center gap-2 text-[10px] text-white/90">
              <span>★ {preferredCount}</span>
          <AvatarStackWithColors users={event.preferredVoters} max={3} size={14} />
              <span className="ml-1">✓ {feasibleCount}</span>
          <AvatarStackWithColors users={event.feasibleVoters} max={3} size={14} />
            </div>
          </div>
        );
      }
      return (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-white/95">{rangeLabel}</div>
          <div className="flex items-center gap-2 text-[10px] text-white/90">
            <span>★ {preferredCount}</span>
          <AvatarStackWithColors users={event.preferredVoters} max={3} size={14} />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-white/90">
            <span>✓ {feasibleCount}</span>
          <AvatarStackWithColors users={event.feasibleVoters} max={3} size={14} />
          </div>
        </div>
      );
    }

    if (durationMinutes <= 30) {
      return (
        <div className="text-[11px] font-semibold leading-tight text-white/90">
          {rangeLabel} · ★ {preferredCount} · ✓ {feasibleCount}
        </div>
      );
    }

    if (durationMinutes < 120) {
      return (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-white/95">{rangeLabel}</div>
          <div className="flex items-center gap-2 text-[11px] text-white/90">
            <span>★ {preferredCount}</span>
          <AvatarStackWithColors users={event.preferredVoters} max={4} size={16} />
            <span className="ml-1">✓ {feasibleCount}</span>
          <AvatarStackWithColors users={event.feasibleVoters} max={4} size={16} />
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <div className="text-xs font-semibold text-white/95">{rangeLabel}</div>
        <div className="flex items-center gap-2 text-[11px] text-white/90">
          <span>★ {preferredCount}</span>
          <AvatarStackWithColors users={event.preferredVoters} max={4} size={16} />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/90">
          <span>✓ {feasibleCount}</span>
          <AvatarStackWithColors users={event.feasibleVoters} max={4} size={16} />
        </div>
      </div>
    );
  };

  const setVote = (slotId, nextValue) => {
    if (!isAcceptedParticipant) {
      toast.error("Accept the invite to vote on this poll.");
      return;
    }
    if (pastSlotIds.has(slotId)) {
      toast.error("This time slot is in the past and can no longer be voted on.");
      return;
    }
    if (noTimesWork) {
      setNoTimesWork(false);
    }
    setDraftVotes((prev) => {
      const next = { ...prev };
      if (!nextValue) {
        delete next[slotId];
      } else {
        next[slotId] = nextValue;
      }
    return next;
    });
  };

  const setEmbeddedMultipleChoiceSelection = (poll, optionId) => {
    const pollId = poll?.id;
    if (!pollId) return;
    const allowMultiple = poll?.settings?.allowMultiple === true;
    setEmbeddedVoteErrors((previous) => ({ ...previous, [pollId]: null }));
    setEmbeddedVoteDrafts((previous) => {
      const current = previous[pollId] || { optionIds: [], otherText: "" };
      const { draft: nextDraft } = setMultipleChoiceOptionOnVoteDraft(current, optionId, {
        allowMultiple,
      });
      if (nextDraft === current) return previous;
      return {
        ...previous,
        [pollId]: nextDraft,
      };
    });
  };

  const setEmbeddedOtherText = (pollId, value) => {
    if (!pollId) return;
    setEmbeddedVoteDrafts((previous) => {
      const current = previous[pollId] || { optionIds: [], otherText: "" };
      const nextDraft = setOtherTextOnVoteDraft(current, value);
      if (nextDraft === current) return previous;
      return {
        ...previous,
        [pollId]: nextDraft,
      };
    });
  };

  const addEmbeddedRankedOption = (pollId, optionId) => {
    if (!pollId || !optionId) return;
    setEmbeddedVoteErrors((previous) => ({ ...previous, [pollId]: null }));
    setEmbeddedVoteDrafts((previous) => {
      const current = previous[pollId] || { rankings: [] };
      const nextDraft = addRankedOptionToVoteDraft(current, optionId);
      if (nextDraft === current) return previous;
      return {
        ...previous,
        [pollId]: nextDraft,
      };
    });
  };

  const moveEmbeddedRankedOption = (pollId, optionId, direction) => {
    if (!pollId || !optionId) return;
    setEmbeddedVoteDrafts((previous) => {
      const current = previous[pollId] || { rankings: [] };
      const nextDraft = moveRankedOptionInVoteDraft(current, optionId, direction);
      if (nextDraft === current) return previous;
      return {
        ...previous,
        [pollId]: nextDraft,
      };
    });
  };

  const removeEmbeddedRankedOption = (pollId, optionId) => {
    if (!pollId || !optionId) return;
    setEmbeddedVoteDrafts((previous) => {
      const current = previous[pollId] || { rankings: [] };
      const nextDraft = removeRankedOptionFromVoteDraft(current, optionId);
      if (nextDraft === current) return previous;
      return {
        ...previous,
        [pollId]: nextDraft,
      };
    });
  };

  const submitEmbeddedPollVote = async (poll) => {
    const pollId = poll?.id;
    if (!pollId || !id || !user?.uid) return;
    if (!canVoteEmbeddedPoll(poll)) {
      setEmbeddedVoteErrors((previous) => ({
        ...previous,
        [pollId]: "Voting is closed for this add-on poll.",
      }));
      return;
    }
    const voteType = poll?.settings?.voteType || "MULTIPLE_CHOICE";
    setEmbeddedSubmittingByPoll((previous) => ({ ...previous, [pollId]: true }));
    setEmbeddedVoteErrors((previous) => ({ ...previous, [pollId]: null }));
    try {
      if (voteType === "RANKED_CHOICE") {
        const draft = embeddedVoteDrafts[pollId] || {};
        const rankings = Array.isArray(draft.rankings) ? draft.rankings.filter(Boolean) : [];
        if (rankings.length === 0) {
          throw new Error("Rank at least one option before submitting.");
        }
        await submitBasicPollVote("scheduler", id, pollId, user.uid, {
          rankings,
          source: "web",
        });
        return;
      }

      const draft = embeddedVoteDrafts[pollId] || { optionIds: [], otherText: "" };
      const optionIds = Array.isArray(draft.optionIds) ? draft.optionIds.filter(Boolean) : [];
      const allowWriteIn = poll?.settings?.allowWriteIn === true;
      const normalizedOtherText = String(draft.otherText || "").trim();
      if (optionIds.length === 0 && (!allowWriteIn || normalizedOtherText.length === 0)) {
        throw new Error("Select at least one option before submitting.");
      }
      await submitBasicPollVote("scheduler", id, pollId, user.uid, {
        optionIds,
        otherText: allowWriteIn ? normalizedOtherText : "",
        source: "web",
      });
    } catch (error) {
      setEmbeddedVoteErrors((previous) => ({
        ...previous,
        [pollId]: error?.message || "Failed to submit vote.",
      }));
    } finally {
      setEmbeddedSubmittingByPoll((previous) => ({ ...previous, [pollId]: false }));
    }
  };

  const clearEmbeddedPollVote = async (poll) => {
    const pollId = poll?.id;
    if (!pollId || !id || !user?.uid) return;
    if (!canVoteEmbeddedPoll(poll)) return;
    setEmbeddedClearingByPoll((previous) => ({ ...previous, [pollId]: true }));
    setEmbeddedVoteErrors((previous) => ({ ...previous, [pollId]: null }));
    try {
      await deleteBasicPollVote("scheduler", id, pollId, user.uid);
      setEmbeddedVoteDrafts((previous) => ({
        ...previous,
        [pollId]: { optionIds: [], otherText: "", rankings: [] },
      }));
    } catch (error) {
      setEmbeddedVoteErrors((previous) => ({
        ...previous,
        [pollId]: error?.message || "Failed to clear vote.",
      }));
    } finally {
      setEmbeddedClearingByPoll((previous) => ({ ...previous, [pollId]: false }));
    }
  };

  const finalizeEmbeddedPollIndividually = async (poll) => {
    const pollId = poll?.id;
    if (!pollId || !id || !isCreator) return false;
    setEmbeddedLifecycleBusyByPoll((previous) => ({ ...previous, [pollId]: true }));
    try {
      await finalizeEmbeddedBasicPoll(id, pollId);
      toast.success(`Finalized add-on poll: ${poll?.title || "Untitled poll"}`);
      return true;
    } catch (error) {
      console.error("Failed to finalize add-on poll:", error);
      toast.error(error?.message || "Failed to finalize add-on poll.");
      return false;
    } finally {
      setEmbeddedLifecycleBusyByPoll((previous) => ({ ...previous, [pollId]: false }));
    }
  };

  const reopenEmbeddedPollIndividually = async (poll) => {
    const pollId = poll?.id;
    if (!pollId || !id || !isCreator) return false;
    setEmbeddedLifecycleBusyByPoll((previous) => ({ ...previous, [pollId]: true }));
    try {
      await reopenEmbeddedBasicPoll(id, pollId);
      toast.success(`Re-opened add-on poll: ${poll?.title || "Untitled poll"}`);
      return true;
    } catch (error) {
      console.error("Failed to re-open add-on poll:", error);
      toast.error(error?.message || "Failed to re-open add-on poll.");
      return false;
    } finally {
      setEmbeddedLifecycleBusyByPoll((previous) => ({ ...previous, [pollId]: false }));
    }
  };

  const breakEmbeddedPollTieIndividually = async (poll, method) => {
    const pollId = poll?.id;
    if (!pollId || !id || !isCreator) return false;
    setEmbeddedLifecycleBusyByPoll((previous) => ({ ...previous, [pollId]: true }));
    setEmbeddedVoteErrors((previous) => ({ ...previous, [pollId]: null }));
    try {
      await breakBasicPollTieForParent("scheduler", id, pollId, method);
      toast.success(`Tie-break applied: ${poll?.title || "Untitled poll"}`);
      return true;
    } catch (error) {
      console.error("Failed to break embedded poll tie:", error);
      setEmbeddedVoteErrors((previous) => ({
        ...previous,
        [pollId]: error?.message || "Failed to break tie.",
      }));
      return false;
    } finally {
      setEmbeddedLifecycleBusyByPoll((previous) => ({ ...previous, [pollId]: false }));
    }
  };

  const addCloneInvite = async (input) => {
    const raw = String(input || "").trim();
    if (!raw) return;
    let resolved;
    try {
      resolved = await resolveIdentifier(raw);
    } catch (err) {
      setCloneInviteError(err.message || "Enter a valid email or Discord username.");
      return;
    }
    const validation = validateInviteCandidate({
      email: resolved.email,
      selfEmail: scheduler.data?.creatorEmail,
      groupMemberSet: cloneGroupMemberSet,
      existingInvites: cloneInvites,
    });
    if (!validation.ok) {
      setCloneInviteError(validation.error);
      return;
    }
    const normalized = validation.normalized;
    setCloneInvites((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setCloneInviteInput("");
    setCloneInviteError(null);
  };

  const removeCloneInvite = (email) => {
    setCloneInvites((prev) => prev.filter((item) => item !== email));
  };

  const handleSave = async () => {
    if (!user || !userVoteRef) return;
    if (!isAcceptedParticipant) {
      toast.error("Accept the invite to vote on this poll.");
      return false;
    }
    const hasAttendingVote = Object.values(draftVotes || {}).some((value) =>
      isAttendingVote(value)
    );
    const willSubmitVote = Boolean(noTimesWork || hasAttendingVote);
    const wasAllVotesIn = allVotesIn;
    const hadVote = hasSubmittedSchedulerVote(userVote.data);
    const nextVoteCount = hadVote
      ? (willSubmitVote ? voteCount : Math.max(voteCount - 1, 0))
      : (willSubmitVote ? voteCount + 1 : voteCount);
    const shouldNotifyAllVotesIn =
      willSubmitVote &&
      !wasAllVotesIn &&
      scheduler.data?.status === "OPEN" &&
      participantCount > 0 &&
      nextVoteCount >= participantCount;
    setSaving(true);
    let success = false;
    try {
      if (willSubmitVote) {
        await upsertSchedulerVote(id, user.uid, {
          voterId: user.uid,
          userEmail: user.email,
          userAvatar: user.photoURL,
          votes: noTimesWork ? {} : draftVotes,
          noTimesWork,
          updatedAt: serverTimestamp(),
        });

        const recipient = normalizeEmail(scheduler.data?.creatorEmail);
        if (recipient && normalizeEmail(user.email) !== recipient) {
          const recipients = {
            userIds: scheduler.data?.creatorId ? [scheduler.data.creatorId] : [],
            emails: recipient ? [recipient] : [],
          };
          if (recipients.userIds.length || recipients.emails.length) {
            try {
              await emitPollEvent({
                eventType: "VOTE_SUBMITTED",
                schedulerId: id,
                pollTitle: scheduler.data?.title || "Session Poll",
                actor: buildNotificationActor(user),
                payload: {
                  pollTitle: scheduler.data?.title || "Session Poll",
                  voterEmail: normalizeEmail(user.email) || user.email,
                  voterUserId: user.uid,
                },
                recipients,
                dedupeKey: `poll:${id}:vote:${user.uid}`,
              });
            } catch (notifyErr) {
              console.error("Failed to notify creator about vote:", notifyErr);
            }
          }
        }
      } else if (userVote.data) {
        await deleteSchedulerVote(id, user.uid);
      }

      if (shouldNotifyAllVotesIn) {
        try {
          const normalizedCreatorEmail = normalizeEmail(scheduler.data?.creatorEmail) || null;
          const creatorRecipients = {
            userIds: scheduler.data?.creatorId ? [scheduler.data.creatorId] : [],
            emails: normalizedCreatorEmail ? [normalizedCreatorEmail] : [],
          };
          if (creatorRecipients.userIds.length || creatorRecipients.emails.length) {
            await emitPollEvent({
              eventType: "POLL_READY_TO_FINALIZE",
              schedulerId: id,
              pollTitle: scheduler.data?.title || "Session Poll",
              actor: buildNotificationActor(user),
              payload: {
                pollTitle: scheduler.data?.title || "Session Poll",
              },
              recipients: creatorRecipients,
              dedupeKey: `poll:${id}:ready-to-finalize`,
            });
          }

          const normalizedActorEmail = normalizeEmail(user.email) || null;
          const participantRecipientIds = Array.from(participantIdSet).filter(
            (participantId) =>
              participantId &&
              participantId !== scheduler.data?.creatorId &&
              participantId !== user.uid
          );
          const participantRecipientEmails = participantEmails.filter(
            (email) =>
              email &&
              email !== normalizedCreatorEmail &&
              email !== normalizedActorEmail
          );
          if (participantRecipientIds.length || participantRecipientEmails.length) {
            await emitPollEvent({
              eventType: "POLL_ALL_VOTES_IN",
              schedulerId: id,
              pollTitle: scheduler.data?.title || "Session Poll",
              actor: buildNotificationActor(user),
              payload: {
                pollTitle: scheduler.data?.title || "Session Poll",
              },
              recipients: {
                userIds: participantRecipientIds,
                emails: participantRecipientEmails,
              },
              dedupeKey: `poll:${id}:all-votes-in`,
            });
          }
        } catch (notifyErr) {
          console.error("Failed to notify all votes in:", notifyErr);
        }
      }
      toast.success(willSubmitVote ? "Votes saved successfully" : "Votes cleared");
      success = true;
    } catch (err) {
      console.error("Failed to save votes:", err);
      toast.error(err.message || "Failed to save votes. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
    return success;
  };

  const openFinalize = (slotId) => {
    if (pastSlotIds.has(slotId)) {
      toast.error("This time slot is in the past and cannot be selected.");
      return;
    }
    const linkedCalendarId = linkedCalendars[0]?.id || "";
    const baseTitle = scheduler.data?.title || "Quest Session";
    const groupName = questingGroupName;
    const calendarTitle = groupName ? `[${groupName}] ${baseTitle}` : baseTitle;
    const slot = slots.data.find((item) => item.id === slotId);
    const duration = slot?.start && slot?.end ? Math.round((new Date(slot.end) - new Date(slot.start)) / 60000) : 240;
    setFinalizeSlotId(slotId);
    setEventTitle(calendarTitle);
    setEventDescription(scheduler.data?.description || "");
    setEventDuration(duration || settings?.defaultDurationMinutes || 240);
    setEventAttendees(participantEmails.join(", "));
    setSelectedCalendarId(linkedCalendarId);
    setCreateCalendarEvent(Boolean(linkedCalendars.length));
    setDeleteOldEvent(true);
    setFinalizeOpen(true);
  };

  const requestEmbeddedFinalizeChoice = (slotId) => {
    const unfinalizedEmbeddedPollCount = (embeddedPolls || []).filter(
      (poll) => (poll?.status || "OPEN") !== "FINALIZED"
    ).length;
    if (isCreator && unfinalizedEmbeddedPollCount > 0) {
      setFinalizeSlotId(slotId);
      setFinalizeEmbeddedChoiceOpen(true);
      return;
    }
    setFinalizeOutstandingEmbeddedPolls(false);
    openFinalize(slotId);
  };

  const requestFinalize = (slotId) => {
    if (isLocked) return;
    if (pastSlotIds.has(slotId)) return;
    if (isCreator && hasPendingVotes) {
      setPendingFinalizeSlotId(slotId);
      setPendingVotesOpen(true);
      return;
    }
    if (!isCreator) {
      openFinalize(slotId);
      return;
    }

    setRequiredFinalizeChecking(true);
    fetchRequiredEmbeddedPollFinalizeSummary(id)
      .then((summary) => {
        const missingPolls = (summary?.requiredPolls || []).filter(
          (poll) => Number(poll?.missingCount || 0) > 0
        );
        if (missingPolls.length === 0) {
          requestEmbeddedFinalizeChoice(slotId);
          return;
        }

        setFinalizeSlotId(slotId);
        setRequiredFinalizeSummary(missingPolls);
        setRequiredFinalizeWarningOpen(true);
      })
      .catch((error) => {
        console.error("Failed to check required add-on polls before finalizing:", error);
        toast.error(error?.message || "Failed to check required add-on polls.");
      })
      .finally(() => {
        setRequiredFinalizeChecking(false);
      });
  };

  const continueFinalizeWithMissingRequired = () => {
    if (!finalizeSlotId) return;
    setRequiredFinalizeWarningOpen(false);
    requestEmbeddedFinalizeChoice(finalizeSlotId);
  };

  const continueFinalizeAndFinalizeEmbeddedPolls = () => {
    if (!finalizeSlotId) return;
    setFinalizeOutstandingEmbeddedPolls(true);
    setFinalizeEmbeddedChoiceOpen(false);
    openFinalize(finalizeSlotId);
  };

  const continueFinalizeWithoutFinalizingEmbeddedPolls = () => {
    if (!finalizeSlotId) return;
    setFinalizeOutstandingEmbeddedPolls(false);
    setFinalizeEmbeddedChoiceOpen(false);
    openFinalize(finalizeSlotId);
  };

  const submitVotesThenFinalize = async () => {
    if (!pendingFinalizeSlotId || !userVoteRef) return;
    setPendingFinalizeBusy(true);
    try {
      const saved = await handleSave();
      if (saved) {
        setPendingVotesOpen(false);
        requestFinalize(pendingFinalizeSlotId);
      }
    } catch (err) {
      console.error("Failed to submit votes before finalizing:", err);
    } finally {
      setPendingFinalizeBusy(false);
    }
  };

  const toggleNoTimesWork = (checked) => {
    if (checked) {
      setDraftVotes({});
      setNoTimesWork(true);
    } else {
      setNoTimesWork(false);
    }
  };

  const discardVotesThenFinalize = async () => {
    if (!pendingFinalizeSlotId || !userVoteRef) return;
    setPendingFinalizeBusy(true);
    try {
      await deleteSchedulerVote(id, user.uid);
      setDraftVotes({});
      setPendingVotesOpen(false);
      requestFinalize(pendingFinalizeSlotId);
    } catch (err) {
      console.error("Failed to clear votes before finalizing:", err);
      toast.error("Failed to clear your votes. Please try again.");
    } finally {
      setPendingFinalizeBusy(false);
    }
  };

  const deleteCalendarEntry = async () => {
    if (!id) return;
    const functions = getFunctions();
    const deleteEvent = httpsCallable(functions, "googleCalendarDeleteEvent");
    await deleteEvent({ schedulerId: id });
  };

  const handleFinalize = async () => {
    if (!finalizeSlotId || !schedulerDocRef) return;
    setSaving(true);
    try {
      const slot = slots.data.find((item) => item.id === finalizeSlotId);
      if (!slot?.start) {
        throw new Error("Selected slot is missing a start time.");
      }

      const start = new Date(slot.start);
      const durationMinutes = Number(eventDuration) || 240;
      const slotEnd =
        slot.end ? new Date(slot.end) : new Date(start.getTime() + durationMinutes * 60 * 1000);
      const shouldCreateEvent = createCalendarEvent && linkedCalendars.length > 0;
      if (durationMinutes < 1 || isNaN(durationMinutes)) {
        throw new Error("Invalid duration. Please enter a valid number of minutes.");
      }

      const parsedEmails = eventAttendees
        .split(/[\n,;]/)
        .map((email) => email.trim())
        .filter(Boolean);

      const creatorEmail = scheduler.data?.creatorEmail;
      const uniqueEmails = new Set(normalizeEmailList(parsedEmails));
      if (creatorEmail && !uniqueEmails.has(normalizeEmail(creatorEmail))) {
        parsedEmails.push(creatorEmail);
      }

      const invalidEmails = parsedEmails.filter((email) => !isValidEmail(email));
      if (invalidEmails.length > 0) {
        throw new Error(`Invalid email address: ${invalidEmails[0]}`);
      }

      const linkedCalendarId = selectedCalendarId || linkedCalendars[0]?.id;
      const functions = getFunctions();
      const finalizePoll = httpsCallable(functions, "googleCalendarFinalizePoll");
      await finalizePoll({
        schedulerId: id,
        slotId: finalizeSlotId,
        calendarId: linkedCalendarId,
        title: eventTitle,
        description: eventDescription,
        durationMinutes,
        attendees: normalizeEmailList(parsedEmails),
        deleteOldEvent,
        createCalendarEvent: shouldCreateEvent,
      });

      let finalizedEmbeddedPollCount = 0;
      if (isCreator && finalizeOutstandingEmbeddedPolls) {
        const pollsToFinalize = (embeddedPolls || []).filter(
          (poll) => (poll?.status || "OPEN") !== "FINALIZED"
        );
        if (pollsToFinalize.length > 0) {
          const results = await Promise.allSettled(
            pollsToFinalize.map((poll) => finalizeEmbeddedBasicPoll(id, poll.id))
          );
          finalizedEmbeddedPollCount = results.filter(
            (result) => result.status === "fulfilled"
          ).length;
          const failedCount = results.length - finalizedEmbeddedPollCount;
          if (failedCount > 0) {
            toast.error(
              `Session finalized, but ${failedCount} add-on poll${failedCount === 1 ? "" : "s"} could not be finalized.`
            );
          }
        }
      }

      const participantIds = Array.from(
        new Set(
          [
            ...(scheduler.data?.participantIds || []),
            ...questingGroupMemberIds,
          ].filter(Boolean)
        )
      );
      try {
        const normalizedCreatorEmail = normalizeEmail(creatorEmail) || null;
        const emails = new Set();
        if (participantIds.length > 0) {
          const profilesById = await fetchPublicProfilesByIds(participantIds);
          Object.values(profilesById).forEach((profile) => {
            if (!profile?.email) return;
            const normalized = normalizeEmail(profile.email);
            emails.add(normalized);
          });
        }

        const notificationTimeZone = resolvePollTimeZone(scheduler.data?.timezone);
        const winningLabel = formatZonedDateTimeRange({
          start,
          end: slotEnd,
          timeZone: notificationTimeZone,
          showTimeZone: true,
        });

        const recipientEmails = Array.from(emails).filter(
          (email) => email !== normalizedCreatorEmail
        );
        const recipientUserIds = participantIds.filter(
          (participantId) => participantId !== scheduler.data?.creatorId
        );
        const recipients = { userIds: recipientUserIds, emails: recipientEmails };

        if (
          shouldEmitPollLifecycleEvent({
            eventType: "POLL_FINALIZED",
            recipients,
            questingGroupDiscord: questingGroup.data?.discord,
          })
        ) {
          await emitPollEvent({
            eventType: "POLL_FINALIZED",
            schedulerId: id,
            pollTitle: scheduler.data?.title || "Session Poll",
            actor: buildNotificationActor(user),
            payload: {
              pollTitle: scheduler.data?.title || "Session Poll",
              winningDate: winningLabel,
            },
            recipients,
            dedupeKey: `poll:${id}:finalized`,
          });
        }
      } catch (notifyErr) {
        console.error("Failed to send finalization notifications:", notifyErr);
      }
      setFinalizeOpen(false);
      setFinalizeOutstandingEmbeddedPolls(false);
      toast.success(
        shouldCreateEvent
          ? finalizedEmbeddedPollCount > 0
            ? `Session finalized, calendar event created, and ${finalizedEmbeddedPollCount} add-on poll${finalizedEmbeddedPollCount === 1 ? "" : "s"} finalized`
            : "Session finalized and calendar event created"
          : finalizedEmbeddedPollCount > 0
            ? `Session finalized and ${finalizedEmbeddedPollCount} add-on poll${finalizedEmbeddedPollCount === 1 ? "" : "s"} finalized`
            : "Session finalized"
      );
    } catch (err) {
      console.error("Failed to finalize session poll:", err);
      toast.error(err.message || "Failed to finalize session poll. Your Google token may have expired - try signing out and back in.");
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async ({ updateCalendar } = {}) => {
    if (!schedulerDocRef) return;
    setSaving(true);
    let success = false;
    try {
      if (updateCalendar && scheduler.data?.googleEventId) {
        await deleteCalendarEntry();
      }
      await updateScheduler(id, {
        status: "OPEN",
        winningSlotId: null,
      });
      const participantIds = Array.from(
        new Set(
          [
            ...(scheduler.data?.participantIds || []),
            ...questingGroupMemberIds,
          ].filter(Boolean)
        )
      );
      try {
        const normalizedCreatorEmail = normalizeEmail(scheduler.data?.creatorEmail) || null;
        const emails = new Set();
        if (participantIds.length > 0) {
          const profilesById = await fetchPublicProfilesByIds(participantIds);
          Object.values(profilesById).forEach((profile) => {
            if (!profile?.email) return;
            const normalized = normalizeEmail(profile.email);
            emails.add(normalized);
          });
        }

        const recipientEmails = Array.from(emails).filter(
          (email) => email !== normalizedCreatorEmail
        );
        const recipientUserIds = participantIds.filter(
          (participantId) => participantId !== scheduler.data?.creatorId
        );
        const recipients = { userIds: recipientUserIds, emails: recipientEmails };

        if (
          shouldEmitPollLifecycleEvent({
            eventType: "POLL_REOPENED",
            recipients,
            questingGroupDiscord: questingGroup.data?.discord,
          })
        ) {
          await emitPollEvent({
            eventType: "POLL_REOPENED",
            schedulerId: id,
            pollTitle: scheduler.data?.title || "Session Poll",
            actor: buildNotificationActor(user),
            payload: {
              pollTitle: scheduler.data?.title || "Session Poll",
            },
            recipients,
          });
        }
      } catch (notifyErr) {
        console.error("Failed to send poll reopen notification:", notifyErr);
      }
      toast.success("Session poll re-opened");
      success = true;
    } catch (err) {
      console.error("Failed to re-open session poll:", err);
      toast.error(err.message || "Failed to re-open session poll. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
    return success;
  };

  const requestReopen = () => {
    if (scheduler.data?.googleEventId) {
      setReopenUpdateCalendar(false);
      setReopenOpen(true);
      return;
    }
    handleReopen();
  };

  const confirmReopen = async () => {
    const success = await handleReopen({ updateCalendar: reopenUpdateCalendar });
    if (success) {
      setReopenOpen(false);
      setReopenUpdateCalendar(false);
    }
  };

  const openCloneModal = () => {
    if (!scheduler.data || !user?.email) return;
    const baseTitle = scheduler.data.title || "Untitled poll";
    const originalCreatorEmail = scheduler.data.creatorEmail;

    // If user is the original creator, exclude themselves from invites
    // If user is NOT the original creator, they become the new owner:
    //   - exclude themselves from invites
    //   - add original creator to invites
    const normalizedUser = normalizeEmail(user.email);
    const baseInvites = explicitParticipantEmails.filter(
      (email) => email !== normalizedUser
    );
    const groupMemberSet = scheduler.data?.questingGroupId
      ? questingGroupMemberEmailSet
      : new Set();
    const newInvites = baseInvites.filter((email) => !groupMemberSet.has(email));

    // If not the creator, add original creator to invites
    if (!isCreator && originalCreatorEmail) {
      const normalizedCreator = normalizeEmail(originalCreatorEmail);
      if (normalizedCreator && !newInvites.includes(normalizedCreator)) {
        newInvites.push(normalizedCreator);
      }
    }

    setCloneTitle(`${baseTitle} (copy)`);
    setCloneInvites(newInvites);
    setCloneClearVotes(false);
    setCloneInviteError(null);
    setCloneGroupId(scheduler.data?.questingGroupId || null);
    setCloneOpen(true);
  };

  const handleClone = async () => {
    if (!scheduler.data || !user?.uid || !user?.email) return;
    setCloneSaving(true);
    try {
      // The cloner becomes the new owner
      const newCreatorId = user.uid;
      const newCreatorEmail = user.email;

      // Participants: new creator + all invites
      const inviteEmails = Array.from(
        new Set(
          [newCreatorEmail, ...cloneInvites]
            .map((email) => normalizeEmail(email))
            .filter(Boolean)
        )
      );
      const participantIdsByEmail = await findUserIdsByEmails(inviteEmails);
      participantIdsByEmail[normalizeEmail(newCreatorEmail)] = newCreatorId;
      const participantIds = Array.from(
        new Set(Object.values(participantIdsByEmail).filter(Boolean))
      );
      const pendingInvites = inviteEmails.filter(
        (email) => normalizeEmail(email) !== normalizeEmail(newCreatorEmail)
      );

      const cloneGroup = cloneGroupId
        ? groups.find((group) => group.id === cloneGroupId) || null
        : null;
      const cloneGroupName = cloneGroup
        ? cloneGroup.name
        : cloneGroupId === scheduler.data?.questingGroupId
          ? scheduler.data?.questingGroupName || null
          : null;
      const now = new Date();
      const futureSlots = slots.data.filter(
        (slot) => slot.start && new Date(slot.start) > now
      );
      if (futureSlots.length === 0) {
        toast.error("No future slots remain to clone");
        setCloneSaving(false);
        return;
      }

      if (isCreator && !cloneClearVotes) {
        const functions = getFunctions();
        const clonePoll = httpsCallable(functions, "cloneSchedulerPoll");
        const response = await clonePoll({
          schedulerId: id,
          title: cloneTitle || `${scheduler.data.title || "Untitled poll"} (copy)`,
          inviteEmails: cloneInvites,
          clearVotes: cloneClearVotes,
          questingGroupId: cloneGroupId,
          questingGroupName: cloneGroupName,
        });
        const newId = response.data?.schedulerId;
        if (!newId) {
          throw new Error("Failed to clone poll");
        }
        setCloneOpen(false);
        toast.success("Poll cloned successfully");
        navigate(`/scheduler/${newId}`);
        return;
      }

      const newId = crypto.randomUUID();
      await setScheduler(newId, {
        title: cloneTitle || `${scheduler.data.title || "Untitled poll"} (copy)`,
        description: scheduler.data?.description || "",
        creatorId: newCreatorId,
        creatorEmail: newCreatorEmail,
        status: "OPEN",
        participantIds,
        pendingInvites,
        timezone: scheduler.data.timezone,
        timezoneMode: scheduler.data.timezoneMode,
        winningSlotId: null,
        googleEventId: null,
        googleCalendarId: null,
        createdAt: serverTimestamp(),
        questingGroupId: cloneGroupId || null,
        questingGroupName: cloneGroupName,
      });

      const slotWrites = futureSlots.map((slot) =>
        upsertSchedulerSlot(newId, slot.id, {
          start: slot.start,
          end: slot.end,
          stats: { feasible: 0, preferred: 0 },
        })
      );
      await Promise.all(slotWrites);

      await cloneEmbeddedBasicPolls(id, newId, {
        clearVotes: cloneClearVotes,
        userId: cloneClearVotes ? null : user.uid,
        votesByPollId: embeddedMyVotes,
      });

      if (!cloneClearVotes) {
        const validSlotIds = new Set(futureSlots.map((slot) => slot.id));
        const participantIdSet = new Set(participantIds);
        await Promise.all(
          allVotes.data.map((voteDoc) => {
            if (voteDoc.id !== user.uid) {
              return Promise.resolve();
            }
            if (!participantIdSet.has(voteDoc.id)) return Promise.resolve();
            const nextVotes = Object.fromEntries(
              Object.entries(voteDoc.votes || {}).filter(([slotId]) =>
                validSlotIds.has(slotId)
              )
            );
            if (Object.keys(nextVotes).length === 0 && !voteDoc.noTimesWork) {
              return Promise.resolve();
            }
            return upsertSchedulerVote(newId, voteDoc.id, {
              voterId: voteDoc.id,
              userEmail: voteDoc.userEmail,
              userAvatar: voteDoc.userAvatar,
              votes: nextVotes,
              noTimesWork: Boolean(voteDoc.noTimesWork),
              updatedAt: serverTimestamp(),
            });
          })
        );
      }

      setCloneOpen(false);
      toast.success("Poll cloned successfully");
      navigate(`/scheduler/${newId}`);
    } catch (err) {
      console.error("Failed to clone poll:", err);
      toast.error(err.message || "Failed to clone poll");
    } finally {
      setCloneSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!id) return;
    setArchiveSaving(true);
    try {
      await archivePoll(id);
      toast.success("Session poll archived");
    } catch (err) {
      console.error("Failed to archive session poll:", err);
      toast.error(err.message || "Failed to archive session poll");
    } finally {
      setArchiveSaving(false);
    }
  };

  const handleUnarchive = async () => {
    if (!id) return;
    setArchiveSaving(true);
    try {
      await unarchivePoll(id);
      toast.success("Session poll unarchived");
    } catch (err) {
      console.error("Failed to unarchive session poll:", err);
      toast.error(err.message || "Failed to unarchive session poll");
    } finally {
      setArchiveSaving(false);
    }
  };

  const handleCancelSession = async () => {
    if (!id) return;
    setCancelSaving(true);
    try {
      await updateScheduler(id, {
        status: "CANCELLED",
        updatedAt: serverTimestamp(),
      });
      const participantIds = Array.from(
        new Set(
          [
            ...(scheduler.data?.participantIds || []),
            ...questingGroupMemberIds,
          ].filter(Boolean)
        )
      );
      try {
        const normalizedCreatorEmail = normalizeEmail(scheduler.data?.creatorEmail) || null;
        const emails = new Set();
        if (participantIds.length > 0) {
          const profilesById = await fetchPublicProfilesByIds(participantIds);
          Object.values(profilesById).forEach((profile) => {
            if (!profile?.email) return;
            const normalized = normalizeEmail(profile.email);
            emails.add(normalized);
          });
        }

        const recipientEmails = Array.from(emails).filter(
          (email) => email !== normalizedCreatorEmail
        );
        const recipientUserIds = participantIds.filter(
          (participantId) => participantId !== scheduler.data?.creatorId
        );
        const recipients = { userIds: recipientUserIds, emails: recipientEmails };

        if (
          shouldEmitPollLifecycleEvent({
            eventType: "POLL_CANCELLED",
            recipients,
            questingGroupDiscord: questingGroup.data?.discord,
          })
        ) {
          await emitPollEvent({
            eventType: "POLL_CANCELLED",
            schedulerId: id,
            pollTitle: scheduler.data?.title || "Session Poll",
            actor: buildNotificationActor(user),
            payload: {
              pollTitle: scheduler.data?.title || "Session Poll",
            },
            recipients,
            dedupeKey: `poll:${id}:cancelled`,
          });
        }
      } catch (notifyErr) {
        console.error("Failed to send poll cancellation notification:", notifyErr);
      }
      toast.success("Session cancelled");
      setCancelOpen(false);
    } catch (err) {
      console.error("Failed to cancel session:", err);
      toast.error(err.message || "Failed to cancel session");
    } finally {
      setCancelSaving(false);
    }
  };

  const handleRestoreSession = async () => {
    if (!id) return;
    setRestoreSaving(true);
    try {
      const nextStatus = scheduler.data?.winningSlotId ? "FINALIZED" : "OPEN";
      await updateScheduler(id, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      const participantIds = Array.from(
        new Set(
          [
            ...(scheduler.data?.participantIds || []),
            ...questingGroupMemberIds,
          ].filter(Boolean)
        )
      );
      try {
        const normalizedCreatorEmail = normalizeEmail(scheduler.data?.creatorEmail) || null;
        const emails = new Set();
        if (participantIds.length > 0) {
          const profilesById = await fetchPublicProfilesByIds(participantIds);
          Object.values(profilesById).forEach((profile) => {
            if (!profile?.email) return;
            const normalized = normalizeEmail(profile.email);
            emails.add(normalized);
          });
        }

        const recipientEmails = Array.from(emails).filter(
          (email) => email !== normalizedCreatorEmail
        );
        const recipientUserIds = participantIds.filter(
          (participantId) => participantId !== scheduler.data?.creatorId
        );
        const recipients = { userIds: recipientUserIds, emails: recipientEmails };

        if (
          shouldEmitPollLifecycleEvent({
            eventType: "POLL_RESTORED",
            recipients,
            questingGroupDiscord: questingGroup.data?.discord,
          })
        ) {
          await emitPollEvent({
            eventType: "POLL_RESTORED",
            schedulerId: id,
            pollTitle: scheduler.data?.title || "Session Poll",
            actor: buildNotificationActor(user),
            payload: {
              pollTitle: scheduler.data?.title || "Session Poll",
            },
            recipients,
            dedupeKey: `poll:${id}:restored`,
          });
        }
      } catch (notifyErr) {
        console.error("Failed to send poll restoration notification:", notifyErr);
      }
      toast.success("Session restored");
    } catch (err) {
      console.error("Failed to restore session:", err);
      toast.error(err.message || "Failed to restore session");
    } finally {
      setRestoreSaving(false);
    }
  };

  const handleNudge = async () => {
    if (!id) return;
    setNudgeSending(true);
    try {
      const result = await nudgeDiscordSessionPoll(id);
      const { nudgedCount = 0, totalNonVoters = 0 } = result || {};
      if (nudgedCount < totalNonVoters) {
        toast.success(
          `Nudged ${nudgedCount} participant${nudgedCount === 1 ? "" : "s"} on Discord. ${totalNonVoters - nudgedCount} non-voter${totalNonVoters - nudgedCount === 1 ? " has" : "s have"} not linked Discord.`
        );
      } else {
        toast.success(
          `Nudged ${nudgedCount} participant${nudgedCount === 1 ? "" : "s"} on Discord!`
        );
      }
    } catch (err) {
      console.error("Failed to nudge participants:", err);
      toast.error(err.message || "Failed to nudge participants");
    } finally {
      setNudgeSending(false);
    }
  };

  const handleRepostDiscordPoll = async () => {
    if (!id) return;
    setRepostSending(true);
    try {
      await repostDiscordPollCard(id);
      toast.success("Reposted the poll to Discord.");
    } catch (err) {
      console.error("Failed to repost Discord poll:", err);
      toast.error(err.message || "Failed to repost the poll to Discord");
    } finally {
      setRepostSending(false);
    }
  };

  const handleDelete = async () => {
    if (!schedulerDocRef || !id) return;
    setDeleteSaving(true);
    try {
      if (deleteUpdateCalendar && scheduler.data?.googleEventId) {
        await deleteCalendarEntry();
      }
      await deleteSchedulerWithRelatedData(id);

      toast.success("Session poll deleted");
      navigate("/dashboard");
    } catch (err) {
      console.error("Failed to delete session poll:", err);
      toast.error(err.message || "Failed to delete session poll");
    } finally {
      setDeleteSaving(false);
      setDeleteOpen(false);
    }
  };

  if (scheduler.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center dark:text-slate-300">
        <LoadingState message="Loading session poll..." />
      </div>
    );
  }

  if (scheduler.error?.code === "permission-denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center text-slate-600 dark:text-slate-400">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Access denied
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
            You don&apos;t have access to this session poll.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!scheduler.data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600 dark:text-slate-400">
        Session poll not found.
      </div>
    );
  }

  const canVote = Boolean(isAcceptedParticipant && !isLocked);
  const embeddedPollsSorted = [...embeddedPolls].sort((left, right) => {
    const leftOrder = Number.isFinite(left?.order) ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right?.order) ? right.order : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
  const unfinalizedEmbeddedPollCount = embeddedPollsSorted.filter(
    (poll) => (poll?.status || "OPEN") !== "FINALIZED"
  ).length;
  const embeddedCompletedCount = embeddedPollsSorted.filter((poll) =>
    hasSubmittedEmbeddedVote(poll, embeddedMyVotes[poll.id])
  ).length;
  const requiredEmbeddedPolls = embeddedPollsSorted.filter((poll) => poll.required);
  const requiredEmbeddedPendingCount = requiredEmbeddedPolls.filter(
    (poll) => !hasSubmittedEmbeddedVote(poll, embeddedMyVotes[poll.id])
  ).length;
  const showSessionNudgeButton = Boolean(
    isCreator &&
      scheduler.data?.discord?.messageId &&
      scheduler.data?.status === "OPEN" &&
      (sessionPollMissingNudgeUserIds.length > 0 || hasRequiredEmbeddedNudgeTargets)
  );
  const pendingInviteMeta =
    (normalizedUserEmail && scheduler.data.pendingInviteMeta?.[normalizedUserEmail]) || {};
  const inviterLabel = pendingInviteMeta.invitedByEmail || scheduler.data.creatorEmail || "someone";
  const inviterProfile =
    participantMapByEmail.get(normalizeEmail(inviterLabel)) || { email: inviterLabel };
  const pollDescription = (scheduler.data.description || "").trim();
  const canAccess =
    isCreator ||
    scheduler.data.allowLinkSharing ||
    isAcceptedParticipant ||
    isPendingInvite;
  const canRepostDiscordPoll = Boolean(
    isCreator &&
      scheduler.data?.questingGroupId &&
      questingGroup.data?.discord?.channelId &&
      questingGroup.data?.discord?.guildId
  );
  if (!canAccess) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center text-slate-600 dark:text-slate-400">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Access denied
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
            This session poll requires an invite.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                Session Poll
              </p>
              <h2 className="text-2xl font-semibold dark:text-slate-100">{scheduler.data.title}</h2>
              <PollMarkdownContent
                content={pollDescription}
                className="mt-2 text-sm text-slate-600 dark:text-slate-300"
              />
              <PollStatusMeta
                scheduler={scheduler.data}
                winningSlot={winningSlot}
                slots={slots.data}
                allVotesIn={allVotesIn}
                isArchived={isPollArchived}
                questingGroupName={questingGroupName}
                questingGroupColor={questingGroupColor}
                guestCount={nonGroupParticipants.length}
                displayTimeZone={displayTimeZone}
                showTimeZone={showTimeZone}
              />
              <PollDiscordMetaRow
                statusLabel={discordStatus}
                messageUrl={discordMessageUrl}
                pendingSync={scheduler.data?.discord?.pendingSync === true}
                className="mt-2"
              >
                {showSessionNudgeButton ? (
                  <PollNudgeButton
                    onClick={handleNudge}
                    sending={nudgeSending}
                    cooldownRemainingMs={nudgeCooldownRemaining}
                  />
                ) : null}
              </PollDiscordMetaRow>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 p-2 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                  aria-label="Poll options"
                >
                  <MoreVertical className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {/* Edit - owner only, not archived, not finalized */}
                {isCreator && !isPollArchived && !isLocked && (
                  <DropdownMenuItem onClick={() => navigate(`/scheduler/${id}/edit`)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit poll
                  </DropdownMenuItem>
                )}
                {/* Clone - available to everyone */}
                <DropdownMenuItem onClick={openCloneModal}>
                  <Copy className="mr-2 h-4 w-4" />
                  Clone poll
                </DropdownMenuItem>
                {canCopyVotes && (
                  <DropdownMenuItem onClick={() => setCopyVotesOpen(true)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy votes
                  </DropdownMenuItem>
                )}
                {canRepostDiscordPoll && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleRepostDiscordPoll} disabled={repostSending}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {repostSending ? "Reposting..." : "Repost Discord poll"}
                    </DropdownMenuItem>
                  </>
                )}
                {isExplicitParticipant && !isCreator && !isPendingInvite && (
                  <DropdownMenuItem
                    onClick={() => {
                      if (isGroupMember) {
                        toast.error("Leave the questing group to be removed from this poll.");
                        return;
                      }
                      setLeaveOpen(true);
                    }}
                  >
                    Leave poll
                  </DropdownMenuItem>
                )}
                {/* Archive/Unarchive - available to everyone */}
                {isPollArchived ? (
                  <DropdownMenuItem onClick={handleUnarchive} disabled={archiveSaving}>
                    <ArchiveRestore className="mr-2 h-4 w-4" />
                    {archiveSaving ? "Unarchiving..." : "Unarchive poll"}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleArchive} disabled={archiveSaving}>
                    <Archive className="mr-2 h-4 w-4" />
                    {archiveSaving ? "Archiving..." : "Archive poll"}
                  </DropdownMenuItem>
                )}
                {/* Re-open - owner only, finalized polls */}
                {isCreator && scheduler.data?.status === "FINALIZED" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={requestReopen} disabled={saving}>
                      Re-open poll
                    </DropdownMenuItem>
                  </>
                )}
                {isCreator && scheduler.data?.status !== "CANCELLED" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setCancelOpen(true)}
                      className="text-amber-700 focus:text-amber-700 dark:text-amber-200 dark:focus:text-amber-200"
                    >
                      Cancel session
                    </DropdownMenuItem>
                  </>
                )}
                {isCreator && scheduler.data?.status === "CANCELLED" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleRestoreSession} disabled={restoreSaving}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {restoreSaving ? "Restoring..." : "Restore session"}
                    </DropdownMenuItem>
                  </>
                )}
                {/* Delete - owner only */}
                {isCreator && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteOpen(true)}
                      className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete poll
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            {participantCount} participants
          </p>

          <div className="mt-6 rounded-3xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Participants</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {participantCount} total · {voteCount} voted
                </p>
              </div>
              <AvatarStackWithColors
                users={participants}
                max={8}
                size={24}
              />
            </div>
            {questingGroupName && (
              <div
                className="mt-3 rounded-2xl border px-3 py-3 text-xs"
                style={{
                  borderColor: questingGroupColor || "#10b981",
                  backgroundColor: `${questingGroupColor || "#10b981"}22`,
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-100">
                    Questing group
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-100"
                    style={{
                      backgroundColor: `${questingGroupColor || "#10b981"}33`,
                    }}
                  >
                    {questingGroupName}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-300">
                    {questingGroupMembers.length} members
                  </span>
                </div>
                <div className="mt-2 grid gap-2">
                  {groupUsersWithStatus.length === 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      No members listed for this group.
                    </span>
                  )}
                  {groupUsersWithStatus.map((member) => (
                    <div
                      key={member.email}
                      className="flex items-center gap-2 rounded-xl border border-transparent bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
                    >
                      <AvatarBubbleWithColors user={member} size={22} />
                      <UserIdentity user={member} className="text-xs" />
                      <span
                        className={`ml-auto text-[10px] font-semibold ${
                          member.hasVoted
                            ? "text-emerald-600 dark:text-emerald-300"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {member.hasVoted ? "Voted" : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {questingGroupName && nonGroupParticipants.length === 0 && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  No additional participants outside the questing group.
                </span>
              )}
              {nonGroupParticipants.map((participant) => (
                <div
                  key={participant.email}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <AvatarBubbleWithColors user={participant} size={18} />
                  <UserIdentity user={participant} className="text-slate-700 dark:text-slate-200" />
                  <span
                    className={`text-[10px] font-semibold ${
                      participant.isPendingInvite
                        ? "text-amber-600 dark:text-amber-300"
                        : participant.hasVoted
                          ? "text-emerald-600 dark:text-emerald-300"
                          : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {participant.isPendingInvite
                      ? "Pending invite"
                      : participant.hasVoted
                        ? "Voted"
                        : "Pending"}
                  </span>
                  {isCreator &&
                    normalizeEmail(participant.email) !==
                      normalizeEmail(scheduler.data.creatorEmail) &&
                    !participant.isGroupMember && (
                    <button
                      type="button"
                      onClick={() => {
                        setMemberToRemove(participant);
                        setRemoveMemberOpen(true);
                      }}
                      className="ml-1 text-[10px] font-semibold text-red-500 hover:text-red-600"
                      title="Remove participant"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            {pendingInviteNonParticipants.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Pending invites
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pendingInviteNonParticipants.map((invitee) => (
                    <div
                      key={invitee.email}
                      className="flex items-center gap-2 rounded-full border border-dashed border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                    >
                      <UserIdentity user={invitee} showIdentifier={false} />
                      {isCreator && (
                        <button
                          type="button"
                          onClick={() => {
                            setInviteToRevoke(invitee.email);
                            setRevokeInviteOpen(true);
                          }}
                          className="text-[10px] font-semibold text-amber-700 hover:text-amber-800 dark:text-amber-200 dark:hover:text-amber-100"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* View toggle - moved below participants */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-700">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  view === "list" ? "bg-brand-primary text-white" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600"
                }`}
              >
                List View
              </button>
              <button
                type="button"
                onClick={() => setView("calendar")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  view === "calendar" ? "bg-brand-primary text-white" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600"
                }`}
              >
                Calendar View
              </button>
            </div>
            {!isLocked && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a winning slot from Results when ready to finalize.
              </p>
            )}
          </div>

          {view === "calendar" && (
            <div className="mt-6 rounded-3xl border border-slate-200/70 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div
                  data-testid="calendar-no-times-work-toggle"
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <span>No times work for me</span>
                  <Switch
                    checked={noTimesWork}
                    disabled={isLocked}
                    onCheckedChange={toggleNoTimesWork}
                  />
                </div>
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
              <Calendar
                key={calendarKey}
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                selectable
                scrollToTime={scrollToTime}
                enableAutoScroll={calendarView !== "month"}
                date={calendarDate}
                onNavigate={setCalendarDate}
                views={["month", "week", "day"]}
                view={calendarView}
                onView={(nextView) => setCalendarView(nextView)}
                onSelectSlot={(slotInfo) => {
                  if (calendarView === "month") return;
                  setModalDate(slotInfo.start);
                }}
                onSelectEvent={(event) => {
                  setSelectedEventId(event.id);
                  if (calendarView === "month") return;
                  setModalDate(event.start);
                }}
                doShowMoreDrillDown={false}
                onShowMore={(events, date) => {
                  if (Array.isArray(events) && events.length > 0) {
                    setSelectedEventId(events[0]?.id || null);
                  }
                  setModalDate(date);
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
                components={{
                  event: EventCell,
                  toolbar: CalendarToolbar,
                }}
                eventPropGetter={(event) => {
                  const style = {};
                  const winningSlotId = scheduler.data?.winningSlotId;
                  const isFinalized =
                    scheduler.data?.status === "FINALIZED" && Boolean(winningSlotId);
                  const isWinner = winningSlotId === event.id;
                  const myVote = draftVotes[event.id] || null;
                  let baseGlow = "";

                  if (isFinalized) {
                    style.backgroundColor = isWinner ? "#22c55e" : "#e2e8f0";
                    style.borderColor = isWinner ? "#16a34a" : "#cbd5e1";
                    style.color = isWinner ? "#ffffff" : "#475569";
                    style.opacity = isWinner ? 0.95 : 0.8;
                    style.fontWeight = isWinner ? 600 : 500;
                  } else if (noTimesWork) {
                    style.backgroundColor = "#64748b";
                    style.borderColor = "#475569";
                    style.color = "#e2e8f0";
                    style.opacity = 0.45;
                  } else if (calendarView === "month" && myVote === "PREFERRED") {
                    style.backgroundColor = "#ca8a04";
                    style.borderColor = "#eab308";
                    style.color = "#ffffff";
                    baseGlow = "0 0 0 1px rgba(250,204,21,0.45), 0 0 12px rgba(250,204,21,0.35)";
                  } else if (calendarView === "month" && myVote === "FEASIBLE") {
                    style.backgroundColor = "#16a34a";
                    style.borderColor = "#22c55e";
                    style.color = "#ffffff";
                  }

                  if (selectedEventId === event.id) {
                    const selectionGlow =
                      "0 0 0 2px rgba(59, 130, 246, 0.7), 0 0 12px rgba(59, 130, 246, 0.35)";
                    style.boxShadow = baseGlow ? `${baseGlow}, ${selectionGlow}` : selectionGlow;
                  } else if (baseGlow) {
                    style.boxShadow = baseGlow;
                  }

                  return Object.keys(style).length ? { style } : {};
                }}
                style={{ height: 520 }}
              />
            </div>
          )}

          {view === "list" && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <span>No times work for me</span>
                <Switch
                  checked={noTimesWork}
                  disabled={isLocked}
                  onCheckedChange={toggleNoTimesWork}
                />
              </div>
              {slots.loading && (
                <LoadingState message="Loading slots..." className="py-4" />
              )}
              {!slots.loading && slots.data.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No slots have been proposed yet.
                </p>
              )}
              {slotsByDate.map((slot) => {
                const vote = draftVotes[slot.id];
                const counts = tallies[slot.id] || { feasible: 0, preferred: 0 };
                const voters = slotVoters[slot.id] || { feasible: [], preferred: [] };
                const startDate = slot.start ? new Date(slot.start) : null;
                const blocker = userBlockersBySlotId?.[slot.id] || null;
                const blockerScheduler =
                  blocker?.sourceSchedulerId ? blockingSchedulersById?.[blocker.sourceSchedulerId] : null;
                return (
                  <div
                    key={slot.id}
                    className={`grid gap-3 rounded-2xl border px-4 py-3 md:grid-cols-[1.4fr_1fr_1fr_auto] ${
                      pastSlotIds.has(slot.id)
                        ? "border-red-300 bg-red-50/60 dark:border-red-700 dark:bg-red-900/20"
                        : blocker
                          ? "border-slate-200/70 bg-slate-100/70 dark:border-slate-700 dark:bg-slate-800/60"
                          : "border-slate-200/70 dark:border-slate-700"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {startDate
                          ? formatZonedDateTimeRange({
                              start: startDate,
                              end: slot.end ? new Date(slot.end) : null,
                              timeZone: displayTimeZone,
                              startPattern: "EEE, MMM d, yyyy · h:mm a",
                              endPattern: "h:mm a",
                              showTimeZone,
                            })
                          : "Slot"}
                      </p>
                      {blocker && (
                        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-semibold">Busy</span>{" "}
                          <span className="text-slate-500 dark:text-slate-400">
                            (ignored in results)
                          </span>
                          {blocker?.sourceSchedulerId && (
                            <button
                              type="button"
                              className="ml-2 font-semibold text-brand-primary hover:underline"
                              onClick={() => navigate(`/scheduler/${blocker.sourceSchedulerId}`)}
                            >
                              View{" "}
                              {blockerScheduler?.title
                                ? `"${blockerScheduler.title}"`
                                : "blocking session"}
                            </button>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Preferred {counts.preferred} · Feasible {counts.feasible}
                      </p>
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold">Preferred</span>
                          <VotingAvatarStack users={voters.preferred} size={20} colorMap={colorMap} />
                          <span className="text-slate-400 dark:text-slate-500">
                            {counts.preferred}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold">Feasible</span>
                          <VotingAvatarStack users={voters.feasible} size={20} colorMap={colorMap} />
                          <span className="text-slate-400 dark:text-slate-500">
                            {counts.feasible}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Feasible
                      </span>
                      <VoteToggle
                        checked={vote === "FEASIBLE" || vote === "PREFERRED"}
                        disabled={!canVote || noTimesWork || vote === "PREFERRED" || pastSlotIds.has(slot.id)}
                        onChange={(checked) => setVote(slot.id, checked ? "FEASIBLE" : null)}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Preferred
                      </span>
                      <VoteToggle
                        checked={vote === "PREFERRED"}
                        disabled={!canVote || noTimesWork || pastSlotIds.has(slot.id)}
                        onChange={(checked) =>
                          setVote(slot.id, checked ? "PREFERRED" : null)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-end text-xs text-slate-400 dark:text-slate-500">
                      {blocker && "Busy"}
                      {noTimesWork && "Unavailable"}
                      {vote === "PREFERRED" && "Preferred"}
                      {vote === "FEASIBLE" && "Feasible"}
                      {!vote && !noTimesWork && "No vote"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-10 rounded-3xl border border-slate-200/70 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Results</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Sort by preferred votes or total attendance.
                  {hasRequiredAttendanceFilter && (
                    <span className="ml-2 text-slate-400 dark:text-slate-500">
                      {filteredSortedSlots.length} of {sortedSlots.length} slots match required
                      attendance.
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-700">
                  <button
                    type="button"
                    onClick={() => setSortMode("preferred")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      sortMode === "preferred"
                        ? "bg-brand-primary text-white"
                        : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600"
                    }`}
                  >
                    Maximize Preferred
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortMode("attendance")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      sortMode === "attendance"
                        ? "bg-brand-primary text-white"
                        : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600"
                    }`}
                  >
                    Maximize Attendance
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title={requiredAttendanceTitle}
                        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-300">
                          Required
                        </span>
                        {hasRequiredAttendanceFilter ? (
                          <>
                            <AvatarStackWithColors
                              users={requiredAttendanceUsers}
                              max={3}
                              size={18}
                            />
                            <span className="text-xs text-slate-700 dark:text-slate-100">
                              {requiredAttendanceLabel}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-600/60 dark:text-slate-200">
                              {requiredAttendance.length}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-300">
                            Anyone
                          </span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72 p-2">
                      <DropdownMenuLabel>Required attendance</DropdownMenuLabel>
                      <div className="max-h-72 space-y-1 overflow-y-auto">
                        {requiredAttendanceOptions.length === 0 && (
                          <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                            No participants available yet.
                          </p>
                        )}
                        {requiredAttendanceOptions.map((participant) => {
                          const isSelected = requiredAttendanceSet.has(participant.email);
                          return (
                            <DropdownMenuItem
                              key={participant.email}
                              role="menuitemcheckbox"
                              aria-checked={isSelected}
                              onSelect={(event) => {
                                event.preventDefault();
                                toggleRequiredAttendance(participant.email);
                              }}
                              className="gap-2"
                            >
                              <span
                                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                                  isSelected
                                    ? "border-brand-primary bg-brand-primary text-white"
                                    : "border-slate-200 text-transparent dark:border-slate-600"
                                }`}
                              >
                                <Check size={12} />
                              </span>
                              <AvatarBubbleWithColors user={participant} size={18} />
                              <div className="min-w-0 flex-1">
                                <UserIdentity
                                  user={participant}
                                  className="block truncate text-slate-700 dark:text-slate-100"
                                />
                              </div>
                              <div className="ml-auto flex items-center gap-1">
                                {participant.isPendingInvite && (
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                                    Pending
                                  </span>
                                )}
                                {!participant.hasVoted && (
                                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                    No votes
                                  </span>
                                )}
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!hasRequiredAttendanceFilter}
                        onSelect={(event) => {
                          event.preventDefault();
                          clearRequiredAttendance();
                        }}
                        className="justify-between text-xs font-semibold text-slate-500"
                      >
                        Clear filter
                        {hasRequiredAttendanceFilter && <X size={12} />}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {hasRequiredAttendanceFilter && (
                    <button
                      type="button"
                      onClick={clearRequiredAttendance}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600"
                      aria-label="Clear required attendance filter"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {filteredSortedSlots.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  {hasRequiredAttendanceFilter
                    ? "No slots match the required attendance filter."
                    : "No slots to display yet."}
                  {hasRequiredAttendanceFilter && (
                    <button
                      type="button"
                      onClick={clearRequiredAttendance}
                      className="ml-3 text-xs font-semibold text-brand-primary"
                    >
                      Clear filter
                    </button>
                  )}
                </div>
              ) : (
                filteredSortedSlots.map((slot) => {
                const startDate = slot.start ? new Date(slot.start) : null;
                const endDate = slot.end ? new Date(slot.end) : null;
                const voters = slotVoters[slot.id] || { feasible: [], preferred: [] };
                const isPast = pastSlotIds.has(slot.id);
                const hasWinner = Boolean(scheduler.data?.winningSlotId);
                const isWinner = scheduler.data?.winningSlotId === slot.id && isLocked;
                const isMuted = hasWinner && !isWinner && isLocked;
                return (
                  <div
                    key={slot.id}
                    className={`rounded-2xl border px-4 py-3 dark:bg-slate-900 ${
                      isWinner
                        ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-900/30"
                        : isPast
                          ? "border-red-300 bg-red-50/60 dark:border-red-700 dark:bg-red-900/20"
                          : "border-slate-200/70 bg-white dark:border-slate-700"
                    } ${isMuted ? "opacity-60 grayscale" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {startDate
                            ? formatZonedDateTimeRange({
                                start: startDate,
                                end: endDate,
                                timeZone: displayTimeZone,
                                startPattern: "EEE, MMM d, yyyy · h:mm a",
                                endPattern: "h:mm a",
                                showTimeZone,
                              })
                            : "Slot"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Preferred {slot.counts.preferred} · Feasible {slot.counts.feasible}
                        </p>
                        {isPast && (
                          <p className="mt-1 text-xs font-semibold text-red-500 dark:text-red-400">
                            This slot is in the past.
                          </p>
                        )}
                        {expandedSlots[slot.id] && (
                          <div className="mt-2 flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-semibold">★ Preferred</span>
                              <AvatarStackWithColors users={voters.preferred} max={8} size={22} />
                              <span className="text-slate-400 dark:text-slate-500">
                                {slot.counts.preferred}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-semibold">✓ Feasible</span>
                              <AvatarStackWithColors users={voters.feasible} max={8} size={22} />
                              <span className="text-slate-400 dark:text-slate-500">
                                {slot.counts.feasible}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(slot.id)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                        >
                          {expandedSlots[slot.id] ? "Hide details" : "Details"}
                        </button>
                        {isCreator && (
                          <span
                            title={
                              isPast
                                ? "This time slot is in the past and cannot be selected."
                                : ""
                            }
                          >
                            <button
                              type="button"
                              disabled={isLocked || isPast || requiredFinalizeChecking}
                              onClick={() => requestFinalize(slot.id)}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              {isLocked && scheduler.data?.winningSlotId === slot.id
                                ? "Winner"
                                : "Select winner"}
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                    {expandedSlots[slot.id] && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            ★ Preferred voters
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <AvatarStackWithColors users={voters.preferred} max={8} size={22} />
                            <span className="text-slate-400 dark:text-slate-500">
                              {slot.counts.preferred}
                            </span>
                          </div>
                          {voters.preferred.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                              No preferred votes yet.
                            </p>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {voters.preferred.map((voter) => (
                                <div
                                  key={voter.email}
                                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                                >
                                  <AvatarBubbleWithColors user={voter} size={20} />
                                  <UserIdentity
                                    user={
                                      participantMapByEmail.get(normalizeEmail(voter.email)) || voter
                                    }
                                    className="text-slate-700 dark:text-slate-200"
                                  />
                                  {voter.source === "discord" && (
                                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:border-indigo-700/60 dark:bg-indigo-900/40 dark:text-indigo-200">
                                      Discord
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            ✓ Feasible voters
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <AvatarStackWithColors users={voters.feasible} max={8} size={22} />
                            <span className="text-slate-400 dark:text-slate-500">
                              {slot.counts.feasible}
                            </span>
                          </div>
                          {voters.feasible.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                              No feasible votes yet.
                            </p>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {voters.feasible.map((voter) => (
                                <div
                                  key={voter.email}
                                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                                >
                                  <AvatarBubbleWithColors user={voter} size={20} />
                                  <UserIdentity
                                    user={
                                      participantMapByEmail.get(normalizeEmail(voter.email)) || voter
                                    }
                                    className="text-slate-700 dark:text-slate-200"
                                  />
                                  {voter.source === "discord" && (
                                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:border-indigo-700/60 dark:bg-indigo-900/40 dark:text-indigo-200">
                                      Discord
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
                })
              )}
            </div>
          </div>

          {embeddedPollsLoading ? (
            <div className="mt-10 rounded-3xl border border-slate-200/70 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
              Loading add-on polls...
            </div>
          ) : null}
          {!embeddedPollsLoading && embeddedPollsSorted.length > 0 ? (
            <div className="mt-10 rounded-3xl border border-slate-200/70 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Add-on polls
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {embeddedCompletedCount}/{embeddedPollsSorted.length} polls completed
                  </p>
                </div>
                {requiredEmbeddedPendingCount > 0 ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200">
                    {requiredEmbeddedPendingCount} required add-on poll
                    {requiredEmbeddedPendingCount === 1 ? "" : "s"} pending
                  </span>
                ) : null}
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-2 rounded-full bg-brand-primary transition-all"
                  style={{
                    width: `${Math.round(
                      embeddedPollsSorted.length > 0
                        ? (embeddedCompletedCount / embeddedPollsSorted.length) * 100
                        : 0
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {embeddedPollsSorted.map((poll) => {
                  const draft = embeddedVoteDrafts[poll.id] || {};
                  const hasSubmitted = hasSubmittedEmbeddedVote(poll, embeddedMyVotes[poll.id]);
                  const myVote = embeddedMyVotes[poll.id] || null;
                  const pollVotes = embeddedVotesByPoll[poll.id] || [];
                  const pollSubmittedVotes = pollVotes.filter((voteDoc) =>
                    hasSubmittedEmbeddedVote(poll, voteDoc)
                  );
                  const embeddedFinalResults = poll?.finalResults || null;
                  const canVoteEmbedded = canVoteEmbeddedPoll(poll);
                  const lifecycleBusy = embeddedLifecycleBusyByPoll[poll.id] === true;
                  const cardBusy =
                    embeddedSubmittingByPoll[poll.id] ||
                    embeddedClearingByPoll[poll.id] ||
                    lifecycleBusy;
                  const voteCount =
                    !canVoteEmbedded && Number.isFinite(embeddedFinalResults?.voterCount)
                      ? embeddedFinalResults.voterCount
                      : embeddedPollVoteCounts[poll.id] || 0;
                  const eligibleUsers = participants.filter((participant) => participant?.email);
                  const votedIdSet = new Set(
                    pollSubmittedVotes
                      .map((voteDoc) => String(voteDoc?.id || "").trim())
                      .filter(Boolean)
                  );
                  const votedUsers = eligibleUsers.filter((participant) =>
                    votedIdSet.has(String(participant.id || ""))
                  );
                  const pendingUsers = eligibleUsers.filter(
                    (participant) => !votedIdSet.has(String(participant.id || ""))
                  );

                  return (
                    <BasicPollVotingCard
                      key={poll.id}
                      poll={poll}
                      participantCount={participantCount}
                      voteCount={voteCount}
                      hasSubmitted={hasSubmitted}
                      myVote={myVote}
                      draft={draft}
                      canVote={canVoteEmbedded}
                      cardBusy={cardBusy}
                      voteError={embeddedVoteErrors[poll.id] || null}
                      isCreator={isCreator}
                      lifecycleBusy={lifecycleBusy}
                      submittedVotes={pollSubmittedVotes}
                      canBreakTie={isCreator}
                      tieBreakBusy={lifecycleBusy}
                      isHighlighted={highlightedEmbeddedPollId === poll.id}
                      parentCancelled={scheduler.data?.status === "CANCELLED"}
                      onSetRef={(node) => {
                        if (node) {
                          embeddedPollCardRefs.current[poll.id] = node;
                        } else {
                          delete embeddedPollCardRefs.current[poll.id];
                        }
                      }}
                      onMoveRankedOption={(optionId, direction) =>
                        moveEmbeddedRankedOption(poll.id, optionId, direction)
                      }
                      onAddRankedOption={(optionId) => addEmbeddedRankedOption(poll.id, optionId)}
                      onRemoveRankedOption={(optionId) =>
                        removeEmbeddedRankedOption(poll.id, optionId)
                      }
                      onSelectOption={(optionId) => setEmbeddedMultipleChoiceSelection(poll, optionId)}
                      onChangeOtherText={(value) => setEmbeddedOtherText(poll.id, value)}
                      onSubmitVote={() => submitEmbeddedPollVote(poll)}
                      onClearVote={() => clearEmbeddedPollVote(poll)}
                      eligibleUsers={eligibleUsers}
                      votedUsers={votedUsers}
                      pendingUsers={pendingUsers}
                      onFinalizePoll={() => finalizeEmbeddedPollIndividually(poll)}
                      onReopenPoll={() => reopenEmbeddedPollIndividually(poll)}
                      onBreakTie={(method) => breakEmbeddedPollTieIndividually(poll, method)}
                      onViewOptionNote={(pollTitle, option) =>
                        openEmbeddedOptionNoteViewer(pollTitle, option)
                      }
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isLocked}
              className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {isLocked ? "Voting closed" : saving ? "Saving..." : "Submit votes"}
            </button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              You can come back and edit your votes anytime before finalization.
            </p>
          </div>
        </div>

      <PollOptionNoteDialog
        noteViewer={embeddedOptionNoteViewer}
        onClose={() => setEmbeddedOptionNoteViewer(null)}
      />

      <VoteDialog
        open={Boolean(modalDate)}
        onOpenChange={(open) => {
          if (!open) setModalDate(null);
        }}
        modalDate={modalDate}
        slots={slotsForModal}
        displayTimeZone={displayTimeZone}
        showTimeZone={showTimeZone}
        noTimesWork={noTimesWork}
        canVote={canVote}
        onToggleNoTimesWork={toggleNoTimesWork}
        draftVotes={draftVotes}
        pastSlotIds={pastSlotIds}
        blockersBySlotId={userBlockersBySlotId}
        blockerTitleBySchedulerId={Object.fromEntries(
          Object.entries(blockingSchedulersById || {}).map(([id, data]) => [id, data?.title || null])
        )}
        onNavigateToSchedulerId={(schedulerId) => navigate(`/scheduler/${schedulerId}`)}
        onSetVote={setVote}
      />

      <CopyVotesDialog
        open={copyVotesOpen}
        onOpenChange={setCopyVotesOpen}
        sourceSchedulerId={id}
        sourceTitle={scheduler.data?.title || "Session Poll"}
        sourceSlots={slots.data}
        sourceVoteDoc={userVote.data || null}
        sourceTimeZone={scheduler.data?.timezone || null}
        userSettings={settings || null}
      />

      <PendingVotesDialog
        open={pendingVotesOpen}
        onOpenChange={setPendingVotesOpen}
        busy={pendingFinalizeBusy}
        onDiscard={discardVotesThenFinalize}
        onSubmit={submitVotesThenFinalize}
      />

      <RequiredEmbeddedFinalizeWarningDialog
        open={requiredFinalizeWarningOpen}
        onOpenChange={setRequiredFinalizeWarningOpen}
        pollSummaries={requiredFinalizeSummary}
        busy={requiredFinalizeChecking}
        onContinue={continueFinalizeWithMissingRequired}
      />

      <FinalizeEmbeddedPollsChoiceDialog
        open={finalizeEmbeddedChoiceOpen}
        onOpenChange={setFinalizeEmbeddedChoiceOpen}
        unfinalizedCount={unfinalizedEmbeddedPollCount}
        onFinalizeAll={continueFinalizeAndFinalizeEmbeddedPolls}
        onFinalizeSessionOnly={continueFinalizeWithoutFinalizingEmbeddedPolls}
      />

      <FinalizeDialog
        open={finalizeOpen}
        onOpenChange={(open) => {
          setFinalizeOpen(open);
          if (!open) {
            setFinalizeOutstandingEmbeddedPolls(false);
          }
        }}
        saving={saving}
        createCalendarEvent={createCalendarEvent}
        onToggleCreateCalendarEvent={setCreateCalendarEvent}
        linkedCalendars={linkedCalendars}
        selectedCalendarId={selectedCalendarId}
        onSelectCalendarId={setSelectedCalendarId}
        eventTitle={eventTitle}
        onChangeEventTitle={setEventTitle}
        eventDescription={eventDescription}
        onChangeEventDescription={setEventDescription}
        eventDuration={eventDuration}
        onChangeEventDuration={setEventDuration}
        eventAttendees={eventAttendees}
        onChangeEventAttendees={setEventAttendees}
        deleteOldEvent={deleteOldEvent}
        onToggleDeleteOldEvent={setDeleteOldEvent}
        hasExistingEvent={Boolean(scheduler.data?.googleEventId)}
        onOpenSettings={() => navigate("/settings")}
        onFinalize={handleFinalize}
      />

      <CloneDialog
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        cloneTitle={cloneTitle}
        onChangeCloneTitle={setCloneTitle}
        cloneGroupId={cloneGroupId}
        onChangeGroupId={(value) => setCloneGroupId(value === "none" ? null : value)}
        groupOptions={cloneGroupOptions}
        includedUser={
          scheduler.data?.creatorEmail
            ? participantMapByEmail.get(normalizeEmail(scheduler.data.creatorEmail)) || {
                email: scheduler.data.creatorEmail,
              }
            : null
        }
        groupName={cloneSelectedGroup?.name || null}
        groupColor={cloneGroupColor || null}
        groupMembers={cloneGroupUsers}
        inviteUsers={cloneInviteUsers}
        onRemoveInvite={removeCloneInvite}
        inviteEmptyLabel="No additional invitees yet."
        recommendedUsers={cloneRecommendedUsers}
        onAddInvite={addCloneInvite}
        inputValue={cloneInviteInput}
        onInputChange={setCloneInviteInput}
        onAddInput={() => addCloneInvite(cloneInviteInput)}
        inviteError={cloneInviteError}
        cloneClearVotes={cloneClearVotes}
        onToggleClearVotes={setCloneClearVotes}
        onClone={handleClone}
        saving={cloneSaving}
      />

      <ReopenDialog
        open={reopenOpen}
        onOpenChange={(open) => {
          setReopenOpen(open);
          if (open) {
            setReopenUpdateCalendar(false);
          }
        }}
        saving={saving}
        hasExistingEvent={Boolean(scheduler.data?.googleEventId)}
        updateCalendar={reopenUpdateCalendar}
        onToggleUpdateCalendar={setReopenUpdateCalendar}
        onConfirm={confirmReopen}
      />

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={scheduler.data?.title || "Untitled poll"}
        saving={cancelSaving}
        onCancelSession={handleCancelSession}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (open) {
            setDeleteUpdateCalendar(false);
          }
        }}
        title={scheduler.data?.title || "Untitled poll"}
        participantCount={participantCount}
        slotCount={slots.data?.length || 0}
        voteCount={voteCount}
        hasExistingEvent={Boolean(scheduler.data?.googleEventId)}
        updateCalendar={deleteUpdateCalendar}
        onToggleUpdateCalendar={setDeleteUpdateCalendar}
        onDelete={handleDelete}
        saving={deleteSaving}
      />

      <InvitePromptDialog
        open={invitePromptOpen || isPendingInvite}
        onOpenChange={setInvitePromptOpen}
        isPendingInvite={isPendingInvite}
        inviterProfile={inviterProfile}
        busy={invitePromptBusy}
        onDecline={handleDeclineInvite}
        onAccept={handleAcceptInvite}
      />

      <LeaveDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        onLeave={handleLeavePoll}
        saving={leaveSaving}
      />

      <RemoveParticipantDialog
        open={removeMemberOpen}
        onOpenChange={setRemoveMemberOpen}
        memberLabel={
          memberToRemove ? (
            <UserIdentity
              user={
                memberToRemove.email
                  ? participantMapByEmail.get(normalizeEmail(memberToRemove.email)) ||
                    memberToRemove
                  : memberToRemove
              }
            />
          ) : null
        }
        onRemove={handleRemoveParticipant}
        disabled={!memberToRemove}
      />

      <RevokeInviteDialog
        open={revokeInviteOpen}
        onOpenChange={setRevokeInviteOpen}
        inviteeEmail={inviteToRevoke}
        onRevoke={handleRevokeInvite}
        disabled={!inviteToRevoke}
      />
    </>
  );
}
