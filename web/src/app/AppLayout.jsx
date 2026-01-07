import { Link, useNavigate } from "react-router-dom";
import { Settings, LogOut } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { signOutUser } from "../lib/auth";
import { UserAvatar } from "../components/ui/avatar";
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

  return (
    <div className="min-h-full bg-brand-background text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-primary/20 dark:bg-brand-primary/30" />
            <div>
              <p className="text-sm font-semibold">Session Forge</p>
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
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
