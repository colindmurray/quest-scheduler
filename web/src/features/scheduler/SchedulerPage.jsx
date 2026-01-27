import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, isSameDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { MoreVertical, Pencil, Copy, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { useUserSettings } from "../../hooks/useUserSettings";
import { useFriends } from "../../hooks/useFriends";
import { useQuestingGroups } from "../../hooks/useQuestingGroups";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection";
import { useFirestoreDoc } from "../../hooks/useFirestoreDoc";
import { useNotifications } from "../../hooks/useNotifications";
import { useUserProfiles } from "../../hooks/useUserProfiles";
import { db } from "../../lib/firebase";
import { schedulerSlotsRef, schedulerVotesRef } from "../../lib/data/schedulers";
import { Switch } from "../../components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  AvatarBubble,
  AvatarStack,
  buildColorMap,
  uniqueUsers,
} from "../../components/ui/voter-avatars";
import { UserAvatar } from "../../components/ui/avatar";
import { LoadingState } from "../../components/ui/spinner";
import { isValidEmail } from "../../lib/utils";
import { createVoteSubmittedNotification, pollInviteNotificationId } from "../../lib/data/notifications";
import { createSessionFinalizedNotification } from "../../lib/data/notifications";
import { findUserIdByEmail } from "../../lib/data/users";
import { acceptPollInvite, declinePollInvite, removeParticipantFromPoll, revokePollInvite } from "../../lib/data/pollInvites";
import { createEmailMessage } from "../../lib/emailTemplates";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

function VoteToggle({ checked, disabled, onChange }) {
  return <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />;
}

