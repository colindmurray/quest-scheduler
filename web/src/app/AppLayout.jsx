import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Settings, LogOut, Users, Bot, MessageSquare } from "lucide-react";
import { useAuth } from "./useAuth";
import { signOutUser } from "../lib/auth";
import { UserAvatar } from "../components/ui/avatar";
import { NotificationBell } from "../components/ui/notification-bell";
import { useNotificationSync } from "../hooks/useNotificationSync";
import VerificationBanner from "../components/VerificationBanner";
import FeedbackForm from "../components/feedback-form";
import {
  SimpleModal,
  SimpleModalDescription,
  SimpleModalHeader,
  SimpleModalTitle,
} from "../components/ui/simple-modal";
import { cn } from "../lib/utils";

export default function AppLayout({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const accountTriggerRef = useRef(null);
  useNotificationSync();

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const handleClick = (event) => {
      if (accountMenuRef.current?.contains(event.target)) return;
      if (accountTriggerRef.current?.contains(event.target)) return;
      setAccountMenuOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [accountMenuOpen]);

  return (
    <div className="relative min-h-full text-slate-900 dark:text-slate-100">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[url('/assets/app-bg-light.jpeg')] bg-cover bg-center" />
        <div className="absolute inset-0 hidden bg-[url('/assets/app-bg-dark.jpeg')] bg-cover bg-center dark:block" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-white/60 to-white/80 dark:from-slate-950/45 dark:via-slate-950/65 dark:to-slate-950/85" />
      </div>
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <img src="/app_icon.png" alt="Quest Scheduler Logo" className="h-9 w-9 rounded-xl object-contain" />
            <div>
              <p className="text-sm font-semibold">Quest Scheduler</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <a
              href="https://buymeacoffee.com/murraycolii"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex"
            >
              <img
                src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                className="h-8 w-auto"
                alt="Buy Me A Coffee"
              />
            </a>
            <NotificationBell />
            <div className="relative">
              <button
                ref={accountTriggerRef}
                type="button"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-2 py-1 text-sm font-semibold transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <UserAvatar user={user} email={user?.email} src={user?.photoURL} size={32} />
                <span className="hidden text-slate-600 dark:text-slate-300 sm:inline">
                  Account
                </span>
              </button>
              {accountMenuOpen && (
                <div
                  ref={accountMenuRef}
                  role="menu"
                  className={cn(
                    "absolute right-0 mt-2 w-48 rounded-2xl border border-slate-200 bg-white p-2 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-800"
                  )}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      navigate("/friends");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:bg-slate-50 dark:hover:bg-slate-700 dark:focus:bg-slate-700"
                  >
                    <Users className="h-4 w-4" />
                    Friends & Groups
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      navigate("/discord-bot");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:bg-slate-50 dark:hover:bg-slate-700 dark:focus:bg-slate-700"
                  >
                    <Bot className="h-4 w-4" />
                    Add Discord bot
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      navigate("/settings");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:bg-slate-50 dark:hover:bg-slate-700 dark:focus:bg-slate-700"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setFeedbackOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:bg-slate-50 dark:hover:bg-slate-700 dark:focus:bg-slate-700"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Send feedback
                  </button>
                  <div className="-mx-1 my-1 h-px bg-slate-100 dark:bg-slate-700" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      signOutUser();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-red-500 transition-colors hover:bg-slate-50 focus:outline-none focus:bg-slate-50 dark:text-red-400 dark:hover:bg-slate-700 dark:focus:bg-slate-700"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="space-y-4">
          <VerificationBanner />
          {children}
        </div>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-4 px-6 pb-8 text-xs text-slate-500 dark:text-slate-400">
        <Link to="/privacy" className="hover:text-slate-900 dark:hover:text-slate-100">
          Privacy Policy
        </Link>
        <Link to="/terms" className="hover:text-slate-900 dark:hover:text-slate-100">
          Terms of Service
        </Link>
        <a
          href="mailto:support@questscheduler.cc"
          className="hover:text-slate-900 dark:hover:text-slate-100"
        >
          Contact us
        </a>
      </footer>
      <SimpleModal open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <SimpleModalHeader>
          <SimpleModalTitle>Send feedback</SimpleModalTitle>
          <SimpleModalDescription>
            Report a bug, request a feature, or share a quick note.
          </SimpleModalDescription>
        </SimpleModalHeader>
        <div className="mt-4">
          <FeedbackForm onSubmitted={() => setFeedbackOpen(false)} />
        </div>
      </SimpleModal>
    </div>
  );
}
