import { EmailAuthProvider, linkWithCredential, updateProfile } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useAuth } from "../../app/useAuth";
import { useTheme } from "../../app/useTheme";
import { db, storage } from "../../lib/firebase";
import { linkGoogleAccount, resendVerificationEmail, signOutUser } from "../../lib/auth";
import { startDiscordOAuth, unlinkDiscordAccount } from "../../lib/data/discord";
import { registerQsUsername } from "../../lib/data/usernames";
import { buildPublicIdentifier } from "../../lib/identity";
import { LoadingState } from "../../components/ui/spinner";
import { Switch } from "../../components/ui/switch";
import { UserIdentity } from "../../components/UserIdentity";
import { UserAvatar } from "../../components/ui/avatar";
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
const defaultPerDayDefaults = {
  1: { time: "18:00", durationMinutes: 240 },
  2: { time: "18:00", durationMinutes: 240 },
  3: { time: "18:00", durationMinutes: 240 },
  4: { time: "18:00", durationMinutes: 240 },
  5: { time: "18:00", durationMinutes: 240 },
  6: { time: "12:00", durationMinutes: 240 },
  0: { time: "12:00", durationMinutes: 240 },
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_MAX_DIMENSION = 512;

function upgradeGooglePhotoUrl(url, size = 256) {
  if (!url) return null;
  if (url.includes("?sz=")) {
    return url.replace(/\?sz=\d+/, `?sz=${size}`);
  }
  return url.replace(/\/s\d+-c\//, `/s${size}-c/`);
}

function buildDiscordAvatarUrl(userId, avatarHash, size = 256) {
  if (!userId) return null;
  if (!avatarHash) {
    try {
      const index = Number((BigInt(userId) >> 22n) % 6n);
      return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    } catch {
      return null;
    }
  }
  const isAnimated = String(avatarHash).startsWith("a_");
  const ext = isAnimated ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
}

async function resizeAvatarFile(file) {
  if (!file) return null;
  const bitmap = await createImageBitmap(file);
  const maxDimension = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, AVATAR_MAX_DIMENSION / maxDimension);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  const type =
    file.type === "image/png"
      ? "image/png"
      : file.type === "image/webp"
        ? "image/webp"
        : "image/jpeg";
  const blob = await new Promise((resolve) =>
    canvas.toBlob((result) => resolve(result), type, 0.92)
  );
  return { blob, type };
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { darkMode, setDarkMode } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [defaultDuration, setDefaultDuration] = useState(240);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [qsUsernameInput, setQsUsernameInput] = useState("");
  const [qsUsernameCurrent, setQsUsernameCurrent] = useState("");
  const [qsUsernameSaving, setQsUsernameSaving] = useState(false);
  const [publicIdentifierType, setPublicIdentifierType] = useState("email");
  const [timezoneMode, setTimezoneMode] = useState("auto");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [calendarIds, setCalendarIds] = useState([]);
  const [calendarNames, setCalendarNames] = useState({});
  const [availableCalendars, setAvailableCalendars] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState(null);
  const [linkedCalendarEmail, setLinkedCalendarEmail] = useState(null);
  const [calendarSyncPreference, setCalendarSyncPreference] = useState("poll");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [discordInfo, setDiscordInfo] = useState(null);
  const [avatarSource, setAvatarSource] = useState("google");
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState("");
  const [discordLinking, setDiscordLinking] = useState(false);
  const [discordUnlinking, setDiscordUnlinking] = useState(false);
  const [googleLinking, setGoogleLinking] = useState(false);
  const [verificationSending, setVerificationSending] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordConfirmValue, setPasswordConfirmValue] = useState("");
  const [passwordLinking, setPasswordLinking] = useState(false);
  const [sessionDefaultsMode, setSessionDefaultsMode] = useState("simple");
  const [simpleStartTime, setSimpleStartTime] = useState("18:00");
  const [perDayDefaults, setPerDayDefaults] = useState(defaultPerDayDefaults);
  const [usernameConfirmOpen, setUsernameConfirmOpen] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState(null);

  const userRef = useMemo(() => (user ? doc(db, "users", user.uid) : null), [user]);
  const providerData = user?.providerData || [];
  const hasPasswordProvider = providerData.some((provider) => provider.providerId === "password");
  const googleProviderEmail =
    providerData.find((provider) => provider.providerId === "google.com")?.email || null;
  const googleProviderPhotoUrl =
    providerData.find((provider) => provider.providerId === "google.com")?.photoURL || null;
  const googleAvatarUrl = googleProviderPhotoUrl
    ? upgradeGooglePhotoUrl(googleProviderPhotoUrl, 256)
    : null;
  const googleEmailMismatch =
    googleProviderEmail &&
    user?.email &&
    googleProviderEmail.toLowerCase() !== user.email.toLowerCase();
  const calendarEmailMismatch =
    linkedCalendarEmail &&
    user?.email &&
    linkedCalendarEmail.toLowerCase() !== user.email.toLowerCase();
  const canUnlinkDiscord = hasPasswordProvider || Boolean(googleProviderEmail);
  const discordAvatarUrl = useMemo(() => {
    if (!discordInfo?.userId) return null;
    return buildDiscordAvatarUrl(discordInfo.userId, discordInfo.avatarHash, 256);
  }, [discordInfo]);
  const resolvedAvatarUrl = useMemo(() => {
    if (avatarSource === "custom") return customAvatarUrl || null;
    if (avatarSource === "discord") return discordAvatarUrl || null;
    if (avatarSource === "google") return googleAvatarUrl || null;
    return customAvatarUrl || discordAvatarUrl || googleAvatarUrl || user?.photoURL || null;
  }, [avatarSource, customAvatarUrl, discordAvatarUrl, googleAvatarUrl, user?.photoURL]);

  useEffect(() => {
    if (!userRef) return;
    setLoading(true);
    getDoc(userRef)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setDisplayName(data.displayName || user?.displayName || "");
          setDefaultDuration(data.settings?.defaultDurationMinutes ?? 240);
          setEmailNotifications(data.settings?.emailNotifications ?? true);
          setTimezoneMode(data.settings?.timezoneMode ?? "auto");

          // Load session defaults mode and values
          const savedMode = data.settings?.sessionDefaultsMode ?? "simple";
          setSessionDefaultsMode(savedMode);
          setSimpleStartTime(data.settings?.defaultStartTime ?? "18:00");

          // Handle defaultStartTimes - migrate old string format to new object format
          const savedStartTimes = data.settings?.defaultStartTimes;
          if (savedStartTimes) {
            const migrated = {};
            const globalDuration = data.settings?.defaultDurationMinutes ?? 240;
            for (const [key, val] of Object.entries(savedStartTimes)) {
              if (typeof val === "string") {
                // Old format: just a time string - migrate to object
                migrated[key] = { time: val, durationMinutes: globalDuration };
              } else if (val && typeof val === "object") {
                // New format: object with time and durationMinutes
                migrated[key] = val;
              }
            }
            setPerDayDefaults({ ...defaultPerDayDefaults, ...migrated });
          }
          setCalendarIds(data.settings?.googleCalendarIds ?? []);
          setCalendarNames(data.settings?.googleCalendarNames ?? {});
          setCalendarSyncPreference(data.calendarSyncPreference ?? "poll");
          setTimezone(
            data.settings?.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone
          );
          setLinkedCalendarEmail(data.settings?.linkedCalendarEmail || null);
          if (!data.settings?.googleCalendarIds && data.settings?.googleCalendarId) {
            setCalendarIds([data.settings.googleCalendarId]);
          }
          if (!data.settings?.googleCalendarNames && data.settings?.googleCalendarName) {
            setCalendarNames({ [data.settings.googleCalendarId]: data.settings.googleCalendarName });
          }
          setDiscordInfo(data.discord || null);
          setCustomAvatarUrl(data.customAvatarUrl || "");
          setQsUsernameInput(data.qsUsername || "");
          setQsUsernameCurrent(data.qsUsername || "");
          setPublicIdentifierType(data.publicIdentifierType || "email");
          const nextAvatarSource = data.avatarSource || null;
          if (nextAvatarSource) {
            setAvatarSource(nextAvatarSource);
          } else if (data.customAvatarUrl) {
            setAvatarSource("custom");
          } else if (googleAvatarUrl) {
            setAvatarSource("google");
          } else if (data.discord?.userId) {
            setAvatarSource("discord");
          } else {
            setAvatarSource("custom");
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
        toast.error("Failed to load settings: " + err.message);
      })
      .finally(() => setLoading(false));
  }, [userRef, user, googleAvatarUrl]);

  useEffect(() => {
    if (!user) return;
    setDisplayName((prev) => prev || user.displayName || "");
  }, [user]);

  useEffect(() => {
    if (avatarSource === "google" && !googleAvatarUrl) {
      setAvatarSource(discordAvatarUrl ? "discord" : "custom");
    }
    if (avatarSource === "discord" && !discordAvatarUrl) {
      setAvatarSource(googleAvatarUrl ? "google" : "custom");
    }
  }, [avatarSource, googleAvatarUrl, discordAvatarUrl]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("discord") === "linked") {
      toast.success("Discord linked successfully");
      params.delete("discord");
      const query = params.toString();
      navigate(`/settings${query ? `?${query}` : ""}`, { replace: true });
    }
    if (params.get("discord") === "failed") {
      toast.error("Discord linking failed. Please try again.");
      params.delete("discord");
      const query = params.toString();
      navigate(`/settings${query ? `?${query}` : ""}`, { replace: true });
    }
  }, [navigate]);

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

  const handleDiscordLink = async () => {
    setDiscordLinking(true);
    try {
      const authUrl = await startDiscordOAuth();
      if (authUrl) {
        window.location.assign(authUrl);
        return;
      }
      toast.error("Failed to start Discord linking.");
    } catch (err) {
      console.error("Failed to start Discord auth:", err);
      toast.error(err?.message || "Failed to start Discord linking.");
    } finally {
      setDiscordLinking(false);
    }
  };

  const handleDiscordUnlink = async () => {
    setDiscordUnlinking(true);
    try {
      await unlinkDiscordAccount();
      setDiscordInfo(null);
      if (publicIdentifierType === "discordUsername") {
        const nextType = qsUsernameInput.trim() ? "qsUsername" : "email";
        setPublicIdentifierType(nextType);
      }
      toast.success("Discord account unlinked.");
    } catch (err) {
      console.error("Failed to unlink Discord:", err);
      toast.error(err?.message || "Failed to unlink Discord.");
    } finally {
      setDiscordUnlinking(false);
    }
  };

  const handleAvatarUpload = async (event) => {
    if (!user) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUploadError("");
    if (!file.type.startsWith("image/")) {
      setAvatarUploadError("Please upload a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarUploadError("Image must be under 2 MB.");
      return;
    }
    setAvatarUploading(true);
    try {
      const resized = await resizeAvatarFile(file);
      if (!resized?.blob) {
        throw new Error("Unable to process that image.");
      }
      const ext =
        resized.type === "image/png" ? "png" : resized.type === "image/webp" ? "webp" : "jpg";
      const avatarRef = ref(storage, `profiles/${user.uid}/avatar.${ext}`);
      await uploadBytes(avatarRef, resized.blob, { contentType: resized.type });
      const url = await getDownloadURL(avatarRef);
      setCustomAvatarUrl(url);
      setAvatarSource("custom");
      toast.success("Custom avatar uploaded. Save settings to apply.");
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setAvatarUploadError("Failed to upload avatar. Try another file.");
    } finally {
      setAvatarUploading(false);
      event.target.value = "";
    }
  };

  const handleRemoveCustomAvatar = async () => {
    if (!user) return;
    if (!customAvatarUrl) {
      setAvatarSource(googleAvatarUrl ? "google" : discordInfo?.userId ? "discord" : "custom");
      return;
    }
    setAvatarUploading(true);
    try {
      const possibleExt = ["jpg", "png", "webp"];
      await Promise.all(
        possibleExt.map((ext) =>
          deleteObject(ref(storage, `profiles/${user.uid}/avatar.${ext}`)).catch(() => null)
        )
      );
      setCustomAvatarUrl("");
      const nextSource = googleAvatarUrl
        ? "google"
        : discordInfo?.userId
          ? "discord"
          : "custom";
      setAvatarSource(nextSource);
      toast.success("Custom avatar removed. Save settings to apply.");
    } catch (err) {
      console.error("Failed to remove custom avatar:", err);
      toast.error("Failed to remove custom avatar.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAddPassword = async () => {
    if (!user?.email) {
      toast.error("Email is required to add a password.");
      return;
    }
    if (passwordValue.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (passwordValue !== passwordConfirmValue) {
      toast.error("Passwords do not match.");
      return;
    }
    setPasswordLinking(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, passwordValue);
      await linkWithCredential(user, credential);
      toast.success("Password added.");
      setPasswordDialogOpen(false);
      setPasswordValue("");
      setPasswordConfirmValue("");
      await refreshUser();
    } catch (err) {
      console.error("Failed to add password:", err);
      toast.error(err?.message || "Failed to add password.");
    } finally {
      setPasswordLinking(false);
    }
  };

  const handleGoogleLink = async () => {
    setGoogleLinking(true);
    try {
      await linkGoogleAccount();
      await refreshUser();
      toast.success("Google account linked.");
    } catch (err) {
      const code = err?.code || "";
      const message =
        code === "auth/credential-already-in-use"
          ? "This Google account is already linked to another Quest Scheduler account."
          : code === "auth/account-exists-with-different-credential"
            ? "This email already has a different sign-in method. Log in first, then link Google."
            : err?.message || "Failed to link Google account.";
      toast.error(message);
    } finally {
      setGoogleLinking(false);
    }
  };

  const handleResendVerification = async () => {
    setVerificationSending(true);
    try {
      await resendVerificationEmail();
      toast.success("Verification email sent.");
    } catch (err) {
      toast.error(err?.message || "Failed to send verification email.");
    } finally {
      setVerificationSending(false);
    }
  };

  const handleRefreshVerification = async () => {
    try {
      const refreshed = await refreshUser();
      if (refreshed?.emailVerified) {
        toast.success("Email verified!");
      } else {
        toast("Still not verified. Check your inbox.");
      }
    } catch (err) {
      toast.error(err?.message || "Failed to refresh verification status.");
    }
  };

  const handleSave = async (skipUsernameConfirmation = false) => {
    if (!userRef) return;
    const normalizedDisplayName = displayName.trim() || user?.displayName || null;
    const nextQsUsername = qsUsernameInput.trim().replace(/^@/, "").toLowerCase();

    // Show confirmation dialog if setting username for the first time
    const isSettingNewUsername = nextQsUsername && !qsUsernameCurrent && !skipUsernameConfirmation;
    if (isSettingNewUsername) {
      setPendingSaveData({ normalizedDisplayName, nextQsUsername });
      setUsernameConfirmOpen(true);
      return;
    }

    setSaving(true);
    try {
      if (nextQsUsername && nextQsUsername !== qsUsernameCurrent) {
        setQsUsernameSaving(true);
        await registerQsUsername(nextQsUsername);
        setQsUsernameCurrent(nextQsUsername);
        setQsUsernameInput(nextQsUsername);
      }
      const primaryCalendarId = [...calendarIds].sort((a, b) => {
        const nameA = calendarNames[a] || a;
        const nameB = calendarNames[b] || b;
        return nameA.localeCompare(nameB);
      })[0];
      const primaryCalendarName = primaryCalendarId
        ? calendarNames[primaryCalendarId] || primaryCalendarId
        : null;
      const publicIdentifier = buildPublicIdentifier({
        publicIdentifierType,
        qsUsername: nextQsUsername || qsUsernameCurrent,
        discordUsername: discordInfo?.username || null,
        email: user.email?.toLowerCase() || null,
      });

      // Prepare session defaults for save
      const sessionDefaultsToSave =
        sessionDefaultsMode === "simple"
          ? // Simple mode: all days use the same time and global duration
            Object.fromEntries(
              [0, 1, 2, 3, 4, 5, 6].map((day) => [
                day,
                { time: simpleStartTime, durationMinutes: Number(defaultDuration || 240) },
              ])
            )
          : // Per-day mode: save each day's individual settings
            perDayDefaults;

      await setDoc(
        userRef,
        {
          email: user.email?.toLowerCase(),
          ...(normalizedDisplayName ? { displayName: normalizedDisplayName } : {}),
          photoURL: resolvedAvatarUrl || null,
          avatarSource,
          customAvatarUrl: customAvatarUrl || null,
          calendarSyncPreference,
          publicIdentifierType,
          settings: {
            defaultDurationMinutes: Number(defaultDuration || 0),
            emailNotifications,
            sessionDefaultsMode,
            defaultStartTime: simpleStartTime,
            defaultStartTimes: sessionDefaultsToSave,
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
          email: user.email?.toLowerCase(),
          ...(normalizedDisplayName ? { displayName: normalizedDisplayName } : {}),
          photoURL: resolvedAvatarUrl || null,
          emailNotifications,
          publicIdentifierType,
          publicIdentifier,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (normalizedDisplayName && user.displayName !== normalizedDisplayName) {
        await updateProfile(user, { displayName: normalizedDisplayName });
        await refreshUser();
      }
      if ((resolvedAvatarUrl || null) !== (user.photoURL || null)) {
        await updateProfile(user, { photoURL: resolvedAvatarUrl || null });
        await refreshUser();
      }
      if (normalizedDisplayName) {
        setDisplayName(normalizedDisplayName);
      }
      setAvailableCalendars([]);
      setCalendarError(null);
      toast.success("Settings saved successfully");
    } catch (err) {
      console.error("Failed to save settings:", err);
      toast.error(err.message || "Failed to save settings");
    } finally {
      setQsUsernameSaving(false);
      setSaving(false);
    }
  };

  const handleUsernameConfirm = () => {
    setUsernameConfirmOpen(false);
    setPendingSaveData(null);
    handleSave(true);
  };

  const handleUsernameCancel = () => {
    setUsernameConfirmOpen(false);
    setPendingSaveData(null);
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

      <div className="mt-6 grid gap-6">
            <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Account</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Manage your display name, sign-in methods, and verification status.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Display name
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </label>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Email
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    {user?.email}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-600 dark:text-slate-200">Email status</span>
                {user?.emailVerified ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-100">
                    Verified
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-100">
                    Unverified
                  </span>
                )}
                {hasPasswordProvider && !user?.emailVerified && (
                  <>
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={verificationSending}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {verificationSending ? "Sending..." : "Resend email"}
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshVerification}
                      className="rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90"
                    >
                      Refresh status
                    </button>
                  </>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-600 dark:text-slate-200">Sign-in methods</span>
                {hasPasswordProvider && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    Email + Password
                  </span>
                )}
                {!hasPasswordProvider && (
                  <button
                    type="button"
                    onClick={() => setPasswordDialogOpen(true)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Add password
                  </button>
                )}
                {googleProviderEmail && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-100">
                    Google ({googleProviderEmail})
                  </span>
                )}
                {googleEmailMismatch && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-200">
                    Google account differs from login email.
                  </span>
                )}
                {!googleProviderEmail && (
                  <button
                    type="button"
                    onClick={handleGoogleLink}
                    disabled={googleLinking}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {googleLinking ? "Linking..." : "Link Google account"}
                  </button>
                )}
                {discordInfo?.userId && (
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700 dark:border-indigo-700/60 dark:bg-indigo-900/30 dark:text-indigo-100">
                    Discord ({discordInfo.globalName || discordInfo.username || "linked"})
                  </span>
                )}
                {discordInfo?.userId ? (
                  <button
                    type="button"
                    onClick={handleDiscordUnlink}
                    disabled={!canUnlinkDiscord || discordUnlinking}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    title={
                      canUnlinkDiscord
                        ? ""
                        : "Link Google or add a password before unlinking Discord."
                    }
                  >
                    {discordUnlinking ? "Unlinking..." : "Unlink Discord"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDiscordLink}
                    disabled={discordLinking}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {discordLinking ? "Linking..." : "Link Discord"}
                  </button>
                )}
                {discordInfo?.userId && !canUnlinkDiscord && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-200">
                    Add Google or a password before unlinking Discord.
                  </span>
                )}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Profile Picture
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Choose which avatar other players see, or upload your own.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <UserAvatar
                  email={user?.email}
                  src={resolvedAvatarUrl || user?.photoURL || null}
                  size={56}
                />
                <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    Current source
                  </span>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="avatarSource"
                        value="google"
                        disabled={!googleAvatarUrl}
                        checked={avatarSource === "google"}
                        onChange={() => setAvatarSource("google")}
                      />
                      Google
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="avatarSource"
                        value="discord"
                        disabled={!discordAvatarUrl}
                        checked={avatarSource === "discord"}
                        onChange={() => setAvatarSource("discord")}
                      />
                      Discord
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="avatarSource"
                        value="custom"
                        checked={avatarSource === "custom"}
                        onChange={() => setAvatarSource("custom")}
                      />
                      Custom upload
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      id="avatar-upload"
                      disabled={avatarUploading}
                    />
                    <label
                      htmlFor="avatar-upload"
                      className="cursor-pointer rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {avatarUploading ? "Uploading..." : "Upload image"}
                    </label>
                    {customAvatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveCustomAvatar}
                        disabled={avatarUploading}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Remove custom
                      </button>
                    )}
                  </div>
                  {avatarUploadError && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-200">
                      {avatarUploadError}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400">
                    Changes apply after saving settings.
                  </span>
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Your Identity
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Choose how other players identify you. Your public identifier is shown alongside your
                display name.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Quest Scheduler username
                  <input
                    value={qsUsernameInput}
                    onChange={(event) => setQsUsernameInput(event.target.value)}
                    placeholder="questmaster"
                    disabled={Boolean(qsUsernameCurrent)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
                  />
                  <span className="mt-2 block text-[11px] text-slate-400 dark:text-slate-500">
                    {qsUsernameCurrent
                      ? "Username cannot be changed once set."
                      : "3-20 characters, start with a letter, lowercase letters/numbers/underscores only. Cannot be changed later."}
                  </span>
                </label>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Public identifier
                  <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="publicIdentifier"
                        value="email"
                        checked={publicIdentifierType === "email"}
                        onChange={() => setPublicIdentifierType("email")}
                      />
                      Email ({user?.email})
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="publicIdentifier"
                        value="discordUsername"
                        disabled={!discordInfo?.username}
                        checked={publicIdentifierType === "discordUsername"}
                        onChange={() => setPublicIdentifierType("discordUsername")}
                      />
                      Discord username ({discordInfo?.username || "link Discord to enable"})
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="publicIdentifier"
                        value="qsUsername"
                        disabled={!qsUsernameInput.trim()}
                        checked={publicIdentifierType === "qsUsername"}
                        onChange={() => setPublicIdentifierType("qsUsername")}
                      />
                      Quest Scheduler username (@{qsUsernameInput.trim() || "set a username"})
                    </label>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                Preview:{" "}
                <UserIdentity
                  user={{
                    displayName: displayName || user?.displayName || null,
                    publicIdentifier: buildPublicIdentifier({
                      publicIdentifierType,
                      qsUsername: qsUsernameInput.trim().replace(/^@/, "").toLowerCase(),
                      discordUsername: discordInfo?.username || null,
                      email: user?.email?.toLowerCase() || null,
                    }),
                    publicIdentifierType,
                    qsUsername: qsUsernameInput.trim().replace(/^@/, "").toLowerCase(),
                    discordUsername: discordInfo?.username || null,
                    email: user?.email?.toLowerCase() || null,
                  }}
                />
              </div>
              {qsUsernameSaving && (
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Saving username...
                </p>
              )}
            </section>
            <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
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
            <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Google Calendar
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Connect a calendar with edit permissions for automatic session entries.
              </p>
              {linkedCalendarEmail && (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Linked calendar account: <span className="font-semibold">{linkedCalendarEmail}</span>
                  {calendarEmailMismatch && (
                    <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-200">
                      Different from login email.
                    </span>
                  )}
                </div>
              )}
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
            <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Default session settings
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Set default start time and duration for new session slots.
              </p>

              {/* Tab switcher */}
              <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setSessionDefaultsMode("simple")}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    sessionDefaultsMode === "simple"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => setSessionDefaultsMode("perDay")}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    sessionDefaultsMode === "perDay"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  Per-day
                </button>
              </div>

              {/* Simple mode */}
              {sessionDefaultsMode === "simple" && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Default start time
                    <input
                      type="time"
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={simpleStartTime}
                      onChange={(event) => setSimpleStartTime(event.target.value)}
                    />
                  </label>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Default duration
                    <div className="mt-2 flex gap-2">
                      <div className="flex-1">
                        <select
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          value={Math.floor(defaultDuration / 60)}
                          onChange={(event) => {
                            const hours = Number(event.target.value);
                            const mins = defaultDuration % 60;
                            setDefaultDuration(hours * 60 + mins);
                          }}
                        >
                          {[...Array(13)].map((_, i) => (
                            <option key={i} value={i}>{i}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[10px] text-slate-400">hours</span>
                      </div>
                      <div className="flex-1">
                        <select
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          value={defaultDuration % 60}
                          onChange={(event) => {
                            const hours = Math.floor(defaultDuration / 60);
                            const mins = Number(event.target.value);
                            setDefaultDuration(hours * 60 + mins);
                          }}
                        >
                          {[0, 15, 30, 45].map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[10px] text-slate-400">minutes</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 sm:col-span-2">
                    This time and duration will apply to all days of the week.
                  </p>
                </div>
              )}

              {/* Per-day mode */}
              {sessionDefaultsMode === "perDay" && (
                <div className="mt-4">
                  <div className="grid gap-2">
                    {[1, 2, 3, 4, 5, 6, 0].map((dayKey, index) => (
                      <div
                        key={dayKey}
                        className="grid grid-cols-[80px_1fr_1fr] items-center gap-3 rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
                      >
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {weekdayLabels[index]}
                        </span>
                        <input
                          type="time"
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          value={perDayDefaults[dayKey]?.time || "18:00"}
                          onChange={(event) =>
                            setPerDayDefaults((prev) => ({
                              ...prev,
                              [dayKey]: { ...prev[dayKey], time: event.target.value },
                            }))
                          }
                        />
                        <div className="flex items-center gap-1">
                          <select
                            className="w-14 rounded-lg border border-slate-200 px-1 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            value={Math.floor((perDayDefaults[dayKey]?.durationMinutes || 240) / 60)}
                            onChange={(event) => {
                              const hours = Number(event.target.value);
                              const mins = (perDayDefaults[dayKey]?.durationMinutes || 240) % 60;
                              setPerDayDefaults((prev) => ({
                                ...prev,
                                [dayKey]: { ...prev[dayKey], durationMinutes: hours * 60 + mins },
                              }));
                            }}
                          >
                            {[...Array(13)].map((_, i) => (
                              <option key={i} value={i}>{i}</option>
                            ))}
                          </select>
                          <span className="text-[10px] text-slate-400">h</span>
                          <select
                            className="w-14 rounded-lg border border-slate-200 px-1 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            value={(perDayDefaults[dayKey]?.durationMinutes || 240) % 60}
                            onChange={(event) => {
                              const hours = Math.floor((perDayDefaults[dayKey]?.durationMinutes || 240) / 60);
                              const mins = Number(event.target.value);
                              setPerDayDefaults((prev) => ({
                                ...prev,
                                [dayKey]: { ...prev[dayKey], durationMinutes: hours * 60 + mins },
                              }));
                            }}
                          >
                            {[0, 15, 30, 45].map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <span className="text-[10px] text-slate-400">m</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
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

            <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
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

          <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a password</DialogTitle>
                <DialogDescription>
                  Set a password to enable email/password login alongside your other sign-in methods.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleAddPassword();
                }}
                className="space-y-4"
              >
                <input
                  type="password"
                  value={passwordValue}
                  onChange={(event) => setPasswordValue(event.target.value)}
                  placeholder="New password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  minLength={6}
                  required
                />
                <input
                  type="password"
                  value={passwordConfirmValue}
                  onChange={(event) => setPasswordConfirmValue(event.target.value)}
                  placeholder="Confirm password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  minLength={6}
                  required
                />
                <DialogFooter>
                  <button
                    type="button"
                    onClick={() => setPasswordDialogOpen(false)}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={passwordLinking}
                    className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-60"
                  >
                    {passwordLinking ? "Saving..." : "Add password"}
                  </button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={usernameConfirmOpen} onOpenChange={setUsernameConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm your username</DialogTitle>
                <DialogDescription>
                  Your Quest Scheduler username will be set to{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    @{pendingSaveData?.nextQsUsername}
                  </span>
                  . This cannot be changed later.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button
                  type="button"
                  onClick={handleUsernameCancel}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUsernameConfirm}
                  className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                >
                  Confirm
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
    </div>
  );
}
