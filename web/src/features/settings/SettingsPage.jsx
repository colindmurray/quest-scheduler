import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { useTheme } from "../../app/ThemeProvider";
import { db } from "../../lib/firebase";
import { isValidEmail } from "../../lib/utils";
import { LoadingState } from "../../components/ui/spinner";
import { Switch } from "../../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

 

export default function SettingsPage() {
  const { user } = useAuth();
  const { darkMode, setDarkMode } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [addressBook, setAddressBook] = useState([]);
  const [addressInput, setAddressInput] = useState("");
  const [addressError, setAddressError] = useState(null);
  const [defaultDuration, setDefaultDuration] = useState(240);
  const [defaultTitle, setDefaultTitle] = useState("D&D Session");
  const [defaultDescription, setDefaultDescription] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [timezoneMode, setTimezoneMode] = useState("auto");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
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
          setAddressBook(data.addressBook || []);
          setDefaultDuration(data.settings?.defaultDurationMinutes ?? 240);
          setDefaultTitle(data.settings?.defaultTitle ?? "D&D Session");
          setDefaultDescription(data.settings?.defaultDescription ?? "");
          setEmailNotifications(data.settings?.emailNotifications ?? true);
          setDefaultTimes(data.settings?.defaultStartTimes ?? defaultTimes);
          setTimezoneMode(data.settings?.timezoneMode ?? "auto");
          setTimezone(
            data.settings?.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone
          );
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userRef]);

  const handleSave = async () => {
    if (!userRef) return;
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        userRef,
        {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          addressBook,
          settings: {
            defaultDurationMinutes: Number(defaultDuration || 0),
            defaultTitle,
            defaultDescription,
            emailNotifications,
            defaultStartTimes: defaultTimes,
            timezoneMode,
            timezone,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      setError(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const addAddress = () => {
    const normalized = addressInput.trim().toLowerCase();
    if (!normalized) return;
    if (!isValidEmail(normalized)) {
      setAddressError("Enter a valid email address.");
      return;
    }
    setAddressBook((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setAddressInput("");
    setAddressError(null);
  };

  const removeAddress = (email) => {
    setAddressBook((prev) => prev.filter((item) => item !== email));
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
                Address book, defaults, and notification preferences.
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
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Address book</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Add one email at a time. Click an entry to remove it.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {addressBook.length === 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">No friends yet.</span>
                )}
                {addressBook.map((email) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => removeAddress(email)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-red-900/30 dark:hover:border-red-800 dark:hover:text-red-300"
                    title="Remove"
                  >
                    {email} ✕
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Add a friend email"
                  value={addressInput}
                  onChange={(event) => setAddressInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addAddress();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addAddress}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  Add
                </button>
              </div>
              {addressError && (
                <p className="mt-2 text-xs text-red-500 dark:text-red-400">{addressError}</p>
              )}
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
          </div>

          {error && <p className="mt-4 text-sm text-red-500 dark:text-red-400">{error}</p>}

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
        </div>
  );
}
