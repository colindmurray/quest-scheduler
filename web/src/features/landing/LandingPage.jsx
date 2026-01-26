import { Link, useNavigate } from "react-router-dom";
import { signInWithGoogle } from "../../lib/auth";
import { useAuth } from "../../app/AuthProvider";
import { AvatarStack } from "../../components/ui/voter-avatars";

const features = [
  {
    title: "Create a session poll",
    body: "Pick dates and add multiple time slots in one flow.",
  },
  {
    title: "Invite players",
    body: "Share a link or add addresses from your list.",
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

const mockVoters = [
  { email: "aria@party.gg" },
  { email: "dm.kai@tabletop.io" },
  { email: "wren@dice.club" },
  { email: "soren@quest.net" },
  { email: "lin@spellbook.co" },
];

export default function LandingPage() {
  const { user, banned } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-full bg-brand-background text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <img src="/app_icon.png" alt="Quest Scheduler Logo" className="h-10 w-10 rounded-xl object-contain" />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
              Quest Scheduler
            </p>
            <h1 className="text-xl font-bold">Quest Scheduler</h1>
          </div>
        </div>
        <button
          className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white shadow-md shadow-brand-primary/30 transition-colors hover:bg-brand-primary/90"
          onClick={() => (user ? navigate("/dashboard") : signInWithGoogle())}
        >
          {user ? "Go to Dashboard" : "Sign in with Google"}
        </button>
      </header>

      {banned && (
        <div className="mx-auto max-w-5xl px-6">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
            This account is suspended and cannot be re-registered. If you believe this is a mistake,
            contact support at support@questscheduler.cc.
          </div>
        </div>
      )}

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
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200">
            <img
              src="/assets/discord-logo.png"
              alt="Discord logo"
              className="h-9 w-9 rounded-xl bg-slate-900/5 p-1 dark:bg-white/5"
            />
            <div>
              <p className="text-sm font-semibold">Connect with Discord</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Vote directly inside your server without leaving the chat.
              </p>
            </div>
          </div>
        </section>

        <aside className="rounded-3xl bg-slate-900 p-8 text-white shadow-xl shadow-slate-300/60 dark:bg-slate-800">
          <h3 className="text-lg font-semibold">Live Preview</h3>
          <p className="mt-2 text-sm text-slate-300">
            See who responded, who is in, and what time wins the vote.
          </p>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-sm font-semibold">Onyx League One-shot</p>
              <p className="mt-2 text-xs text-slate-300">
                Pending · 3 preferred · 4 feasible
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                  Needs votes
                </span>
                <AvatarStack users={mockVoters.slice(0, 4)} max={4} size={18} />
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-sm font-semibold">Campaign 12: Mistwood</p>
              <p className="mt-2 text-xs text-slate-300">Finalized · Jan 14 · 6:30 PM</p>
              <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-200 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-emerald-200">Confirmed</span>
                  <AvatarStack users={mockVoters.slice(0, 3)} max={3} size={16} />
                  <span className="text-slate-300">3</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-rose-200">Unavailable</span>
                  <AvatarStack users={mockVoters.slice(3, 4)} max={3} size={16} />
                  <span className="text-slate-300">1</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-300">Unresponded</span>
                  <AvatarStack users={mockVoters.slice(4)} max={3} size={16} />
                  <span className="text-slate-300">1</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-sm font-semibold">Feywild Sidequest</p>
              <p className="mt-2 text-xs text-slate-300">Finalized · Feb 2 · 7:00 PM</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-200">
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                  Calendar synced
                </span>
                <AvatarStack users={mockVoters} max={5} size={18} />
              </div>
            </div>
          </div>
          <div className="mt-6">
            <a
              href="https://buymeacoffee.com/murraycolii"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <img
                src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                height="48"
                alt="Buy Me A Coffee"
              />
            </a>
          </div>
        </aside>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-6 pb-10 text-xs text-slate-500 dark:text-slate-400">
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
