import { useNavigate } from "react-router-dom";
import { signInWithGoogle } from "../../lib/auth";
import { useAuth } from "../../app/AuthProvider";

const features = [
  {
    title: "Create a scheduler",
    body: "Pick dates and add multiple time slots in one flow.",
  },
  {
    title: "Invite players",
    body: "Share a UUID link or add addresses from your list.",
  },
  {
    title: "Vote fast",
    body: "Feasible + Preferred votes make decisions clear.",
  },
  {
    title: "Finalize & send",
    body: "Create the winning event on Google Calendar.",
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-full bg-brand-background text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-primary/20 dark:bg-brand-primary/30" />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
              D&D Scheduler
            </p>
            <h1 className="text-xl font-bold">Next Session HQ</h1>
          </div>
        </div>
        <button
          className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white shadow-md shadow-brand-primary/30 transition-colors hover:bg-brand-primary/90"
          onClick={() => (user ? navigate("/dashboard") : signInWithGoogle())}
        >
          {user ? "Go to Dashboard" : "Sign in with Google"}
        </button>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 pb-16 md:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-900 dark:shadow-slate-900/50">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            Schedule the next adventure in minutes.
          </h2>
          <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
            Propose multiple time slots, collect feasible and preferred votes,
            and lock in the winning session directly on your Google Calendar.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {features.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800"
              >
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-3xl bg-slate-900 p-8 text-white shadow-xl shadow-slate-300/60 dark:bg-slate-800">
          <h3 className="text-lg font-semibold">Session Pulse</h3>
          <p className="mt-2 text-sm text-slate-300">
            Track open schedulers, recent votes, and calendar locks at a glance.
          </p>
          <div className="mt-6 space-y-4">
            {[
              "Campaign 12: The Mistwood",
              "Onyx League One-shot",
              "Feywild Sidequest",
            ].map((label) => (
              <div key={label} className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-2 text-xs text-slate-300">
                  5 votes · 2 preferred · 4 feasible
                </p>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