export default function SchedulerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const schedulerRef = useMemo(
    () => (id ? doc(db, "schedulers", id) : null),
    [id]
  );
  const { settings, archivePoll, unarchivePoll, isArchived } = useUserSettings();
  const { friends } = useFriends();
  const { getGroupColor, groups } = useQuestingGroups();
  const { removeLocal: removeNotification } = useNotifications();
  const scheduler = useFirestoreDoc(schedulerRef);
  const creatorRef = useMemo(
    () =>
      scheduler.data?.creatorId ? doc(db, "users", scheduler.data.creatorId) : null,
    [scheduler.data?.creatorId]
  );
  const creator = useFirestoreDoc(creatorRef);
  const questingGroupRef = useMemo(
    () => (scheduler.data?.questingGroupId ? doc(db, "questingGroups", scheduler.data.questingGroupId) : null),
    [scheduler.data?.questingGroupId]
  );
  const questingGroup = useFirestoreDoc(questingGroupRef);
  const slotsRef = useMemo(
    () => (id ? schedulerSlotsRef(id) : null),
    [id]
  );
  const votesRef = useMemo(
    () => (id ? schedulerVotesRef(id) : null),
    [id]
  );
  const userVoteRef = useMemo(
    () => (id && user ? doc(db, "schedulers", id, "votes", user.uid) : null),
    [id, user]
  );
  const slots = useFirestoreCollection(slotsRef);
  const allVotes = useFirestoreCollection(votesRef);
  const userVote = useFirestoreDoc(userVoteRef);
  const [view, setView] = useState("list");
  const [draftVotes, setDraftVotes] = useState({});
  const [saving, setSaving] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [sortMode, setSortMode] = useState("preferred");
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
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneTitle, setCloneTitle] = useState("");
  const [cloneInvites, setCloneInvites] = useState([]);
  const [cloneInviteInput, setCloneInviteInput] = useState("");
  const [cloneInviteError, setCloneInviteError] = useState(null);
  const [cloneSaving, setCloneSaving] = useState(false);
  const [cloneClearVotes, setCloneClearVotes] = useState(false);
  const [cloneGroupId, setCloneGroupId] = useState(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteUpdateCalendar, setDeleteUpdateCalendar] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenUpdateCalendar, setReopenUpdateCalendar] = useState(false);
  const [invitePromptOpen, setInvitePromptOpen] = useState(false);
  const [invitePromptBusy, setInvitePromptBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [removeMemberOpen, setRemoveMemberOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [revokeInviteOpen, setRevokeInviteOpen] = useState(false);
  const [inviteToRevoke, setInviteToRevoke] = useState(null);
  const isLocked = scheduler.data?.status !== "OPEN";
  const isPollArchived = isArchived(id);
  const isCreator = scheduler.data?.creatorId === user?.uid;
  const normalizeEmail = (value) => value.trim().toLowerCase();
  const normalizedUserEmail = user?.email?.toLowerCase() || null;
  const isGroupMember = Boolean(
    normalizedUserEmail &&
      scheduler.data?.questingGroupId &&
      questingGroup.data?.members?.some(
        (email) => normalizeEmail(email) === normalizedUserEmail
      )
  );
  const isExplicitParticipant = useMemo(
    () =>
      scheduler.data?.participants?.some(
        (email) => normalizedUserEmail && email?.toLowerCase() === normalizedUserEmail
      ) || false,
    [scheduler.data?.participants, normalizedUserEmail]
  );
  const isEffectiveParticipant = isExplicitParticipant || isGroupMember;
  const [calendarView, setCalendarView] = useState("month");
  const [expandedSlots, setExpandedSlots] = useState({});
  const questingGroupMembers = useMemo(
    () =>
      (questingGroup.data?.members || [])
        .filter(Boolean)
        .map((email) => normalizeEmail(email)),
    [questingGroup.data?.members]
  );
  const questingGroupMemberSet = useMemo(
    () => new Set(questingGroupMembers),
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
        members: questingGroup.data?.members || [],
      };
    }
    return {
      id: cloneGroupId,
      name: scheduler.data?.questingGroupName || "Questing group",
      members: [],
    };
  }, [cloneGroupId, groups, questingGroup.data, scheduler.data?.questingGroupId, scheduler.data?.questingGroupName]);
  const cloneGroupMembers = useMemo(
    () => (cloneSelectedGroup?.members || []).filter(Boolean),
    [cloneSelectedGroup]
  );
  const cloneGroupMemberEmails = useMemo(
    () => cloneGroupMembers.map((email) => normalizeEmail(email)),
    [cloneGroupMembers]
  );
  const cloneGroupMemberSet = useMemo(
    () => new Set(cloneGroupMemberEmails),
    [cloneGroupMemberEmails]
  );
  const cloneGroupColor = useMemo(
    () => (cloneSelectedGroup?.id ? getGroupColor(cloneSelectedGroup.id) : null),
    [cloneSelectedGroup?.id, getGroupColor]
  );
  const profileEmails = useMemo(() => {
    const combined = new Set(
      [...questingGroupMembers, ...cloneGroupMemberEmails]
        .filter(Boolean)
        .map((email) => normalizeEmail(email))
    );
    return Array.from(combined);
  }, [questingGroupMembers, cloneGroupMemberEmails]);
  const { enrichUsers } = useUserProfiles(profileEmails);
  const groupUsers = useMemo(
    () => enrichUsers(questingGroupMembers),
    [enrichUsers, questingGroupMembers]
  );
  const cloneGroupUsers = useMemo(
    () => enrichUsers(cloneGroupMembers),
    [enrichUsers, cloneGroupMembers]
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
  const cloneInviteSet = useMemo(
    () => new Set(cloneInvites.map((email) => normalizeEmail(email))),
    [cloneInvites]
  );
  const cloneRecommendedEmails = useMemo(() => {
    const userEmail = user?.email ? normalizeEmail(user.email) : null;
    return friends
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
      .filter((email) => email !== userEmail)
      .filter((email) => !cloneInviteSet.has(email))
      .filter((email) => !cloneGroupMemberSet.has(email));
  }, [friends, cloneInviteSet, cloneGroupMemberSet, user?.email]);

  useEffect(() => {
    if (!cloneGroupId) return;
    setCloneInvites((prev) =>
      prev.filter((email) => !cloneGroupMemberSet.has(normalizeEmail(email)))
    );
  }, [cloneGroupId, cloneGroupMemberSet]);

  useEffect(() => {
    if (!scheduler.data || !user?.email || !id) return;
    if (isCreator) return;
    const normalizedEmail = user.email.toLowerCase();
    const participantMatch = scheduler.data.participants?.some(
      (email) => email?.toLowerCase() === normalizedEmail
    );
    const isPendingInvite = scheduler.data.pendingInvites?.some(
      (email) => email?.toLowerCase() === normalizedEmail
    );
    if (participantMatch || isGroupMember) {
      setInvitePromptOpen(false);
      return;
    }
    if (scheduler.data.allowLinkSharing || isPendingInvite) {
      setInvitePromptOpen(true);
    } else {
      setInvitePromptOpen(false);
    }
  }, [id, scheduler.data, user?.email, isCreator]);

  useEffect(() => {
    if (!userVote.data) return;
    setDraftVotes(userVote.data.votes || {});
    setNoTimesWork(Boolean(userVote.data.noTimesWork));
  }, [userVote.data]);

  const tallies = useMemo(() => {
    const map = {};
    allVotes.data.forEach((voteDoc) => {
      if (voteDoc.noTimesWork) return;
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
  }, [allVotes.data]);

  const slotVoters = useMemo(() => {
    const map = {};
    allVotes.data.forEach((voteDoc) => {
      if (!voteDoc?.userEmail) return;
      if (voteDoc.noTimesWork) return;
      const userInfo = {
        email: voteDoc.userEmail,
        avatar: voteDoc.userAvatar,
        source: voteDoc.source || voteDoc.lastVotedFrom || "web",
      };
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
  }, [allVotes.data]);

  const explicitParticipantEmails = useMemo(
    () => scheduler.data?.participants || [],
    [scheduler.data?.participants]
  );
  const participantEmails = useMemo(() => {
    const merged = new Set([
      ...explicitParticipantEmails,
      ...questingGroupMembers,
    ]);
    return Array.from(merged);
  }, [explicitParticipantEmails, questingGroupMembers]);
  const pendingInviteEmails = useMemo(
    () => scheduler.data?.pendingInvites || [],
    [scheduler.data?.pendingInvites]
  );
  const voterEmails = useMemo(
    () => allVotes.data.map((voteDoc) => voteDoc.userEmail).filter(Boolean),
    [allVotes.data]
  );
  const uniqueEmails = useMemo(() => {
    const set = new Set([...(participantEmails || []), ...(voterEmails || [])]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [participantEmails, voterEmails]);
  const colorMap = useMemo(() => buildColorMap(uniqueEmails), [uniqueEmails]);
  const participants = useMemo(() => {
    const voteMap = new Map(
      allVotes.data
        .filter((voteDoc) => voteDoc.userEmail)
        .map((voteDoc) => [voteDoc.userEmail, voteDoc])
    );
    return participantEmails.map((email) => ({
      email,
      avatar: voteMap.get(email)?.userAvatar || null,
      hasVoted: voteMap.has(email),
      isGroupMember: questingGroupMemberSet.has(normalizeEmail(email)),
    }));
  }, [allVotes.data, participantEmails, questingGroupMemberSet]);
  const nonGroupParticipants = useMemo(
    () => participants.filter((participant) => !participant.isGroupMember),
    [participants]
  );
  const participantMap = useMemo(
    () => new Map(participants.map((participant) => [normalizeEmail(participant.email), participant])),
    [participants]
  );
  const groupUsersWithStatus = useMemo(
    () =>
      groupUsers.map((member) => {
        const match = participantMap.get(normalizeEmail(member.email));
        return {
          ...member,
          hasVoted: match?.hasVoted ?? false,
        };
      }),
    [groupUsers, participantMap]
  );

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

  const calendarEvents = useMemo(() => {
    return slots.data.map((slot) => {
      const start = slot.start ? new Date(slot.start) : new Date();
      const end = slot.end ? new Date(slot.end) : start;
      const counts = tallies[slot.id] || { feasible: 0, preferred: 0 };
      const voters = slotVoters[slot.id] || { preferred: [], feasible: [] };
      return {
        id: slot.id,
        start,
        end,
        timeLabel: format(start, "h:mm a"),
        preferredCount: counts.preferred,
        feasibleCount: counts.feasible,
        preferredVoters: voters.preferred,
        feasibleVoters: voters.feasible,
      };
    });
  }, [slots.data, tallies, slotVoters]);

  const slotsForModal = useMemo(() => {
    if (!modalDate) return [];
    const sameDay = slots.data.filter((slot) => {
      if (!slot.start) return false;
      return isSameDay(new Date(slot.start), modalDate);
    });
    return sameDay.sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [modalDate, slots.data]);

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

  const handleAcceptInvite = async () => {
    if (!id || !user?.email) return;
    setInvitePromptBusy(true);
    try {
      await acceptPollInvite(id, user.email, user.uid);
      removeNotification(pollInviteNotificationId(id));
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
        removeNotification(pollInviteNotificationId(id));
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
      await removeParticipantFromPoll(id, user.email, true, false);
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
    if (questingGroupMemberSet.has(normalizeEmail(memberToRemove))) {
      toast.error("Questing group members cannot be removed from this poll.");
      return;
    }
    try {
      await removeParticipantFromPoll(id, memberToRemove, true, true);
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

  const AvatarBubbleWithColors = ({ email, avatar, size = 24 }) => (
    <AvatarBubble email={email} avatar={avatar} size={size} colorMap={colorMap} />
  );

  const AvatarStackWithColors = ({ users, max = 4, size = 20 }) => (
    <AvatarStack users={users} max={max} size={size} colorMap={colorMap} />
  );

  const EventCell = ({ event }) => {
    const preferredCount = event.preferredCount ?? 0;
    const feasibleCount = event.feasibleCount ?? 0;
    const durationMinutes = event.end && event.start ? Math.max(0, Math.round((event.end - event.start) / 60000)) : 0;
    const rangeLabel =
      event.start && event.end
        ? `${format(event.start, "h:mm a")} - ${format(event.end, "h:mm a")}`
        : event.timeLabel;

    if (calendarView === "month") {
      return (
        <div className="space-y-1">
          <div className="text-xs font-semibold">{event.timeLabel}</div>
          <div className="flex items-center gap-1 text-[10px] text-white/90">
            <span>★ {preferredCount}</span>
            <span className="text-white/70">·</span>
            <span>✓ {feasibleCount}</span>
          </div>
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
    if (!isParticipant) {
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

  const addCloneInvite = (email) => {
    const normalized = normalizeEmail(email);
    if (!normalized) return;
    if (!isValidEmail(normalized)) {
      setCloneInviteError("Enter a valid email address.");
      return;
    }
    if (scheduler.data?.creatorEmail && normalized === normalizeEmail(scheduler.data.creatorEmail)) {
      setCloneInviteError("You are already included as a participant.");
      return;
    }
    if (cloneGroupMemberSet.has(normalized)) {
      setCloneInviteError("That email is already included via the questing group.");
      return;
    }
    if (cloneInvites.includes(normalized)) {
      setCloneInviteError("That email is already invited.");
      return;
    }
    setCloneInvites((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setCloneInviteInput("");
    setCloneInviteError(null);
  };

  const removeCloneInvite = (email) => {
    setCloneInvites((prev) => prev.filter((item) => item !== email));
  };

  const handleSave = async () => {
    if (!user || !userVoteRef) return;
    if (!isParticipant) {
      toast.error("Accept the invite to vote on this poll.");
      return false;
    }
    setSaving(true);
    let success = false;
    try {
      await setDoc(
        userVoteRef,
        {
          userEmail: user.email,
          userAvatar: user.photoURL,
          votes: noTimesWork ? {} : draftVotes,
          noTimesWork,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const notifyCreator = creator.data?.settings?.emailNotifications;
      const recipient = scheduler.data?.creatorEmail;
      if (recipient && user.email?.toLowerCase() !== recipient.toLowerCase()) {
        try {
          if (notifyCreator) {
            await setDoc(doc(collection(db, "mail")), {
              to: recipient,
              message: createEmailMessage({
                subject: "New vote submitted",
                title: "New Vote Submitted",
                intro: `${user.email} updated votes for "${scheduler.data?.title || "your session poll"}".`,
                ctaLabel: "View poll",
                ctaUrl: window.location.href,
              }),
            });
          }
          if (scheduler.data?.creatorId) {
            await createVoteSubmittedNotification(scheduler.data.creatorId, {
              schedulerId: id,
              schedulerTitle: scheduler.data?.title || "Session Poll",
              voterEmail: user.email,
            });
          }
        } catch (notifyErr) {
          console.error("Failed to notify creator about vote:", notifyErr);
        }
      }
      toast.success("Votes saved successfully");
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
    const slot = slots.data.find((item) => item.id === slotId);
    const duration = slot?.start && slot?.end ? Math.round((new Date(slot.end) - new Date(slot.start)) / 60000) : 240;
    setFinalizeSlotId(slotId);
    setEventTitle(settings?.defaultTitle || scheduler.data?.title || "Quest Session");
    setEventDescription(settings?.defaultDescription || "");
    setEventDuration(duration || settings?.defaultDurationMinutes || 240);
    setEventAttendees((scheduler.data?.participants || []).join(", "));
    setSelectedCalendarId(linkedCalendarId);
    setCreateCalendarEvent(Boolean(linkedCalendars.length));
    setDeleteOldEvent(true);
    setFinalizeOpen(true);
  };

  const requestFinalize = (slotId) => {
    if (isLocked) return;
    if (pastSlotIds.has(slotId)) return;
    if (isCreator && hasPendingVotes) {
      setPendingFinalizeSlotId(slotId);
      setPendingVotesOpen(true);
      return;
    }
    openFinalize(slotId);
  };

  const submitVotesThenFinalize = async () => {
    if (!pendingFinalizeSlotId || !userVoteRef) return;
    setPendingFinalizeBusy(true);
    try {
      const saved = await handleSave();
      if (saved) {
        setPendingVotesOpen(false);
        openFinalize(pendingFinalizeSlotId);
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
      await setDoc(
        userVoteRef,
        {
          userEmail: user.email,
          userAvatar: user.photoURL,
          votes: {},
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setDraftVotes({});
      setPendingVotesOpen(false);
      openFinalize(pendingFinalizeSlotId);
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
    if (!finalizeSlotId || !schedulerRef) return;
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
      const uniqueEmails = new Set(parsedEmails.map((email) => email.toLowerCase()));
      if (creatorEmail && !uniqueEmails.has(creatorEmail.toLowerCase())) {
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
        attendees: Array.from(new Set(parsedEmails.map((email) => email.toLowerCase()))),
        deleteOldEvent,
        createCalendarEvent: shouldCreateEvent,
      });

      const participantEmails = (scheduler.data?.participants || []).filter(Boolean);
      if (participantEmails.length > 0) {
        try {
          const uniqueEmails = Array.from(
            new Set(participantEmails.map((email) => email.toLowerCase()))
          );
          const normalizedCreatorEmail = creatorEmail?.toLowerCase() || null;
          const chunks = [];
          for (let i = 0; i < uniqueEmails.length; i += 10) {
            chunks.push(uniqueEmails.slice(i, i + 10));
          }
          const optOuts = new Set();
          const userIdsByEmail = new Map();
          for (const chunk of chunks) {
            const snapshot = await getDocs(
              query(collection(db, "usersPublic"), where("email", "in", chunk))
            );
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              if (data?.email && data?.emailNotifications === false) {
                optOuts.add(data.email.toLowerCase());
              }
              if (data?.email) {
                userIdsByEmail.set(data.email.toLowerCase(), docSnap.id);
              }
            });
          }
          const timezone =
            scheduler.data?.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone;
          const rangeLabel = `${formatInTimeZone(
            start,
            timezone,
            "MMM d, yyyy · h:mm a"
          )} - ${formatInTimeZone(slotEnd, timezone, "h:mm a")}`;
          const winningLabel = `${rangeLabel} (${timezone})`;
          const recipients = uniqueEmails.filter(
            (email) => email !== normalizedCreatorEmail && !optOuts.has(email)
          );
          const notificationRecipients = uniqueEmails.filter(
            (email) => email !== normalizedCreatorEmail
          );
          await Promise.all(
            notificationRecipients.map((email) => {
              const userId = userIdsByEmail.get(email);
              if (!userId) return null;
              return createSessionFinalizedNotification(userId, {
                schedulerId: id,
                schedulerTitle: scheduler.data?.title || "Session Poll",
                winningDate: winningLabel,
              });
            })
          );
          await Promise.all(
            recipients.map((email) =>
              setDoc(doc(collection(db, "mail")), {
                to: email,
                message: createEmailMessage({
                  subject: `Session poll finalized: ${scheduler.data?.title || "Session Poll"}`,
                  title: "Session Poll Finalized",
                  intro: `A winning time was selected for "${scheduler.data?.title || "this session poll"}".`,
                  ctaLabel: "View poll",
                  ctaUrl: window.location.href,
                  extraLines: [`Winning time: ${winningLabel}`],
                }),
              })
            )
          );
        } catch (notifyErr) {
          console.error("Failed to send finalization emails:", notifyErr);
        }
      }
      setFinalizeOpen(false);
      toast.success(
        shouldCreateEvent
          ? "Session finalized and calendar event created"
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
    if (!schedulerRef) return;
    setSaving(true);
    let success = false;
    try {
      if (updateCalendar && scheduler.data?.googleEventId) {
        await deleteCalendarEntry();
      }
      await updateDoc(schedulerRef, {
        status: "OPEN",
        winningSlotId: null,
      });
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
    const participants = scheduler.data.participants || [];

    // If user is the original creator, exclude themselves from invites
    // If user is NOT the original creator, they become the new owner:
    //   - exclude themselves from invites
    //   - add original creator to invites
    const normalizedUser = normalizeEmail(user.email);
    const baseInvites = participants
      .filter(Boolean)
      .map((email) => normalizeEmail(email))
      .filter((email) => email !== normalizedUser);
    const groupMemberSet = scheduler.data?.questingGroupId
      ? questingGroupMemberSet
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
      const participants = Array.from(
        new Set([newCreatorEmail, ...cloneInvites].filter(Boolean).map((e) => e.toLowerCase()))
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
      const newRef = doc(db, "schedulers", newId);
      await setDoc(newRef, {
        title: cloneTitle || `${scheduler.data.title || "Untitled poll"} (copy)`,
        creatorId: newCreatorId,
        creatorEmail: newCreatorEmail,
        status: "OPEN",
        participants,
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
        setDoc(doc(db, "schedulers", newId, "slots", slot.id), {
          start: slot.start,
          end: slot.end,
          stats: { feasible: 0, preferred: 0 },
        })
      );
      await Promise.all(slotWrites);

      if (!cloneClearVotes) {
        const validSlotIds = new Set(futureSlots.map((slot) => slot.id));
        const participantSet = new Set(participants.map((email) => email.toLowerCase()));
        await Promise.all(
          allVotes.data.map((voteDoc) => {
            if (voteDoc.id !== user.uid) {
              return Promise.resolve();
            }
            if (!voteDoc.userEmail) return Promise.resolve();
            if (!participantSet.has(voteDoc.userEmail.toLowerCase())) {
              return Promise.resolve();
            }
            const nextVotes = Object.fromEntries(
              Object.entries(voteDoc.votes || {}).filter(([slotId]) =>
                validSlotIds.has(slotId)
              )
            );
            if (Object.keys(nextVotes).length === 0 && !voteDoc.noTimesWork) {
              return Promise.resolve();
            }
            return setDoc(
              doc(db, "schedulers", newId, "votes", voteDoc.id),
              {
                userEmail: voteDoc.userEmail,
                userAvatar: voteDoc.userAvatar,
                votes: nextVotes,
                noTimesWork: Boolean(voteDoc.noTimesWork),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
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

  const handleDelete = async () => {
    if (!schedulerRef || !id) return;
    setDeleteSaving(true);
    try {
      if (deleteUpdateCalendar && scheduler.data?.googleEventId) {
        await deleteCalendarEntry();
      }
      // Delete all slots
      const slotsSnap = await getDocs(collection(db, "schedulers", id, "slots"));
      await Promise.all(slotsSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)));

      // Delete all votes
      const votesSnap = await getDocs(collection(db, "schedulers", id, "votes"));
      await Promise.all(votesSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)));

      // Delete the scheduler document
      await deleteDoc(schedulerRef);

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

  const isParticipant = isEffectiveParticipant;
  const isPendingInvite = scheduler.data.pendingInvites?.some(
    (email) => normalizedUserEmail && email?.toLowerCase() === normalizedUserEmail
  );
  const canVote = Boolean(isParticipant && !isLocked);
  const pendingInviteMeta =
    (normalizedUserEmail && scheduler.data.pendingInviteMeta?.[normalizedUserEmail]) || {};
  const inviterLabel = pendingInviteMeta.invitedByEmail || scheduler.data.creatorEmail || "someone";
  const canAccess =
    isCreator ||
    scheduler.data.allowLinkSharing ||
    isParticipant ||
    isPendingInvite;
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
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {participantEmails.length} participants
                </p>
                {scheduler.data.status === "OPEN" && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    Open
                  </span>
                )}
                {scheduler.data.status === "FINALIZED" && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                    Finalized
                  </span>
                )}
                {isPollArchived && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Archived
                  </span>
                )}
              </div>
              {discordStatus && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                    {discordStatus}
                  </span>
                  {discordMessageUrl && (
                    <a
                      href={discordMessageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      View in Discord
                    </a>
                  )}
                </div>
              )}
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
                {isExplicitParticipant && !isCreator && (
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

          {/* View toggle - moved here */}
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

          <div className="mt-6 rounded-3xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Participants</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {participants.length} total · {voterEmails.length} voted
                </p>
              </div>
              <AvatarStackWithColors
                users={participants.map((participant) => ({
                  email: participant.email,
                  avatar: participant.avatar,
                }))}
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
                      <AvatarBubbleWithColors email={member.email} avatar={member.avatar} size={22} />
                      <span className="text-xs">{member.email}</span>
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
                  <AvatarBubbleWithColors email={participant.email} avatar={participant.avatar} size={18} />
                  <span className="text-slate-700 dark:text-slate-200">{participant.email}</span>
                  <span
                    className={`text-[10px] font-semibold ${
                      participant.hasVoted
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {participant.hasVoted ? "Voted" : "Pending"}
                  </span>
                  {isCreator &&
                    participant.email?.toLowerCase() !== scheduler.data.creatorEmail?.toLowerCase() &&
                    !participant.isGroupMember && (
                    <button
                      type="button"
                      onClick={() => {
                        setMemberToRemove(participant.email);
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
            {pendingInviteEmails.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Pending invites
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pendingInviteEmails.map((email) => (
                    <div
                      key={email}
                      className="flex items-center gap-2 rounded-full border border-dashed border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                    >
                      <span>{email}</span>
                      {isCreator && (
                        <button
                          type="button"
                          onClick={() => {
                            setInviteToRevoke(email);
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

          {view === "calendar" && (
            <div className="mt-6 rounded-3xl border border-slate-200/70 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <Calendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                selectable
                scrollToTime={new Date(1970, 0, 1, 8, 0)}
                views={["month", "week", "day"]}
                view={calendarView}
                onView={(nextView) => setCalendarView(nextView)}
                onSelectSlot={(slotInfo) => setModalDate(slotInfo.start)}
                onSelectEvent={(event) => setModalDate(event.start)}
                components={{ event: EventCell }}
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
                return (
                  <div
                    key={slot.id}
                    className={`grid gap-3 rounded-2xl border px-4 py-3 md:grid-cols-[1.4fr_1fr_1fr_auto] ${
                      pastSlotIds.has(slot.id)
                        ? "border-red-300 bg-red-50/60 dark:border-red-700 dark:bg-red-900/20"
                        : "border-slate-200/70 dark:border-slate-700"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {startDate ? format(startDate, "EEE, MMM d, yyyy · h:mm a") : "Slot"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Preferred {counts.preferred} · Feasible {counts.feasible}
                      </p>
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold">Preferred</span>
                          <AvatarStackWithColors users={voters.preferred} max={4} size={20} />
                          <span className="text-slate-400 dark:text-slate-500">
                            {counts.preferred}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold">Feasible</span>
                          <AvatarStackWithColors users={voters.feasible} max={4} size={20} />
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
                </p>
              </div>
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
            </div>
            <div className="mt-4 space-y-3">
              {sortedSlots.map((slot) => {
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
                            ? `${format(startDate, "EEE, MMM d, yyyy · h:mm a")}${
                                endDate ? ` - ${format(endDate, "h:mm a")}` : ""
                              }`
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
                              disabled={isLocked || isPast}
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
                                  <AvatarBubbleWithColors email={voter.email} avatar={voter.avatar} size={20} />
                                  <span className="text-slate-700 dark:text-slate-200">
                                    {voter.email}
                                  </span>
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
                                  <AvatarBubbleWithColors email={voter.email} avatar={voter.avatar} size={20} />
                                  <span className="text-slate-700 dark:text-slate-200">
                                    {voter.email}
                                  </span>
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
              })}
            </div>
          </div>

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

      <Dialog open={!!modalDate} onOpenChange={(open) => !open && setModalDate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vote for {modalDate ? format(modalDate, "MMM d") : ""}</DialogTitle>
            <DialogDescription>
              Toggle Feasible or Preferred for each slot.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <span>No times work for me</span>
            <Switch
              checked={noTimesWork}
              disabled={!canVote}
              onCheckedChange={toggleNoTimesWork}
            />
          </div>
          <div className="mt-4 space-y-3">
            {slotsForModal.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">No slots on this day.</p>
            )}
              {slotsForModal.map((slot) => {
                const vote = draftVotes[slot.id];
                const isPast = pastSlotIds.has(slot.id);
                return (
                  <div
                    key={slot.id}
                    className={`grid gap-2 rounded-2xl border px-4 py-3 dark:border-slate-700 ${
                      isPast
                        ? "border-red-300 bg-red-50/60 dark:border-red-700 dark:bg-red-900/20"
                        : "border-slate-200/70"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {format(new Date(slot.start), "h:mm a")}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Feasible</span>
                      <VoteToggle
                        checked={vote === "FEASIBLE" || vote === "PREFERRED"}
                        disabled={!canVote || noTimesWork || vote === "PREFERRED" || isPast}
                        onChange={(checked) =>
                          setVote(slot.id, checked ? "FEASIBLE" : null)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Preferred</span>
                      <VoteToggle
                        checked={vote === "PREFERRED"}
                        disabled={!canVote || noTimesWork || isPast}
                        onChange={(checked) =>
                          setVote(slot.id, checked ? "PREFERRED" : null)
                        }
                      />
                    </div>
                    {isPast && (
                      <p className="text-xs font-semibold text-red-500 dark:text-red-400">
                        This slot is in the past.
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setModalDate(null)}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingVotesOpen} onOpenChange={setPendingVotesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit your votes first?</DialogTitle>
            <DialogDescription>
              You have unsaved votes. Submit them before finalizing, or discard them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={discardVotesThenFinalize}
              disabled={pendingFinalizeBusy}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Discard my votes
            </button>
            <button
              type="button"
              onClick={submitVotesThenFinalize}
              disabled={pendingFinalizeBusy}
              className="rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {pendingFinalizeBusy ? "Submitting..." : "Submit votes & continue"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Finalize session</DialogTitle>
            <DialogDescription>
              Confirm the calendar details before locking votes.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-3">
            <label className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 px-4 py-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <span>Create Google Calendar event</span>
              <Switch
                checked={createCalendarEvent}
                disabled={!linkedCalendars.length}
                onCheckedChange={setCreateCalendarEvent}
              />
            </label>
            {!linkedCalendars.length && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                Link a Google Calendar in Settings to enable event creation.
                <button
                  type="button"
                  onClick={() => navigate("/settings")}
                  className="ml-2 underline underline-offset-2"
                >
                  Open settings
                </button>
              </div>
            )}
            {createCalendarEvent && linkedCalendars.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Calendar:{" "}
                {linkedCalendars.find((item) => item.id === selectedCalendarId)?.name ||
                  linkedCalendars[0]?.name}
              </p>
            )}
            {createCalendarEvent && linkedCalendars.length > 0 && (
              <div className="grid gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>Select calendar</span>
                <Select value={selectedCalendarId} onValueChange={setSelectedCalendarId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a calendar" />
                  </SelectTrigger>
                  <SelectContent>
                    {linkedCalendars.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id}>
                        {calendar.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {createCalendarEvent && (
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Event title
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
              />
            </label>
            )}
            {createCalendarEvent && (
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Description
              <textarea
                className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={eventDescription}
                onChange={(event) => setEventDescription(event.target.value)}
              />
            </label>
            )}
            {createCalendarEvent && (
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Duration (min)
              <input
                type="number"
                min="30"
                step="30"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={eventDuration}
                onChange={(event) => setEventDuration(event.target.value)}
              />
            </label>
            )}
            {createCalendarEvent && (
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Attendees (comma or newline separated)
              <textarea
                className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={eventAttendees}
                onChange={(event) => setEventAttendees(event.target.value)}
              />
            </label>
            )}
            {createCalendarEvent && scheduler.data?.googleEventId && (
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={deleteOldEvent}
                  onChange={(event) => setDeleteOldEvent(event.target.checked)}
                />
                Delete previous calendar event on finalize
              </label>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setFinalizeOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFinalize}
              disabled={saving}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? "Finalizing..." : "Finalize"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Clone session poll</DialogTitle>
            <DialogDescription>
              Duplicate this poll with a fresh link and optional vote reset.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              New poll name
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={cloneTitle}
                onChange={(event) => setCloneTitle(event.target.value)}
              />
            </label>
            {cloneGroupOptions.length > 0 && (
              <div className="grid gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Questing Group (optional)
                </span>
                <Select
                  value={cloneGroupId || "none"}
                  onValueChange={(value) =>
                    setCloneGroupId(value === "none" ? null : value)
                  }
                >
                  <SelectTrigger className="h-10 rounded-xl px-3 text-xs">
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No group</SelectItem>
                    {cloneGroupOptions.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                        {group.members ? ` (${group.members} members)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cloneGroupId && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Group members will be auto-added as invitees.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Invitees</p>
              {scheduler.data?.creatorEmail && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  You are included as {scheduler.data.creatorEmail}.
                </p>
              )}
              {cloneSelectedGroup && (
                <div
                  className="mt-3 rounded-2xl border px-3 py-3 text-xs"
                  style={{
                    borderColor: cloneGroupColor || "#10b981",
                    backgroundColor: `${cloneGroupColor || "#10b981"}22`,
                  }}
                >
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-100">
                    Members from {cloneSelectedGroup.name}
                  </p>
                  <div className="mt-2 grid gap-2">
                    {cloneGroupUsers.length === 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        No members listed for this group.
                      </span>
                    )}
                    {cloneGroupUsers.map((member) => (
                      <div
                        key={member.email}
                        className="flex items-center gap-2 rounded-xl border border-transparent bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
                      >
                        <UserAvatar email={member.email} src={member.avatar} size={22} />
                        <span>{member.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {cloneInvites.length === 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    No additional invitees yet.
                  </span>
                )}
                {cloneInvites.map((email) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => removeCloneInvite(email)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-red-900/30 dark:hover:border-red-800 dark:hover:text-red-300"
                    title="Remove"
                  >
                    {email} ✕
                  </button>
                ))}
              </div>

              {cloneRecommendedEmails.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Recommended (from friends)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cloneRecommendedEmails.map((email) => (
                      <button
                        key={email}
                        type="button"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-700"
                        onClick={() => addCloneInvite(email)}
                      >
                        + {email}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Add one email"
                  value={cloneInviteInput}
                  onChange={(event) => setCloneInviteInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCloneInvite(cloneInviteInput);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => addCloneInvite(cloneInviteInput)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  Add
                </button>
              </div>
              {cloneInviteError && (
                <p className="mt-2 text-xs text-red-500 dark:text-red-400">
                  {cloneInviteError}
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input
                type="checkbox"
                checked={cloneClearVotes}
                onChange={(event) => setCloneClearVotes(event.target.checked)}
              />
              Clear votes in the cloned poll
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCloneOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClone}
              disabled={cloneSaving}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {cloneSaving ? "Cloning..." : "Clone poll"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reopenOpen}
        onOpenChange={(open) => {
          setReopenOpen(open);
          if (open) {
            setReopenUpdateCalendar(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Re-open session poll</DialogTitle>
            <DialogDescription>
              Re-opening clears the winning slot and allows voting again.
            </DialogDescription>
          </DialogHeader>
          {scheduler.data?.googleEventId && (
            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={reopenUpdateCalendar}
                  onChange={(event) => setReopenUpdateCalendar(event.target.checked)}
                />
                Update Google Calendar entry
              </label>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Delete the existing calendar event so the poll can be rescheduled.
              </p>
            </div>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setReopenOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmReopen}
              disabled={saving}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? "Re-opening..." : "Re-open poll"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (open) {
            setDeleteUpdateCalendar(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete session poll</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this poll? This action cannot be undone and will remove the poll for all participants.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {scheduler.data?.title || "Untitled poll"}
            </p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {participantEmails.length} participants · {slots.data?.length || 0} slots · {allVotes.data?.length || 0} votes
            </p>
          </div>
          {scheduler.data?.googleEventId && (
            <label className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input
                type="checkbox"
                checked={deleteUpdateCalendar}
                onChange={(event) => setDeleteUpdateCalendar(event.target.checked)}
              />
              Update Google Calendar entry (delete the linked event)
            </label>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteSaving}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {deleteSaving ? "Deleting..." : "Delete poll"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invitePromptOpen} onOpenChange={setInvitePromptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Join this session poll?</DialogTitle>
            <DialogDescription>
              {isPendingInvite
                ? `${inviterLabel} invited you to join this poll.`
                : "This poll is open to anyone with the link."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
            Accepting will add you as a participant so you can vote on times.
          </div>
          <DialogFooter className="mt-6">
            <button
              type="button"
              onClick={handleDeclineInvite}
              disabled={invitePromptBusy}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={handleAcceptInvite}
              disabled={invitePromptBusy}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {invitePromptBusy ? "Joining..." : "Accept & join"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave session poll</DialogTitle>
            <DialogDescription>
              Leaving will remove you from the participant list and delete your votes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <button
              type="button"
              onClick={() => setLeaveOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLeavePoll}
              disabled={leaveSaving}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {leaveSaving ? "Leaving..." : "Leave poll"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeMemberOpen} onOpenChange={setRemoveMemberOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove participant</DialogTitle>
            <DialogDescription>
              Remove {memberToRemove} from this poll? Their votes will be cleared.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <button
              type="button"
              onClick={() => setRemoveMemberOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemoveParticipant}
              disabled={!memberToRemove}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeInviteOpen} onOpenChange={setRevokeInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke pending invite</DialogTitle>
            <DialogDescription>
              Remove the pending invite for {inviteToRevoke}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <button
              type="button"
              onClick={() => setRevokeInviteOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRevokeInvite}
              disabled={!inviteToRevoke}
              className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              Revoke invite
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
