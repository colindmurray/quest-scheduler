import { Link } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";

export default function LegalLayout({ title, children }) {
  const { user } = useAuth();

  return (
    <div className="min-h-full bg-brand-background text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <img src="/app_icon.png" alt="Quest Scheduler Logo" className="h-10 w-10 rounded-xl object-contain" />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
              Quest Scheduler
            </p>
            <h1 className="text-xl font-bold">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
          {user ? (
            <Link to="/dashboard" className="hover:text-slate-900 dark:hover:text-slate-100">
              Go to dashboard
            </Link>
          ) : (
            <Link to="/" className="hover:text-slate-900 dark:hover:text-slate-100">
              Back to home
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 pb-16">
        <div className="rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-900 dark:shadow-slate-900/50">
          <div className="space-y-6 text-sm text-slate-600 dark:text-slate-300 [&_strong]:text-slate-900 [&_strong]:dark:text-slate-100 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:dark:text-slate-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_a]:font-semibold [&_a]:text-brand-primary [&_a]:hover:text-brand-primary/80">
            {children}
          </div>
        </div>
        <footer className="mt-6 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
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
      </main>
    </div>
  );
}
