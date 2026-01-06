import {
  arrayUnion,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, isSameDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { useAuth } from "../../app/AuthProvider";
import { getStoredAccessToken, signInWithGoogle } from "../../lib/auth";
import { useUserSettings } from "../../hooks/useUserSettings";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection";
import { useFirestoreDoc } from "../../hooks/useFirestoreDoc";
import { db } from "../../lib/firebase";
import { schedulerSlotsRef, schedulerVotesRef } from "../../lib/data/schedulers";
import { Switch } from "../../components/ui/switch";
import { LoadingState, Spinner } from "../../components/ui/spinner";
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

function getInitial(email) {
  if (!email) return "?";
  return email.trim()[0]?.toUpperCase() || "?";
}

function uniqueUsers(users) {
  const map = new Map();
  users.forEach((user) => {
    if (user?.email && !map.has(user.email)) {
      map.set(user.email, user);
    }
  });
  return Array.from(map.values());
}

function buildColorMap(emails) {
  const map = {};
  emails.forEach((email, index) => {
    const hue = (index * 137.508) % 360;
    map[email] = {
      bg: `hsl(${hue} 60% 78%)`,
      text: `hsl(${hue} 35% 25%)`,
    };
  });
  return map;
}

export default function SchedulerPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const schedulerRef = useMemo(
    () => (id ? doc(db, "schedulers", id) : null),
    [id]
  );
  const { settings } = useUserSettings();
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
  const [error, setError] = useState(null);
  const [modalDate, setModalDate] = useState(null);
  const [sortMode, setSortMode] = useState("preferred");
  const [finalizeSlotId, setFinalizeSlotId] = useState(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDuration, setEventDuration] = useState(240);
  const [eventAttendees, setEventAttendees] = useState("");
  const [calendarId, setCalendarId] = useState("primary");
  const [deleteOldEvent, setDeleteOldEvent] = useState(true);
  const isLocked = scheduler.data?.status === "FINALIZED";
  const isCreator = scheduler.data?.creatorId === user?.uid;
  const [calendarView, setCalendarView] = useState("month");
  const [expandedSlots, setExpandedSlots] = useState({});

  // Handle Escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (finalizeOpen) setFinalizeOpen(false);
        else if (modalDate) setModalDate(null);
      }
    };
    if (modalDate || finalizeOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [modalDate, finalizeOpen]);

  useEffect(() => {
    if (!scheduler.data || !user?.email || !id) return;
    if (!scheduler.data.participants?.includes(user.email)) {
      updateDoc(schedulerRef, {
        participants: arrayUnion(user.email),
      }).catch((err) => {
        console.error("Failed to add participant:", err);
        setError("Failed to join scheduler. Please refresh and try again.");
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
    return slots.data.filter((slot) => {
      if (!slot.start) return false;
      return isSameDay(new Date(slot.start), modalDate);
    });
  }, [modalDate, slots.data]);

  const toggleExpanded = (slotId) => {
    setExpandedSlots((prev) => ({ ...prev, [slotId]: !prev[slotId] }));
  };

  const AvatarBubble = ({ email, avatar, size = 24 }) => {
    const palette = colorMap[email] || { bg: "#e2e8f0", text: "#0f172a" };
    return (
      <div
        className="flex items-center justify-center rounded-full border border-white shadow-sm dark:border-slate-900"
        style={{
          width: size,
          height: size,
          backgroundColor: avatar ? "transparent" : palette.bg,
          color: palette.text,
        }}
        title={email}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={email}
            className="h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="text-[10px] font-semibold">{getInitial(email)}</span>
        )}
      </div>
    );
  };

  const AvatarStack = ({ users, max = 4, size = 20 }) => {
    const unique = uniqueUsers(users);
    const visible = unique.slice(0, max);
    const extra = unique.length - visible.length;
    return (
      <div className="flex items-center -space-x-2">
        {visible.map((userInfo) => (
          <AvatarBubble
            key={userInfo.email}
            email={userInfo.email}
            avatar={userInfo.avatar}
            size={size}
          />
        ))}
        {extra > 0 && (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-slate-200 text-[10px] font-semibold text-slate-700 shadow-sm dark:border-slate-900 dark:bg-slate-700 dark:text-slate-200"
            title={`${extra} more`}
          >
            +{extra}
          </div>
        )}
      </div>
    );
  };

  const EventCell = ({ event }) => {
    if (calendarView === "month") {
      return (
        <div className="space-y-1">
          <div className="text-xs font-semibold">{event.timeLabel}</div>
          <div className="flex items-center gap-1 text-[10px] text-white/90">
            <span>★ {event.preferredCount}</span>
            <span className="text-white/70">·</span>
            <span>✓ {event.feasibleCount}</span>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <div className="text-xs font-semibold">{event.timeLabel}</div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-white/90">★ {event.preferredCount}</span>
          <AvatarStack users={event.preferredVoters} max={4} size={18} />
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-white/90">✓ {event.feasibleCount}</span>
          <AvatarStack users={event.feasibleVoters} max={4} size={18} />
        </div>
      </div>
    );
  };

  const setVote = (slotId, nextValue) => {
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

  const handleSave = async () => {
    if (!user || !userVoteRef) return;
    setSaving(true);
    setError(null);
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
            text: `${user.email} updated votes for ${scheduler.data?.title || "your scheduler"}.`,
          },
        });
      }
    } catch (err) {
      setError(err.message || "Failed to save votes. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const openFinalize = (slotId) => {
    const slot = slots.data.find((item) => item.id === slotId);
    const duration = slot?.start && slot?.end ? Math.round((new Date(slot.end) - new Date(slot.start)) / 60000) : 240;
    setFinalizeSlotId(slotId);
    setEventTitle(settings?.defaultTitle || scheduler.data?.title || "D&D Session");
    setEventDescription(settings?.defaultDescription || "");
    setEventDuration(duration || settings?.defaultDurationMinutes || 240);
    setEventAttendees((scheduler.data?.participants || []).join(", "));
    setCalendarId(scheduler.data?.googleCalendarId || "primary");
    setDeleteOldEvent(true);
    setFinalizeOpen(true);
  };

  const handleFinalize = async () => {
    if (!finalizeSlotId || !schedulerRef) return;
    setSaving(true);
    setError(null);
    try {
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

      const slot = slots.data.find((item) => item.id === finalizeSlotId);
      if (!slot?.start) {
        throw new Error("Selected slot is missing a start time.");
      }

      const start = new Date(slot.start);
      const durationMinutes = Number(eventDuration) || 240;
      if (durationMinutes < 1 || isNaN(durationMinutes)) {
        throw new Error("Invalid duration. Please enter a valid number of minutes.");
      }
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

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

      if (deleteOldEvent && scheduler.data?.googleEventId) {
        const previousCalendarId = scheduler.data?.googleCalendarId || calendarId;
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
          calendarId
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
            end: { dateTime: end.toISOString() },
            attendees,
          }),
        }
      );

      if (!response.ok) {
        const detail = await response.json();
        throw new Error(detail?.error?.message || "Failed to create calendar event.");
      }

      const event = await response.json();

      await updateDoc(schedulerRef, {
        status: "FINALIZED",
        winningSlotId: finalizeSlotId,
        googleEventId: event.id || null,
        googleCalendarId: calendarId,
      });
      setFinalizeOpen(false);
    } catch (err) {
      setError(err.message || "Failed to finalize scheduler. Your Google token may have expired - try signing out and back in.");
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    if (!schedulerRef) return;
    setSaving(true);
    setError(null);
    try {
      await updateDoc(schedulerRef, {
        status: "OPEN",
        winningSlotId: null,
      });
    } catch (err) {
      setError(err.message || "Failed to re-open scheduler. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (scheduler.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center dark:text-slate-300">
        <LoadingState message="Loading scheduler..." />
      </div>
    );
  }

  if (!scheduler.data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600 dark:text-slate-400">
        Scheduler not found.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                Session Scheduler
              </p>
              <h2 className="text-2xl font-semibold dark:text-slate-100">{scheduler.data.title}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {scheduler.data.participants?.length || 0} participants ·{" "}
                {scheduler.data.status}
              </p>
            </div>
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
          </div>

          <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Participants</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {participants.length} total · {voterEmails.length} voted
                </p>
              </div>
              <AvatarStack
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
                  <AvatarBubble email={participant.email} avatar={participant.avatar} size={18} />
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

          {isCreator && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {isLocked ? (
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={saving}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  Re-open scheduler
                </button>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select a winning slot from Results when ready to finalize.
                </p>
              )}
            </div>
          )}

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
                    className="grid gap-3 rounded-2xl border border-slate-100 px-4 py-3 md:grid-cols-[1.4fr_1fr_1fr_auto] dark:border-slate-700"
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
                          <AvatarStack users={voters.preferred} max={4} size={20} />
                          <span className="text-slate-400 dark:text-slate-500">
                            {counts.preferred}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold">Feasible</span>
                          <AvatarStack users={voters.feasible} max={4} size={20} />
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
                        disabled={isLocked || vote === "PREFERRED"}
                        onChange={(checked) => setVote(slot.id, checked ? "FEASIBLE" : null)}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Preferred
                      </span>
                      <VoteToggle
                        checked={vote === "PREFERRED"}
                        disabled={isLocked}
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
                const voters = slotVoters[slot.id] || { feasible: [], preferred: [] };
                return (
                  <div key={slot.id} className="rounded-2xl border border-slate-100 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {startDate ? format(startDate, "MMM d, yyyy · h:mm a") : "Slot"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Preferred {slot.counts.preferred} · Feasible {slot.counts.feasible}
                        </p>
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold">Preferred</span>
                            <AvatarStack users={voters.preferred} max={8} size={22} />
                            <span className="text-slate-400 dark:text-slate-500">
                              {slot.counts.preferred}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold">Feasible</span>
                            <AvatarStack users={voters.feasible} max={8} size={22} />
                            <span className="text-slate-400 dark:text-slate-500">
                              {slot.counts.feasible}
                            </span>
                          </div>
                        </div>
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
                            disabled={isLocked}
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
                            Preferred voters
                          </p>
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
                                  <AvatarBubble email={voter.email} avatar={voter.avatar} size={20} />
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
                            Feasible voters
                          </p>
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
                                  <AvatarBubble email={voter.email} avatar={voter.avatar} size={20} />
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

          {error && <p className="mt-4 text-sm text-red-500 dark:text-red-400">{error}</p>}

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

      {modalDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vote-modal-title"
          aria-describedby="vote-modal-desc"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h3 id="vote-modal-title" className="text-lg font-semibold">Vote for {format(modalDate, "MMM d")}</h3>
                <p id="vote-modal-desc" className="text-sm text-slate-500 dark:text-slate-400">
                  Toggle Feasible or Preferred for each slot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalDate(null)}
                aria-label="Close vote modal"
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {slotsForModal.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">No slots on this day.</p>
              )}
              {slotsForModal.map((slot) => {
                const vote = draftVotes[slot.id];
                return (
                  <div
                    key={slot.id}
                    className="grid gap-2 rounded-2xl border border-slate-100 px-4 py-3 dark:border-slate-700"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {format(new Date(slot.start), "h:mm a")}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Feasible</span>
                      <VoteToggle
                        checked={vote === "FEASIBLE" || vote === "PREFERRED"}
                        disabled={isLocked || vote === "PREFERRED"}
                        onChange={(checked) =>
                          setVote(slot.id, checked ? "FEASIBLE" : null)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Preferred</span>
                      <VoteToggle
                        checked={vote === "PREFERRED"}
                        disabled={isLocked}
                        onChange={(checked) =>
                          setVote(slot.id, checked ? "PREFERRED" : null)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setModalDate(null)}
                className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {finalizeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finalize-modal-title"
          aria-describedby="finalize-modal-desc"
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h3 id="finalize-modal-title" className="text-lg font-semibold">Finalize session</h3>
                <p id="finalize-modal-desc" className="text-sm text-slate-500 dark:text-slate-400">
                  Confirm the calendar details before locking votes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFinalizeOpen(false)}
                aria-label="Close finalize modal"
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-3">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Event title
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={eventTitle}
                    onChange={(event) => setEventTitle(event.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Description
                  <textarea
                    className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={eventDescription}
                    onChange={(event) => setEventDescription(event.target.value)}
                  />
                </label>
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
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Calendar ID
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={calendarId}
                    onChange={(event) => setCalendarId(event.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Attendees (comma or newline separated)
                  <textarea
                    className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={eventAttendees}
                    onChange={(event) => setEventAttendees(event.target.value)}
                  />
                </label>
              {scheduler.data?.googleEventId && (
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
            <div className="mt-6 flex justify-end gap-3">
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
