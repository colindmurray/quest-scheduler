import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { signOutUser } from "../lib/auth";

export default function AppLayout({ children }) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className="min-h-full bg-brand-background text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-primary/20 dark:bg-brand-primary/30" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                D&D Scheduler
              </p>
              <p className="text-sm font-semibold">Next Session HQ</p>
            </div>
          </Link>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-2 py-1 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
              )}
              <span className="hidden text-slate-600 dark:text-slate-300 sm:inline">Account</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-2 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/settings");
                  }}
                  className="w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    signOutUser();
                  }}
                  className="w-full rounded-xl px-3 py-2 text-left text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
