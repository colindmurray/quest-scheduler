import { Link, useNavigate } from "react-router-dom";
import { Settings, LogOut, Users, Bot } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { signOutUser } from "../lib/auth";
import { UserAvatar } from "../components/ui/avatar";
import { NotificationBell } from "../components/ui/notification-bell";
import { useNotificationSync } from "../hooks/useNotificationSync";
import VerificationBanner from "../components/VerificationBanner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

export default function AppLayout({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  useNotificationSync();

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-2 py-1 text-sm font-semibold transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <UserAvatar email={user?.email} src={user?.photoURL} size={32} />
                  <span className="hidden text-slate-600 dark:text-slate-300 sm:inline">
                    Account
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => navigate("/friends")}
                  className="flex items-center gap-2"
                >
                  <Users className="h-4 w-4" />
                  Friends & Groups
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/discord-bot")}
                  className="flex items-center gap-2"
                >
                  <Bot className="h-4 w-4" />
                  Add Discord bot
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/settings")}
                  className="flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOutUser()}
                  className="flex items-center gap-2 text-red-500 focus:text-red-500 dark:text-red-400 dark:focus:text-red-400"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
    </div>
  );
}
