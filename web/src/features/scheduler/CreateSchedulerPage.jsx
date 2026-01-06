import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { enUS } from "date-fns/locale";
import { useAuth } from "../../app/AuthProvider";
import { useUserSettings } from "../../hooks/useUserSettings";
import { db } from "../../lib/firebase";
import { isValidEmail } from "../../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
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
  const [error, setError] = useState(null);
  const [inviteError, setInviteError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("18:00");
  const [draftDuration, setDraftDuration] = useState(240);
  const [selectedTimezone, setSelectedTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [timezoneInitialized, setTimezoneInitialized] = useState(false);

  const inviteEmails = useMemo(() => invites, [invites]);
  const defaultDuration = settings?.defaultDurationMinutes ?? 60;
  const effectiveTimezone =
    timezoneMode === "manual" && timezone ? timezone : selectedTimezone;

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

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && modalOpen) {
        setModalOpen(false);
      }
    };
    if (modalOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [modalOpen]);

  const removeSlot = (slotId) => {
    setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
  };

  const openModalForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    setDraftDate(dateStr);
    const weekday = getDay(date);
    const defaultStart = settings?.defaultStartTimes?.[weekday] || "18:00";
    setDraftTime(defaultStart);
    setDraftDuration(defaultDuration);
    setModalOpen(true);
  };

  const saveDraftSlot = () => {
    if (!draftDate || !draftTime) {
      setError("Select a date and time before adding a slot.");
      return;
    }
    const startUtc = fromZonedTime(`${draftDate}T${draftTime}:00`, effectiveTimezone);
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
    const start = fromZonedTime(
      format(slotInfo.start, "yyyy-MM-dd'T'HH:mm:ss"),
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
    setError(null);

    if (!user) {
      setError("You must be signed in to create a scheduler.");
      return;
    }

    if (!slots.length) {
      setError("Add at least one slot.");
      return;
    }

    setSubmitting(true);
    try {
      const schedulerId = crypto.randomUUID();
      const schedulerRef = doc(db, "schedulers", schedulerId);
      const participants = Array.from(
        new Set([user.email, ...inviteEmails].filter(Boolean))
      );

      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const timezoneModeForScheduler =
        selectedTimezone === detectedTimezone ? "auto" : "manual";

      await setDoc(schedulerRef, {
        title: title || "Untitled scheduler",
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
      navigate(`/scheduler/${schedulerId}`);
    } catch (err) {
      setError(err.message || "Failed to create scheduler.");
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

  return (
    <>
      <form
        onSubmit={handleCreate}
        className="rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-900 dark:shadow-slate-900/50"
      >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Create Scheduler</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Add a few proposed session slots to kick off voting.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Back
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Scheduler title
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
                  if (calendarView === "month") {
                    openModalForDate(slotInfo.start);
                  } else {
                    addSlotFromSelection(slotInfo);
                  }
                }}
                onEventDrop={({ event, start, end }) =>
                  updateSlotTimes(event.id, start, end)
                }
                onEventResize={({ event, start, end }) =>
                  updateSlotTimes(event.id, start, end)
                }
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
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
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

          {error && <p className="mt-4 text-sm text-red-500 dark:text-red-400">{error}</p>}

          {createdId && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200">
              Scheduler created. Share link: {`${window.location.origin}/scheduler/${createdId}`}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create scheduler"}
            </button>
          </div>
      </form>
      {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="slot-modal-title"
            aria-describedby="slot-modal-desc"
          >
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-900">
              <h3 id="slot-modal-title" className="text-lg font-semibold">Add a slot</h3>
              <p id="slot-modal-desc" className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Choose a date and time in {effectiveTimezone}.
              </p>
              <div className="mt-4 grid gap-3">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Date
                  <input
                    type="date"
                    value={draftDate}
                    onChange={(event) => setDraftDate(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
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
              <div className="mt-6 flex justify-end gap-3">
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
              </div>
            </div>
          </div>
      )}
    </>
  );
}
