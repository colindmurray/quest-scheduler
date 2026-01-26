import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { signInWithGoogle } from "../../lib/auth";

const DISCORD_CLIENT_ID = "1465083293262151936";
const DISCORD_INSTALL_PERMISSIONS = "2147699712";
const DISCORD_INSTALL_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=${DISCORD_INSTALL_PERMISSIONS}`;

const steps = [
  {
    title: "Install the bot",
    body: "Choose a server and grant the required permissions.",
  },
  {
    title: "Link a questing group",
    body: "Run /qs link-group inside the target Discord channel.",
  },
  {
    title: "Post polls + vote",
    body: "Create a session poll in Quest Scheduler and vote directly in Discord.",
  },
];

const permissions = [
  {
    title: "View Channel",
    body: "See the linked channel and read poll context.",
  },
  {
    title: "Send Messages",
    body: "Post poll cards, reminders, and updates.",
  },
  {
    title: "Embed Links",
    body: "Render rich poll cards and actions.",
  },
  {
    title: "Read Message History",
    body: "Edit existing poll messages when schedules change.",
  },
  {
    title: "Mention @everyone / roles",
    body: "Optional pings for finalized session announcements.",
  },
];

export default function DiscordBotPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="dark min-h-screen" style={{ colorScheme: "dark" }}>
      <div className="relative min-h-screen text-slate-100">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[url('/assets/background.jpeg')] bg-cover bg-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/35 via-slate-950/55 to-slate-950/80" />
        </div>

        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/app_icon.png"
              alt="Quest Scheduler Logo"
              className="h-10 w-10 rounded-xl object-contain"
            />
            <h1 className="text-xl font-display tracking-[0.18em] text-white drop-shadow-sm">
              Quest Scheduler
            </h1>
          </Link>
          <button
            className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white shadow-md shadow-brand-primary/30 transition-colors hover:bg-brand-primary/90"
            onClick={() => (user ? navigate("/dashboard") : signInWithGoogle())}
          >
            {user ? "Go to Dashboard" : "Sign in with Google"}
          </button>
        </header>

        <main className="mx-auto grid max-w-5xl gap-6 px-6 pb-16 md:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-900 dark:shadow-slate-900/50">
            <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
              Discord Bot Install
            </span>
            <h2 className="mt-4 text-3xl font-bold text-slate-900 dark:text-slate-100">
              Add Quest Scheduler to your Discord server.
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
              Post session polls, vote inside Discord, and announce final times
              without leaving chat.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <a
                href={DISCORD_INSTALL_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-primary/30 transition-colors hover:bg-brand-primary/90"
              >
                <img
                  src="/assets/discord-logo.png"
                  alt=""
                  className="h-4 w-4"
                />
                Add to Discord
              </a>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Requires Manage Server or Administrator permission.
              </span>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {steps.map((step) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200/70 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Permissions included
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Permissions needed by the bot
                  </p>
                </div>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                  bot + applications.commands
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {permissions.map((permission) => (
                  <div
                    key={permission.title}
                    className="flex items-start gap-3 rounded-xl border border-transparent bg-white/70 px-3 py-3 text-xs font-semibold text-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
                  >
                    <span className="mt-0.5 inline-flex h-2 w-2 rounded-full bg-indigo-400" />
                    <div>
                      <p className="text-xs font-semibold">{permission.title}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {permission.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="rounded-3xl bg-slate-900 p-8 text-white shadow-xl shadow-slate-300/60 dark:bg-slate-800">
            <h3 className="text-lg font-semibold">Before you install</h3>
            <p className="mt-2 text-sm text-slate-300">
              Make sure your Discord account is linked in Quest Scheduler so
              votes can be matched to your player profile.
            </p>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">1) Link your Discord account</p>
                <p className="mt-2 text-xs text-slate-300">
                  Connect once in Settings to enable in-server voting.
                </p>
                <Link
                  to="/settings"
                  className="mt-4 inline-flex rounded-full border border-white/30 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Open Settings
                </Link>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">2) Decide your ping preference</p>
                <p className="mt-2 text-xs text-slate-300">
                  Quest Scheduler can announce finalized sessions with @everyone
                  or roles. You can set “No ping” later.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">Need help?</p>
                <p className="mt-2 text-xs text-slate-300">
                  If the bot doesn’t appear in your server list, confirm you
                  have Manage Server permission.
                </p>
              </div>
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
    </div>
  );
}
