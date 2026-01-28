import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../app/AuthProvider";
import {
  registerWithEmailPassword,
  resetPassword,
  signInWithEmailPassword,
  signInWithGoogle,
  signInWithGoogleIdToken,
} from "../../lib/auth";
import { APP_NAME, GOOGLE_OAUTH_CLIENT_ID } from "../../lib/config";
import { startDiscordLogin } from "../../lib/data/discord";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

const tabs = [
  { id: "login", label: "Log in" },
  { id: "register", label: "Create account" },
];

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const PROVIDER_BUTTON_MIN_WIDTH = 240;
let googleScriptPromise = null;

function loadGoogleScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google sign-in is unavailable."));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (googleScriptPromise) {
    return googleScriptPromise;
  }
  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google sign-in.")),
        { once: true }
      );
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google sign-in."));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getAuthErrorMessage(error) {
  const code = error?.code || "";
  switch (code) {
    case "auth/email-already-in-use":
      return "This email is already registered. Please log in instead.";
    case "auth/account-exists-with-different-credential":
      return "An account with this email already exists. Log in first, then link Google from Settings.";
    case "auth/credential-already-in-use":
      return "This Google account is already linked to another account.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Invalid email or password.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup closed. Please try again.";
    case "auth/popup-blocked":
      return "Popup blocked. Please allow popups and try again.";
    default:
      return error?.message || "Something went wrong. Please try again.";
  }
}

