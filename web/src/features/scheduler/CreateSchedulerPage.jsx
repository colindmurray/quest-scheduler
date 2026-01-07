import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, startOfDay, isBefore, isToday } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "../../app/AuthProvider";
import { useUserSettings } from "../../hooks/useUserSettings";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection";
import { useFirestoreDoc } from "../../hooks/useFirestoreDoc";
import { db } from "../../lib/firebase";
import { schedulerSlotsRef, schedulerVotesRef } from "../../lib/data/schedulers";
import { isValidEmail } from "../../lib/utils";
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
import { AvatarStack, buildColorMap, uniqueUsers } from "../../components/ui/voter-avatars";
import { DatePicker } from "../../components/ui/date-picker";
import "react-big-calendar/lib/css/react-big-calendar.css";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

const DragAndDropCalendar = withDragAndDrop(Calendar);

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

export default function CreateSchedulerPage() {
  const { id: editId } = useParams();
  const isEditing = Boolean(editId);
  const { user } = useAuth();
  const { settings, addressBook, timezoneMode, timezone } = useUserSettings();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [invites, setInvites] = useState([]);
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
  const [selectedTimezone, setSelectedTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [timezoneInitialized, setTimezoneInitialized] = useState(false);
  const [loadedFromPoll, setLoadedFromPoll] = useState(false);
  const [initialSlotIds, setInitialSlotIds] = useState(new Set());

  const schedulerRef = useMemo(
    () => (isEditing ? doc(db, "schedulers", editId) : null),
    [editId, isEditing]
  );
  const scheduler = useFirestoreDoc(schedulerRef);
  const slotsRef = useMemo(
    () => (isEditing ? schedulerSlotsRef(editId) : null),
    [editId, isEditing]
  );
  const votesRef = useMemo(
    () => (isEditing ? schedulerVotesRef(editId) : null),
    [editId, isEditing]
  );
  const slotsSnapshot = useFirestoreCollection(slotsRef);
  const votesSnapshot = useFirestoreCollection(votesRef);

  const inviteEmails = useMemo(() => invites, [invites]);
  const defaultDuration = settings?.defaultDurationMinutes ?? 60;
  const effectiveTimezone = selectedTimezone;
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
    setTitle(scheduler.data.title || "");
    const creatorEmail = scheduler.data.creatorEmail || user?.email;
    const participantList = scheduler.data.participants || [];
    setInvites(participantList.filter((email) => email && email !== creatorEmail));
    setSlots(
      slotsSnapshot.data.map((slot) => ({
        id: slot.id,
        start: slot.start ? new Date(slot.start) : new Date(),
        end: slot.end ? new Date(slot.end) : new Date(),
        persisted: true,
      }))
    );
    setInitialSlotIds(new Set(slotsSnapshot.data.map((slot) => slot.id)));
    if (scheduler.data.timezone) {
      setSelectedTimezone(scheduler.data.timezone);
      setTimezoneInitialized(true);
    }
    setLoadedFromPoll(true);
  }, [isEditing, loadedFromPoll, scheduler.data, slotsSnapshot.loading, slotsSnapshot.data, user?.uid, user?.email]);

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
    const participantEmails = scheduler.data?.participants || [];
    const voterEmails = votesSnapshot.data.map((voteDoc) => voteDoc.userEmail).filter(Boolean);
    const set = new Set([...participantEmails, ...voterEmails]);
    return buildColorMap(Array.from(set).sort((a, b) => a.localeCompare(b)));
  }, [isEditing, scheduler.data?.participants, votesSnapshot.data]);


  const removeSlot = (slotId) => {
    setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
  };

  const openModalForDate = (date) => {
    const safeDate = date instanceof Date ? date : new Date(date);
    setDraftDate(safeDate);
    const weekday = getDay(safeDate);
    const defaultStart = settings?.defaultStartTimes?.[weekday] || "18:00";
    setDraftTime(defaultStart);
    setDraftDuration(defaultDuration);
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

    setSubmitting(true);
    try {
      const participants = Array.from(
        new Set([user.email, ...inviteEmails].filter(Boolean))
      );

      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const timezoneModeForScheduler =
        selectedTimezone === detectedTimezone ? "auto" : "manual";

      if (isEditing) {
        await updateDoc(schedulerRef, {
          title: title || "Untitled poll",
          participants,
          timezone: effectiveTimezone,
          timezoneMode: timezoneModeForScheduler,
        });

        const currentSlotIds = new Set(slots.map((slot) => slot.id));
        const removedIds = Array.from(initialSlotIds).filter(
          (slotId) => !currentSlotIds.has(slotId)
        );

        await Promise.all(
          slots.map((slot) => {
            const slotRef = doc(db, "schedulers", editId, "slots", slot.id);
            const data = {
              start: slot.start.toISOString(),
              end: slot.end.toISOString(),
            };
            if (!initialSlotIds.has(slot.id)) {
              data.stats = { feasible: 0, preferred: 0 };
            }
            return setDoc(slotRef, data, { merge: true });
          })
        );

        const participantSet = new Set(participants.map((email) => email.toLowerCase()));

        if (removedIds.length > 0) {
          await Promise.all(
            removedIds.map((slotId) =>
              deleteDoc(doc(db, "schedulers", editId, "slots", slotId))
            )
          );
        }

        await Promise.all(
          votesSnapshot.data.map((voteDoc) => {
            const userEmail = voteDoc.userEmail?.toLowerCase();
            if (userEmail && !participantSet.has(userEmail)) {
              return deleteDoc(doc(db, "schedulers", editId, "votes", voteDoc.id));
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
            return setDoc(
              doc(db, "schedulers", editId, "votes", voteDoc.id),
              { votes: nextVotes, updatedAt: serverTimestamp() },
              { merge: true }
            );
          })
        );

        navigate(`/scheduler/${editId}`);
        return;
      }

      const schedulerId = crypto.randomUUID();
      const newSchedulerRef = doc(db, "schedulers", schedulerId);

      await setDoc(newSchedulerRef, {
        title: title || "Untitled poll",
        creatorId: user.uid,
        creatorEmail: user.email,
        status: "OPEN",
        participants,
        timezone: effectiveTimezone,
        timezoneMode: timezoneModeForScheduler,
        winningSlotId: null,
        googleEventId: null,
        createdAt: serverTimestamp(),
      });

      const slotCollection = collection(db, "schedulers", schedulerId, "slots");
      await Promise.all(
        slots.map((slot) => {
          return addDoc(slotCollection, {
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            stats: { feasible: 0, preferred: 0 },
          });
        })
      );

      setCreatedId(schedulerId);
      toast.success(isEditing ? "Session poll updated" : "Session poll created");
      navigate(`/scheduler/${schedulerId}`);
    } catch (err) {
      console.error("Failed to save session poll:", err);
      toast.error(err.message || "Failed to save session poll");
    } finally {
      setSubmitting(false);
    }
  };

  const addInvite = (email) => {
    const normalized = normalizeEmail(email);
    if (!normalized) return;
    if (!isValidEmail(normalized)) {
      setInviteError("Enter a valid email address.");
      return;
    }
    if (user?.email && normalized === normalizeEmail(user.email)) {
      setInviteError("You are already included as a participant.");
      return;
    }
    setInvites((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setInviteInput("");
    setInviteError(null);
  };

  const removeInvite = (email) => {
    setInvites((prev) => prev.filter((item) => item !== email));
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

  return (
    <>
      <form
        onSubmit={handleCreate}
        className="rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-900 dark:shadow-slate-900/50"
      >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">
                {isEditing ? "Edit Session Poll" : "Create Session Poll"}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {isEditing
                  ? "Update slots and invitees without losing existing votes."
                  : "Add a few proposed session slots to kick off voting."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(isEditing ? `/scheduler/${editId}` : "/dashboard")}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Back
            </button>
          </div>

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

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Invitees</p>
              {user?.email && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  You are included as {user.email}.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {invites.length === 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">No invitees yet.</span>
                )}
                {invites.map((email) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => removeInvite(email)}
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
                    Recommended (from address book)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {addressBook.map((email) => (
                      <button
                        key={email}
                        type="button"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-700"
                        onClick={() => addInvite(email)}
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
                  value={inviteInput}
                  onChange={(event) => setInviteInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addInvite(inviteInput);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => addInvite(inviteInput)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  Add
                </button>
              </div>
              {inviteError && (
                <p className="mt-2 text-xs text-red-500 dark:text-red-400">{inviteError}</p>
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
            <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <DragAndDropCalendar
                localizer={localizer}
                events={slots.map((slot) => ({
                  ...slot,
                  title: formatInTimeZone(slot.start, effectiveTimezone, "h:mm a"),
                }))}
                startAccessor="start"
                endAccessor="end"
                selectable
                scrollToTime={new Date(1970, 0, 1, 8, 0)}
                date={calendarDate}
                onNavigate={(nextDate) => setCalendarDate(nextDate)}
                view={calendarView}
                onView={(nextView) => setCalendarView(nextView)}
                views={["month", "week", "day"]}
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
                  const today = startOfDay(new Date());
                  const dayStart = startOfDay(date);
                  if (isBefore(dayStart, today)) {
                    return {
                      className: "rbc-past-day",
                      style: {
                        backgroundColor: "var(--past-day-bg)",
                        cursor: "not-allowed",
                      },
                    };
                  }
                  return {};
                }}
                slotPropGetter={(date) => {
                  const now = new Date();
                  if (date < now) {
                    return {
                      className: "rbc-past-slot",
                      style: {
                        backgroundColor: "var(--past-slot-bg)",
                        cursor: "not-allowed",
                      },
                    };
                  }
                  return {};
                }}
                eventPropGetter={(event) => {
                  if (!isEditing) return {};
                  const isInvalid = invalidSlotIds.has(event.id);
                  if (!isInvalid) return {};
                  return {
                    style: {
                      backgroundColor: "#dc2626",
                      borderColor: "#b91c1c",
                    },
                  };
                }}
                style={{ height: 420 }}
              />
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
                      : "border-slate-100 bg-white dark:border-slate-700"
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatInTimeZone(
                        slot.start,
                        effectiveTimezone,
                        "MMM d, yyyy · h:mm a"
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
              Session poll created. Share link: {`${window.location.origin}/scheduler/${createdId}`}
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
