import { collection, query, where } from "firebase/firestore";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { db } from "../../lib/firebase";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection";
import { LoadingState } from "../../components/ui/spinner";

function SectionCard({ title, subtitle, action, children }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function SchedulerRow({ scheduler }) {
  const isFinalized = scheduler.status === "FINALIZED";
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 dark:border-slate-700">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {scheduler.title || "Untitled scheduler"}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {scheduler.status || "OPEN"} · {scheduler.participants?.length || 0} participants
        </p>
      </div>
      <div className="flex items-center gap-2">
        {isFinalized && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
            Finalized
          </span>
        )}
        <Link
          to={`/scheduler/${scheduler.id}`}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Open
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const upcomingQuery = useMemo(() => {
    if (!user?.email) return null;
    return query(
      collection(db, "schedulers"),
      where("participants", "array-contains", user.email),
      where("status", "==", "OPEN")
    );
  }, [user?.email]);

  const pastQuery = useMemo(() => {
    if (!user?.email) return null;
    return query(
      collection(db, "schedulers"),
      where("participants", "array-contains", user.email),
      where("status", "==", "FINALIZED")
    );
  }, [user?.email]);

  const myQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(collection(db, "schedulers"), where("creatorId", "==", user.uid));
  }, [user?.uid]);

  const upcoming = useFirestoreCollection(upcomingQuery);
  const past = useFirestoreCollection(pastQuery);
  const mine = useFirestoreCollection(myQuery);

  return (
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Upcoming Sessions"
          subtitle="Schedulers you are invited to or joined via link."
        >
          {upcoming.loading && <LoadingState message="Loading..." className="py-2" />}
          {!upcoming.loading && upcoming.data.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No upcoming sessions yet.
            </p>
          )}
          {upcoming.data.map((scheduler) => (
            <SchedulerRow key={scheduler.id} scheduler={scheduler} />
          ))}
        </SectionCard>

        <SectionCard
          title="My Schedulers"
          subtitle="Schedulers you have created."
          action={
            <Link
              to="/create"
              className="rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white"
            >
              New scheduler
            </Link>
          }
        >
          {mine.loading && <LoadingState message="Loading..." className="py-2" />}
          {!mine.loading && mine.data.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              You have not created any schedulers.
            </p>
          )}
          {mine.data.map((scheduler) => (
            <SchedulerRow key={scheduler.id} scheduler={scheduler} />
          ))}
        </SectionCard>

        <SectionCard
          title="Past Sessions"
          subtitle="Finalized schedulers and completed sessions."
        >
          {past.loading && <LoadingState message="Loading..." className="py-2" />}
          {!past.loading && past.data.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">No past sessions yet.</p>
          )}
          {past.data.map((scheduler) => (
            <SchedulerRow key={scheduler.id} scheduler={scheduler} />
          ))}
        </SectionCard>
      </div>
  );
}