export default function AuthPage() {
  const { banned } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleError, setGoogleError] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const googleButtonRef = useRef(null);
  const discordButtonRef = useRef(null);
  const fallbackGoogleRef = useRef(null);
  const providerWidthRef = useRef(null);
  const [providerWidth, setProviderWidth] = useState(null);

  const isRegister = activeTab === "register";
  const normalizedEmail = normalizeEmail(email);
  const showGoogleFallback = !GOOGLE_OAUTH_CLIENT_ID || googleError;

  const updateProviderWidth = useCallback(() => {
    const googleWidth = googleButtonRef.current?.getBoundingClientRect().width || 0;
    const discordWidth = discordButtonRef.current?.getBoundingClientRect().width || 0;
    const fallbackWidth = fallbackGoogleRef.current?.getBoundingClientRect().width || 0;
    const nextWidth = Math.max(
      googleWidth,
      discordWidth,
      fallbackWidth,
      PROVIDER_BUTTON_MIN_WIDTH
    );
    if (nextWidth && nextWidth !== providerWidthRef.current) {
      providerWidthRef.current = nextWidth;
      setProviderWidth(nextWidth);
    }
  }, []);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      toast.success("Signed in successfully.");
    } catch (error) {
      toast.error(getAuthErrorMessage(error));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleDiscordLogin = async () => {
    setDiscordLoading(true);
    try {
      const storedRedirect = localStorage.getItem("postLoginRedirect");
      const returnTo =
        storedRedirect && storedRedirect.startsWith("/") ? storedRedirect : "/dashboard";
      const authUrl = await startDiscordLogin(returnTo);
      if (!authUrl) {
        throw new Error("Missing Discord auth URL.");
      }
      window.location.href = authUrl;
    } catch (error) {
      console.error("Failed to start Discord login:", error);
      toast.error("Failed to start Discord login. Please try again.");
      setDiscordLoading(false);
    }
  };

  const handleGoogleCredential = useCallback(
    async (response) => {
      if (!response?.credential) {
        toast.error("Google sign-in did not return a credential.");
        return;
      }
      setGoogleLoading(true);
      try {
        await signInWithGoogleIdToken(response.credential);
        toast.success("Signed in successfully.");
      } catch (error) {
        toast.error(getAuthErrorMessage(error));
      } finally {
        setGoogleLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!GOOGLE_OAUTH_CLIENT_ID) {
      setGoogleError("Google sign-in is not configured.");
      return;
    }
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (!cancelled) setGoogleReady(true);
      })
      .catch((err) => {
        console.error("Failed to load Google sign-in:", err);
        if (!cancelled) setGoogleError("Google sign-in failed to load.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!googleReady || !googleButtonRef.current) return;
    if (!window.google?.accounts?.id) {
      setGoogleError("Google sign-in is unavailable.");
      return;
    }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      callback: handleGoogleCredential,
      auto_select: false,
      ux_mode: "popup",
      context: activeTab === "register" ? "signup" : "signin",
    });
    googleButtonRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "left",
    });
    requestAnimationFrame(() => updateProviderWidth());
  }, [googleReady, handleGoogleCredential, activeTab]);

  useEffect(() => {
    updateProviderWidth();
  }, [showGoogleFallback, updateProviderWidth]);

  useEffect(() => {
    const observers = [];
    const observe = (node) => {
      if (!node || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() => updateProviderWidth());
      observer.observe(node);
      observers.push(observer);
    };
    observe(googleButtonRef.current);
    observe(discordButtonRef.current);
    observe(fallbackGoogleRef.current);
    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [googleReady, showGoogleFallback, updateProviderWidth]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const error = params.get("error");
    if (!error) return;

    const errorMessages = {
      email_required:
        "Discord login requires a verified email address. Please verify your email in Discord settings or use another sign-in method.",
      discord_in_use: "That Discord account is already linked to another Quest Scheduler account.",
      email_conflict:
        "That email is already linked to another Discord account. Please log in with your existing method.",
      missing_token: "Discord sign-in could not be completed. Please try again.",
      discord_failed: "Discord sign-in failed. Please try again.",
      server_error: "Discord sign-in failed due to a server error. Please try again.",
      invalid_state: "Discord sign-in expired. Please try again.",
    };

    toast.error(errorMessages[error] || "Discord sign-in failed. Please try again.");
    params.delete("error");
    navigate(`/auth${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
  }, [location.search, navigate]);

  const handleEmailLogin = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signInWithEmailPassword(email, password);
      toast.success("Welcome back!");
    } catch (error) {
      toast.error(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailRegister = async (event) => {
    event.preventDefault();
    if (!acceptedTerms) {
      toast.error("Please accept the Terms and Privacy Policy to continue.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await registerWithEmailPassword(email, password);
      toast.success("Account created. Verification email sent.");
    } catch (error) {
      toast.error(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    setResetLoading(true);
    try {
      await resetPassword(resetEmail);
      toast.success("If an account exists with this email, you'll receive an email shortly.");
      setResetOpen(false);
      setResetEmail("");
    } catch (error) {
      toast.success("If an account exists with this email, you'll receive an email shortly.");
    } finally {
      setResetLoading(false);
    }
  };


  return (
    <div className="dark min-h-screen" style={{ colorScheme: "dark" }}>
      <div className="relative min-h-screen text-slate-100">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[url('/assets/background.jpeg')] bg-cover bg-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/35 via-slate-950/55 to-slate-950/75" />
        </div>
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <Link to="/" className="flex items-center gap-3">
            <img src="/app_icon.png" alt="Quest Scheduler Logo" className="h-10 w-10 rounded-xl object-contain" />
            <h1 className="text-xl font-display tracking-[0.18em] text-white drop-shadow-sm">
              {APP_NAME}
            </h1>
          </Link>
          <Link
            to="/"
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10"
          >
            Back to home
          </Link>
        </header>

        {banned && (
          <div className="mx-auto max-w-5xl px-6">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
              This account is suspended and cannot be re-registered. If you believe this is a mistake,
              contact support at support@questscheduler.cc.
            </div>
          </div>
        )}

        <main className="mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-16">
          <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-900 dark:shadow-slate-900/50">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                Welcome to Quest Scheduler
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Sign in to schedule a session or create a new account in seconds.
              </p>
            </div>

            <div className="mt-6 flex items-center gap-2 rounded-full bg-slate-100 p-1 text-sm dark:bg-slate-800">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                    activeTab === tab.id
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-4">
              {showGoogleFallback ? (
                <div
                  className="mx-auto flex justify-center"
                  style={{ width: providerWidth ? `${providerWidth}px` : "fit-content" }}
                >
                  <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={googleLoading}
                    ref={fallbackGoogleRef}
                    className="flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {googleLoading ? "Connecting..." : "Continue with Google"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="mx-auto flex justify-center"
                    style={{ width: providerWidth ? `${providerWidth}px` : "fit-content" }}
                  >
                    <div
                      ref={googleButtonRef}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-transparent"
                      style={{ colorScheme: "light" }}
                    />
                  </div>
                  {googleLoading && (
                    <span className="text-xs text-slate-400">Connecting...</span>
                  )}
                </div>
              )}
              <div
                className="mx-auto"
                style={{ width: providerWidth ? `${providerWidth}px` : "fit-content" }}
              >
                <button
                  type="button"
                  onClick={handleDiscordLogin}
                  disabled={discordLoading}
                  ref={discordButtonRef}
                  className="relative flex w-full items-center justify-center rounded-full bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752C4] disabled:opacity-60"
                >
                  <span className="absolute left-4 flex h-5 w-5 items-center justify-center">
                    <img src="/assets/Discord-Symbol-Blurple.svg" alt="" className="h-5 w-5" />
                  </span>
                  <span className="w-full text-center">
                    {discordLoading ? "Connecting..." : "Continue with Discord"}
                  </span>
                </button>
              </div>
              {googleError && (
                <p className="text-center text-xs text-amber-500">{googleError}</p>
              )}
              <p className="text-center text-xs text-slate-400">
                By continuing, you agree to our{" "}
                <Link to="/terms" className="font-semibold text-brand-primary hover:text-brand-primary/80">
                  Terms
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="font-semibold text-brand-primary hover:text-brand-primary/80">
                  Privacy Policy
                </Link>.
              </p>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span>{isRegister ? "Or create an account" : "Or log in with email"}</span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>

              <form
                onSubmit={isRegister ? handleEmailRegister : handleEmailLogin}
                className="grid gap-4"
              >
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </label>

                {isRegister && (
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Confirm password
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="••••••••"
                      required
                      minLength={6}
                    />
                  </label>
                )}

                {isRegister && (
                  <label className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(event) => setAcceptedTerms(event.target.checked)}
                      className="mt-0.5"
                      required
                    />
                    <span>
                      I agree to the{" "}
                      <Link to="/terms" className="font-semibold text-brand-primary hover:text-brand-primary/80">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link to="/privacy" className="font-semibold text-brand-primary hover:text-brand-primary/80">
                        Privacy Policy
                      </Link>.
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-60"
                >
                  {submitting
                    ? "Working..."
                    : isRegister
                      ? "Create account"
                      : "Log in"}
                </button>
              </form>

              {!isRegister && (
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(normalizedEmail);
                    setResetOpen(true);
                  }}
                  className="text-center text-xs font-semibold text-brand-primary hover:text-brand-primary/80"
                >
                  Forgot password?
                </button>
              )}
            </div>
          </div>
        </main>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter the email for your account. We'll email you if a reset is available.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <input
              type="email"
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              required
            />
            <DialogFooter>
              <button
                type="button"
                onClick={() => setResetOpen(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetLoading}
                className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-60"
              >
                {resetLoading ? "Sending..." : "Send reset email"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
