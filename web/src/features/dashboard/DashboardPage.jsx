import { collection, query, where } from "firebase/firestore";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { db } from "../../lib/firebase";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection";
import { useUserSettings } from "../../hooks/useUserSettings";
import { LoadingState } from "../../components/ui/spinner";

function SectionCard({ title, subtitle, action, headerContent, children }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {headerContent}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function StatusBadge({ status, isArchived }) {
  if (status === "FINALIZED") {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
        Finalized
      </span>
    );
  }
  if (status === "OPEN") {
    return (
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
        Open
      </span>
    );
  }
  return null;
}

function SchedulerRow({ scheduler, isArchived }) {
  return (
    <Link
      to={`/scheduler/${scheduler.id}`}
      className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 transition-all duration-150 hover:scale-[1.02] hover:border-slate-200 hover:shadow-md hover:shadow-slate-200/50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:shadow-slate-900/50"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {scheduler.title || "Untitled poll"}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {scheduler.status || "OPEN"} · {scheduler.participants?.length || 0} participants
        </p>
      </div>
      <div className="flex items-center gap-2">
        {isArchived && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            Archived
          </span>
        )}
        <StatusBadge status={scheduler.status} />
      </div>
    </Link>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-brand-primary text-white"
          : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { archivedPolls, loading: settingsLoading } = useUserSettings();
  const [pastSessionsTab, setPastSessionsTab] = useState("finalized");

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

  // Query for all polls user participates in (for archived filtering)
  const allParticipatingQuery = useMemo(() => {
    if (!user?.email) return null;
    return query(
      collection(db, "schedulers"),
      where("participants", "array-contains", user.email)
    );
  }, [user?.email]);

  const upcoming = useFirestoreCollection(upcomingQuery);
  const past = useFirestoreCollection(pastQuery);
  const mine = useFirestoreCollection(myQuery);
  const allParticipating = useFirestoreCollection(allParticipatingQuery);

  // Filter upcoming to exclude archived polls
  const upcomingFiltered = useMemo(() => {
    return upcoming.data.filter((scheduler) => !archivedPolls.includes(scheduler.id));
  }, [upcoming.data, archivedPolls]);

  // Filter finalized to exclude archived polls
  const finalizedFiltered = useMemo(() => {
    return past.data.filter((scheduler) => !archivedPolls.includes(scheduler.id));
  }, [past.data, archivedPolls]);

  // Get archived polls (any status that user has archived)
  const archivedFiltered = useMemo(() => {
    return allParticipating.data.filter((scheduler) => archivedPolls.includes(scheduler.id));
  }, [allParticipating.data, archivedPolls]);

  // Filter "My Session Polls" to exclude archived
  const mineFiltered = useMemo(() => {
    return mine.data.filter((scheduler) => !archivedPolls.includes(scheduler.id));
  }, [mine.data, archivedPolls]);

  const isLoading = upcoming.loading || past.loading || mine.loading || allParticipating.loading || settingsLoading;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard
        title="Upcoming Sessions"
        subtitle="Session polls you are invited to or joined via link."
      >
        {isLoading && <LoadingState message="Loading..." className="py-2" />}
        {!isLoading && upcomingFiltered.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No upcoming sessions yet.
          </p>
        )}
        {upcomingFiltered.map((scheduler) => (
          <SchedulerRow key={scheduler.id} scheduler={scheduler} isArchived={false} />
        ))}
      </SectionCard>

      <SectionCard
        title="My Session Polls"
        subtitle="Session polls you have created."
        action={
          <Link
            to="/create"
            className="rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white"
          >
            New poll
          </Link>
        }
      >
        {isLoading && <LoadingState message="Loading..." className="py-2" />}
        {!isLoading && mineFiltered.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You have not created any polls.
          </p>
        )}
        {mineFiltered.map((scheduler) => (
          <SchedulerRow
            key={scheduler.id}
            scheduler={scheduler}
            isArchived={archivedPolls.includes(scheduler.id)}
          />
        ))}
      </SectionCard>

      <SectionCard
        title="Past Sessions"
        subtitle="Finalized and archived session polls."
        headerContent={
          <div className="mt-3 flex gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 w-fit dark:border-slate-600 dark:bg-slate-700">
            <TabButton
              active={pastSessionsTab === "finalized"}
              onClick={() => setPastSessionsTab("finalized")}
            >
              Finalized
            </TabButton>
            <TabButton
              active={pastSessionsTab === "archived"}
              onClick={() => setPastSessionsTab("archived")}
            >
              Archived ({archivedFiltered.length})
            </TabButton>
          </div>
        }
      >
        {isLoading && <LoadingState message="Loading..." className="py-2" />}

        {pastSessionsTab === "finalized" && (
          <>
            {!isLoading && finalizedFiltered.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">No finalized sessions yet.</p>
            )}
            {finalizedFiltered.map((scheduler) => (
              <SchedulerRow key={scheduler.id} scheduler={scheduler} isArchived={false} />
            ))}
          </>
        )}

        {pastSessionsTab === "archived" && (
          <>
            {!isLoading && archivedFiltered.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No archived polls. Archive polls you no longer need from the poll page.
              </p>
            )}
            {archivedFiltered.map((scheduler) => (
              <SchedulerRow
                key={scheduler.id}
                scheduler={scheduler}
                isArchived={true}
              />
            ))}
          </>
        )}
      </SectionCard>
    </div>
  );
}
