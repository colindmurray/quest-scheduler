import {
  arrayUnion,
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
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, isSameDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { MoreVertical, Pencil, Copy, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { getStoredAccessToken, signInWithGoogle } from "../../lib/auth";
import { useUserSettings } from "../../hooks/useUserSettings";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection";
import { useFirestoreDoc } from "../../hooks/useFirestoreDoc";
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
import { LoadingState } from "../../components/ui/spinner";
import { isValidEmail } from "../../lib/utils";
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
  const { settings, addressBook, archivePoll, unarchivePoll, isArchived } = useUserSettings();
  const scheduler = useFirestoreDoc(schedulerRef);
  const creatorRef = useMemo(
    () =>
      scheduler.data?.creatorId ? doc(db, "users", scheduler.data.creatorId) : null,
    [scheduler.data?.creatorId]
  );
  const creator = useFirestoreDoc(creatorRef);
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
  const [finalizeSlotId, setFinalizeSlotId] = useState(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDuration, setEventDuration] = useState(240);
  const [eventAttendees, setEventAttendees] = useState("");
  const [createCalendarEvent, setCreateCalendarEvent] = useState(true);
  const [deleteOldEvent, setDeleteOldEvent] = useState(true);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneTitle, setCloneTitle] = useState("");
  const [cloneInvites, setCloneInvites] = useState([]);
  const [cloneInviteInput, setCloneInviteInput] = useState("");
  const [cloneInviteError, setCloneInviteError] = useState(null);
  const [cloneSaving, setCloneSaving] = useState(false);
  const [cloneClearVotes, setCloneClearVotes] = useState(false);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const isLocked = scheduler.data?.status !== "OPEN";
  const isPollArchived = isArchived(id);
  const isCreator = scheduler.data?.creatorId === user?.uid;
  const [calendarView, setCalendarView] = useState("month");
  const [expandedSlots, setExpandedSlots] = useState({});

  useEffect(() => {
    if (!scheduler.data || !user?.email || !id) return;
    if (!scheduler.data.participants?.includes(user.email)) {
      updateDoc(schedulerRef, {
        participants: arrayUnion(user.email),
      }).catch((err) => {
        console.error("Failed to add participant:", err);
        toast.error("Failed to join session poll. Please refresh and try again.");
      });
    }
  }, [id, scheduler.data, schedulerRef, user?.email]);

  useEffect(() => {
    if (userVote.data?.votes) {
      setDraftVotes(userVote.data.votes);
    }
  }, [userVote.data]);

  const tallies = useMemo(() => {
    const map = {};
    allVotes.data.forEach((voteDoc) => {
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
  }, [allVotes.data]);

  const participantEmails = useMemo(
    () => scheduler.data?.participants || [],
    [scheduler.data?.participants]
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
    }));
  }, [allVotes.data, participantEmails]);

  const sortedSlots = useMemo(() => {
    const rows = slots.data.map((slot) => {
      const counts = tallies[slot.id] || { feasible: 0, preferred: 0 };
      return { ...slot, counts };
    });
    return rows.sort((a, b) => {
      if (sortMode === "attendance") {
        if (b.counts.feasible !== a.counts.feasible) {
          return b.counts.feasible - a.counts.feasible;
        }
        return b.counts.preferred - a.counts.preferred;
      }
      if (b.counts.preferred !== a.counts.preferred) {
        return b.counts.preferred - a.counts.preferred;
      }
      return b.counts.feasible - a.counts.feasible;
    });
  }, [slots.data, sortMode, tallies]);

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

  const toggleExpanded = (slotId) => {
    setExpandedSlots((prev) => ({ ...prev, [slotId]: !prev[slotId] }));
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
    if (pastSlotIds.has(slotId)) {
      toast.error("This time slot is in the past and can no longer be voted on.");
      return;
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

  const normalizeEmail = (value) => value.trim().toLowerCase();

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
    setCloneInvites((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setCloneInviteInput("");
    setCloneInviteError(null);
  };

  const removeCloneInvite = (email) => {
    setCloneInvites((prev) => prev.filter((item) => item !== email));
  };

  const handleSave = async () => {
    if (!user || !userVoteRef) return;
    setSaving(true);
    try {
      await setDoc(
        userVoteRef,
        {
          userEmail: user.email,
          userAvatar: user.photoURL,
          votes: draftVotes,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const notifyCreator = creator.data?.settings?.emailNotifications;
      const recipient = scheduler.data?.creatorEmail;
      if (notifyCreator && recipient) {
        await setDoc(doc(collection(db, "mail")), {
          to: recipient,
          message: {
            subject: "New vote submitted",
            text: `${user.email} updated votes for ${scheduler.data?.title || "your session poll"}.`,
          },
        });
      }
      toast.success("Votes saved successfully");
    } catch (err) {
      console.error("Failed to save votes:", err);
      toast.error(err.message || "Failed to save votes. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const openFinalize = (slotId) => {
    if (pastSlotIds.has(slotId)) {
      toast.error("This time slot is in the past and cannot be selected.");
      return;
    }
    const linkedCalendarId = settings?.googleCalendarId || "";
    const slot = slots.data.find((item) => item.id === slotId);
    const duration = slot?.start && slot?.end ? Math.round((new Date(slot.end) - new Date(slot.start)) / 60000) : 240;
    setFinalizeSlotId(slotId);
    setEventTitle(settings?.defaultTitle || scheduler.data?.title || "D&D Session");
    setEventDescription(settings?.defaultDescription || "");
    setEventDuration(duration || settings?.defaultDurationMinutes || 240);
    setEventAttendees((scheduler.data?.participants || []).join(", "));
    setCreateCalendarEvent(Boolean(linkedCalendarId));
    setDeleteOldEvent(true);
    setFinalizeOpen(true);
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
      const shouldCreateEvent = createCalendarEvent && Boolean(settings?.googleCalendarId);
      let eventId = null;
      let calendarIdToSave = null;

      if (shouldCreateEvent) {
        if (durationMinutes < 1 || isNaN(durationMinutes)) {
          throw new Error("Invalid duration. Please enter a valid number of minutes.");
        }
        let accessToken = getStoredAccessToken();
        if (!accessToken) {
          try {
            await signInWithGoogle();
            accessToken = getStoredAccessToken();
          } catch (authErr) {
            throw new Error("Google sign-in failed. Please try again.");
          }
        }
        if (!accessToken) {
          throw new Error("Google access token missing. Please re-authenticate.");
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
        const attendees = Array.from(
          new Set(parsedEmails.map((email) => email.toLowerCase()))
        ).map((email) => ({ email }));

        const linkedCalendarId = settings?.googleCalendarId;
        calendarIdToSave = linkedCalendarId || "primary";

        if (deleteOldEvent && scheduler.data?.googleEventId) {
          const previousCalendarId = scheduler.data?.googleCalendarId || calendarIdToSave;
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
              previousCalendarId
            )}/events/${encodeURIComponent(scheduler.data.googleEventId)}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
        }

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarIdToSave
          )}/events`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              summary: eventTitle,
              description: eventDescription,
              start: { dateTime: start.toISOString() },
              end: { dateTime: new Date(start.getTime() + durationMinutes * 60 * 1000).toISOString() },
              attendees,
            }),
          }
        );

        if (!response.ok) {
          const detail = await response.json();
          throw new Error(detail?.error?.message || "Failed to create calendar event.");
        }

        const event = await response.json();
        eventId = event.id || null;
      }

      await updateDoc(schedulerRef, {
        status: "FINALIZED",
        winningSlotId: finalizeSlotId,
        googleEventId: eventId,
        googleCalendarId: calendarIdToSave,
      });

      const participantEmails = (scheduler.data?.participants || []).filter(Boolean);
      if (participantEmails.length > 0) {
        try {
          const uniqueEmails = Array.from(
            new Set(participantEmails.map((email) => email.toLowerCase()))
          );
          const chunks = [];
          for (let i = 0; i < uniqueEmails.length; i += 10) {
            chunks.push(uniqueEmails.slice(i, i + 10));
          }
          const optOuts = new Set();
          for (const chunk of chunks) {
            const snapshot = await getDocs(
              query(collection(db, "usersPublic"), where("email", "in", chunk))
            );
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              if (data?.email && data?.emailNotifications === false) {
                optOuts.add(data.email.toLowerCase());
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
          const recipients = uniqueEmails.filter((email) => !optOuts.has(email));
          await Promise.all(
            recipients.map((email) =>
              setDoc(doc(collection(db, "mail")), {
                to: email,
                message: {
                  subject: `Session poll finalized: ${scheduler.data?.title || "Session Poll"}`,
                  text: `A winning time was selected for ${scheduler.data?.title || "this session poll"}.\n\nWinning time: ${rangeLabel} (${timezone})\n\nView the poll: ${window.location.href}`,
                },
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

  const handleReopen = async () => {
    if (!schedulerRef) return;
    setSaving(true);
    try {
      await updateDoc(schedulerRef, {
        status: "OPEN",
        winningSlotId: null,
      });
      toast.success("Session poll re-opened");
    } catch (err) {
      console.error("Failed to re-open session poll:", err);
      toast.error(err.message || "Failed to re-open session poll. Check your connection and try again.");
    } finally {
      setSaving(false);
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
    const newInvites = participants.filter(
      (email) => email && email.toLowerCase() !== user.email.toLowerCase()
    );

    // If not the creator, add original creator to invites
    if (!isCreator && originalCreatorEmail) {
      if (!newInvites.some((e) => e.toLowerCase() === originalCreatorEmail.toLowerCase())) {
        newInvites.push(originalCreatorEmail);
      }
    }

    setCloneTitle(`${baseTitle} (copy)`);
    setCloneInvites(newInvites);
    setCloneClearVotes(false);
    setCloneInviteError(null);
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

      const now = new Date();
      const futureSlots = slots.data.filter(
        (slot) => slot.start && new Date(slot.start) > now
      );
      if (futureSlots.length === 0) {
        toast.error("No future slots remain to clone");
        setCloneSaving(false);
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
            if (!voteDoc.userEmail) return Promise.resolve();
            if (!participantSet.has(voteDoc.userEmail.toLowerCase())) {
              return Promise.resolve();
            }
            const nextVotes = Object.fromEntries(
              Object.entries(voteDoc.votes || {}).filter(([slotId]) =>
                validSlotIds.has(slotId)
              )
            );
            if (Object.keys(nextVotes).length === 0) return Promise.resolve();
            return setDoc(
              doc(db, "schedulers", newId, "votes", voteDoc.id),
              {
                userEmail: voteDoc.userEmail,
                userAvatar: voteDoc.userAvatar,
                votes: nextVotes,
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

  if (!scheduler.data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600 dark:text-slate-400">
        Session poll not found.
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
                  {scheduler.data.participants?.length || 0} participants
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
                    <DropdownMenuItem onClick={handleReopen} disabled={saving}>
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

          <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
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
            <div className="mt-3 flex flex-wrap gap-2">
              {participants.map((participant) => (
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
                </div>
              ))}
            </div>
          </div>

          {view === "calendar" && (
            <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
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
              {slots.loading && (
                <LoadingState message="Loading slots..." className="py-4" />
              )}
              {!slots.loading && slots.data.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No slots have been proposed yet.
                </p>
              )}
              {slots.data.map((slot) => {
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
                        : "border-slate-100 dark:border-slate-700"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {startDate ? format(startDate, "MMM d, yyyy · h:mm a") : "Slot"}
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
                        disabled={isLocked || vote === "PREFERRED" || pastSlotIds.has(slot.id)}
                        onChange={(checked) => setVote(slot.id, checked ? "FEASIBLE" : null)}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Preferred
                      </span>
                      <VoteToggle
                        checked={vote === "PREFERRED"}
                        disabled={isLocked || pastSlotIds.has(slot.id)}
                        onChange={(checked) =>
                          setVote(slot.id, checked ? "PREFERRED" : null)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-end text-xs text-slate-400 dark:text-slate-500">
                      {vote === "PREFERRED" && "Preferred"}
                      {vote === "FEASIBLE" && "Feasible"}
                      {!vote && "No vote"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-10 rounded-3xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800/60">
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
                          : "border-slate-100 bg-white dark:border-slate-700"
                    } ${isMuted ? "opacity-60 grayscale" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {startDate
                            ? `${format(startDate, "MMM d, yyyy · h:mm a")}${
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
                          <button
                            type="button"
                            disabled={isLocked || isPast}
                            onClick={() => openFinalize(slot.id)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold transition-colors hover:bg-slate-50 disabled:hover:bg-transparent dark:border-slate-600 dark:hover:bg-slate-700"
                          >
                            {isLocked && scheduler.data?.winningSlotId === slot.id
                              ? "Winner"
                              : "Select winner"}
                          </button>
                        )}
                      </div>
                    </div>
                    {expandedSlots[slot.id] && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
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
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
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
                        : "border-slate-100"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {format(new Date(slot.start), "h:mm a")}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Feasible</span>
                      <VoteToggle
                        checked={vote === "FEASIBLE" || vote === "PREFERRED"}
                        disabled={isLocked || vote === "PREFERRED" || isPast}
                        onChange={(checked) =>
                          setVote(slot.id, checked ? "FEASIBLE" : null)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Preferred</span>
                      <VoteToggle
                        checked={vote === "PREFERRED"}
                        disabled={isLocked || isPast}
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

      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Finalize session</DialogTitle>
            <DialogDescription>
              Confirm the calendar details before locking votes.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-3">
            <label className="flex items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <span>Create Google Calendar event</span>
              <Switch
                checked={createCalendarEvent}
                disabled={!settings?.googleCalendarId}
                onCheckedChange={setCreateCalendarEvent}
              />
            </label>
            {!settings?.googleCalendarId && (
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
            {createCalendarEvent && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Calendar: {settings?.googleCalendarName || settings?.googleCalendarId || "Primary"}
              </p>
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

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Invitees</p>
              {scheduler.data?.creatorEmail && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  You are included as {scheduler.data.creatorEmail}.
                </p>
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

              {addressBook.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Recommended
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {addressBook.map((email) => (
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
              {scheduler.data?.participants?.length || 0} participants · {slots.data?.length || 0} slots · {allVotes.data?.length || 0} votes
            </p>
          </div>
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
    </>
  );
}
