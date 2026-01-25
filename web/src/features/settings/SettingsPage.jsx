import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useAuth } from "../../app/AuthProvider";
import { useTheme } from "../../app/ThemeProvider";
import { db } from "../../lib/firebase";
import { signOutUser } from "../../lib/auth";
import { LoadingState } from "../../components/ui/spinner";
import { Switch } from "../../components/ui/switch";
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

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

 

export default function SettingsPage() {
  const { user } = useAuth();
  const { darkMode, setDarkMode } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState(240);
  const [defaultTitle, setDefaultTitle] = useState("Quest Session");
  const [defaultDescription, setDefaultDescription] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [timezoneMode, setTimezoneMode] = useState("auto");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [calendarIds, setCalendarIds] = useState([]);
  const [calendarNames, setCalendarNames] = useState({});
  const [availableCalendars, setAvailableCalendars] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState(null);
  const [calendarSyncPreference, setCalendarSyncPreference] = useState("poll");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [defaultTimes, setDefaultTimes] = useState({
    1: "18:00",
    2: "18:00",
    3: "18:00",
    4: "18:00",
    5: "18:00",
    6: "12:00",
    0: "12:00",
  });

  const userRef = useMemo(() => (user ? doc(db, "users", user.uid) : null), [user]);

  useEffect(() => {
    if (!userRef) return;
    setLoading(true);
    getDoc(userRef)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setDefaultDuration(data.settings?.defaultDurationMinutes ?? 240);
          setDefaultTitle(data.settings?.defaultTitle ?? "Quest Session");
          setDefaultDescription(data.settings?.defaultDescription ?? "");
          setEmailNotifications(data.settings?.emailNotifications ?? true);
          setDefaultTimes(data.settings?.defaultStartTimes ?? defaultTimes);
          setTimezoneMode(data.settings?.timezoneMode ?? "auto");
          setCalendarIds(data.settings?.googleCalendarIds ?? []);
          setCalendarNames(data.settings?.googleCalendarNames ?? {});
          setCalendarSyncPreference(data.calendarSyncPreference ?? "poll");
          setTimezone(
            data.settings?.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone
          );
          if (!data.settings?.googleCalendarIds && data.settings?.googleCalendarId) {
            setCalendarIds([data.settings.googleCalendarId]);
          }
          if (!data.settings?.googleCalendarNames && data.settings?.googleCalendarName) {
            setCalendarNames({ [data.settings.googleCalendarId]: data.settings.googleCalendarName });
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
        toast.error("Failed to load settings: " + err.message);
      })
      .finally(() => setLoading(false));
  }, [userRef]);

  const toggleCalendarSelection = (calendar) => {
    setCalendarIds((prev) => {
      const exists = prev.includes(calendar.id);
      const next = exists ? prev.filter((id) => id !== calendar.id) : [...prev, calendar.id];
      return next;
    });
    setCalendarNames((prev) => ({
      ...prev,
      [calendar.id]: calendar.summary || calendar.id,
    }));
  };

  const fetchCalendars = async () => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const functions = getFunctions();
      const listCalendars = httpsCallable(functions, "googleCalendarListCalendars");
      const payload = await listCalendars();
      const calendars = (payload.data?.items || [])
        .filter((item) => item.id)
        .sort((a, b) => {
          if (a.primary) return -1;
          if (b.primary) return 1;
          return (a.summary || "").localeCompare(b.summary || "");
        });
      setAvailableCalendars(calendars);

      if (!calendarIds.length && calendars.length > 0) {
        const primary = calendars.find((item) => item.primary) || calendars[0];
        setCalendarIds([primary.id]);
        setCalendarNames((prev) => ({
          ...prev,
          [primary.id]: primary.summary || primary.id,
        }));
      }
    } catch (err) {
      const message = err?.message || err?.details || "Failed to load calendars.";
      if (
        message.includes("Google Calendar not linked") ||
        message.includes("authorization expired")
      ) {
        try {
          const functions = getFunctions();
          const startAuth = httpsCallable(functions, "googleCalendarStartAuth");
          const response = await startAuth();
          const authUrl = response.data?.authUrl;
          if (authUrl) {
            window.location.assign(authUrl);
            return;
          }
        } catch (authErr) {
          console.error("Failed to start calendar auth:", authErr);
        }
      }
      console.error("Failed to load calendars:", err);
      setCalendarError(message);
      toast.error(message);
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userRef) return;
    setSaving(true);
    try {
      const primaryCalendarId = [...calendarIds].sort((a, b) => {
        const nameA = calendarNames[a] || a;
        const nameB = calendarNames[b] || b;
        return nameA.localeCompare(nameB);
      })[0];
      const primaryCalendarName = primaryCalendarId
        ? calendarNames[primaryCalendarId] || primaryCalendarId
        : null;

      await setDoc(
        userRef,
        {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          calendarSyncPreference,
          settings: {
            defaultDurationMinutes: Number(defaultDuration || 0),
            defaultTitle,
            defaultDescription,
            emailNotifications,
            defaultStartTimes: defaultTimes,
            timezoneMode,
            timezone,
            googleCalendarId: primaryCalendarId || null,
            googleCalendarName: primaryCalendarName,
            googleCalendarIds: calendarIds,
            googleCalendarNames: calendarNames,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await setDoc(
        doc(db, "usersPublic", user.uid),
        {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          emailNotifications,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setAvailableCalendars([]);
      setCalendarError(null);
      toast.success("Settings saved successfully");
    } catch (err) {
      console.error("Failed to save settings:", err);
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (deleteConfirm.trim() !== "DELETE") {
      toast.error('Type "DELETE" to confirm.');
      return;
    }
    setDeleteBusy(true);
    try {
      const functions = getFunctions();
      const deleteAccount = httpsCallable(functions, "deleteUserAccount");
      await deleteAccount();
      toast.success("Your account has been deleted.");
      setDeleteDialogOpen(false);
      setDeleteConfirm("");
      await signOutUser();
      navigate("/");
    } catch (err) {
      console.error("Failed to delete account:", err);
      toast.error(err?.message || "Failed to delete account.");
    } finally {
      setDeleteBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message="Loading settings..." />
      </div>
    );
  }

  return (
        <div className="rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-900 dark:shadow-slate-900/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">User Settings</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Defaults and notification preferences.
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

          <>
          <div className="mt-6 grid gap-6">
            <section className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Timezone</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Default timezone for scheduling new sessions.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="grid gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Mode</span>
                  <Select value={timezoneMode} onValueChange={setTimezoneMode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        Auto (browser) · {Intl.DateTimeFormat().resolvedOptions().timeZone}
                      </SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Timezone</span>
                  <Select
                    value={timezone}
                    onValueChange={setTimezone}
                    disabled={timezoneMode !== "manual"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
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
              </div>
            </section>
            <section className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Google Calendar
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Connect a calendar with edit permissions for automatic session entries.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={fetchCalendars}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  {calendarLoading ? "Loading..." : "Connect / Refresh calendars"}
                </button>
              {calendarIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCalendarIds([]);
                    setCalendarNames({});
                  }}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Unlink calendar
                </button>
              )}
              </div>
              {calendarError && (
                <p className="mt-2 text-xs text-red-500 dark:text-red-400">{calendarError}</p>
              )}
              {availableCalendars.length > 0 && (
                <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Select calendars to link</span>
                  <div className="grid gap-2">
                    {availableCalendars.map((calendar) => {
                      const selected = calendarIds.includes(calendar.id);
                      return (
                        <label
                          key={calendar.id}
                          className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-xs font-semibold transition-colors ${
                            selected
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-100"
                              : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          }`}
                        >
                          <span>
                            {calendar.summary || calendar.id}
                            {calendar.primary ? " (primary)" : ""}
                          </span>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleCalendarSelection(calendar)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {!availableCalendars.length && calendarIds.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {calendarIds.map((id) => (
                    <span
                      key={id}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      {calendarNames[id] || id}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  When calendar event differs from poll
                </span>
                <Select value={calendarSyncPreference} onValueChange={setCalendarSyncPreference}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="poll">Show poll data (what was voted on)</SelectItem>
                    <SelectItem value="calendar">Show Google Calendar data</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  If the calendar event was modified after finalization, choose which data to display on the dashboard.
                </p>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Default calendar entry</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Default title
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={defaultTitle}
                    onChange={(event) => setDefaultTitle(event.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Default duration (min)
                  <input
                    type="number"
                    min="30"
                    step="30"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={defaultDuration}
                    onChange={(event) => setDefaultDuration(event.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 md:col-span-2">
                  Default description
                  <textarea
                    className="mt-2 min-h-[80px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={defaultDescription}
                    onChange={(event) => setDefaultDescription(event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Default session start times
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Set the default start time per weekday (local time).
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4, 5, 6, 0].map((dayKey, index) => (
                  <label key={dayKey} className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {weekdayLabels[index]}
                    <input
                      type="time"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={defaultTimes[dayKey]}
                      onChange={(event) =>
                        setDefaultTimes((prev) => ({ ...prev, [dayKey]: event.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Notifications</h3>
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(event) => setEmailNotifications(event.target.checked)}
                />
                Email me when someone votes
              </label>
            </section>

            <section className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Appearance</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Choose your preferred color scheme.
              </p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-300">Dark mode</span>
                <Switch
                  checked={darkMode}
                  onCheckedChange={setDarkMode}
                  aria-label="Toggle dark mode"
                />
              </div>
            </section>

            <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 dark:border-rose-900/60 dark:bg-rose-900/20">
              <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-200">Delete profile</h3>
              <p className="mt-1 text-xs text-rose-600/90 dark:text-rose-200/80">
                This permanently removes your account, friend connections, questing group memberships,
                votes, and every session poll you have created.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-slate-950 dark:text-rose-200 dark:hover:bg-rose-900/40"
                >
                  Delete profile
                </button>
              </div>
            </section>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save settings"}
            </button>
          </div>

          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete your profile?</DialogTitle>
                <DialogDescription>
                  This action is permanent. It will remove your account, friends, questing group
                  memberships, votes, and all polls you created.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p>Type <span className="font-semibold text-rose-500">DELETE</span> to confirm.</p>
                <input
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  placeholder="DELETE"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm uppercase tracking-widest dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setDeleteDialogOpen(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteBusy}
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-60"
                >
                  {deleteBusy ? "Deleting..." : "Delete permanently"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        </div>
  );
}
