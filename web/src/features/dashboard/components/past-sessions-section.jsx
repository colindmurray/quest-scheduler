import { Archive } from "lucide-react";
import { SessionCard } from "./SessionCard";
import { SectionHeader } from "./section-header";
import { TabButton } from "./tab-button";

export function PastSessionsSection({
  pastSessionsTab,
  onTabChange,
  pastFinalized = [],
  cancelledSessions = [],
  archivedSessions = [],
  getGroupColor,
  groupsById = {},
}) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
      <SectionHeader title="Past Sessions" subtitle="Finalized, cancelled, and archived" />

      <div className="mt-3 flex w-fit gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-700">
        <TabButton
          active={pastSessionsTab === "finalized"}
          onClick={() => onTabChange("finalized")}
        >
          Finalized
        </TabButton>
        <TabButton
          active={pastSessionsTab === "cancelled"}
          onClick={() => onTabChange("cancelled")}
        >
          Cancelled ({cancelledSessions.length})
        </TabButton>
        <TabButton
          active={pastSessionsTab === "archived"}
          onClick={() => onTabChange("archived")}
        >
          <span className="flex items-center gap-1">
            <Archive className="h-3 w-3" />
            Archived ({archivedSessions.length})
          </span>
        </TabButton>
      </div>

      <div className="mt-4 space-y-2">
        {pastSessionsTab === "finalized" && (
          <>
            {pastFinalized.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No past sessions yet.
              </p>
            )}
            {pastFinalized.slice(0, 5).map((scheduler) => (
              <SessionCard
                key={scheduler.id}
                scheduler={scheduler}
                winningSlot={scheduler.winningSlot}
                slots={scheduler.slots}
                groupColor={
                  scheduler.questingGroupId ? getGroupColor(scheduler.questingGroupId) : null
                }
                attendanceSummary={scheduler.attendanceSummary}
                participants={scheduler.effectiveParticipants || []}
                voters={scheduler.voters || []}
                questingGroup={
                  scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null
                }
              />
            ))}
          </>
        )}

        {pastSessionsTab === "archived" && (
          <>
            {archivedSessions.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No archived polls. Archive polls from the poll page.
              </p>
            )}
            {archivedSessions.slice(0, 5).map((scheduler) => (
              <SessionCard
                key={scheduler.id}
                scheduler={scheduler}
                isArchived
                winningSlot={scheduler.winningSlot}
                slots={scheduler.slots}
                groupColor={
                  scheduler.questingGroupId ? getGroupColor(scheduler.questingGroupId) : null
                }
                attendanceSummary={scheduler.attendanceSummary}
                participants={scheduler.effectiveParticipants || []}
                voters={scheduler.voters || []}
                questingGroup={
                  scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null
                }
              />
            ))}
          </>
        )}

        {pastSessionsTab === "cancelled" && (
          <>
            {cancelledSessions.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No cancelled sessions yet.
              </p>
            )}
            {cancelledSessions.slice(0, 5).map((scheduler) => (
              <SessionCard
                key={scheduler.id}
                scheduler={scheduler}
                winningSlot={scheduler.winningSlot}
                slots={scheduler.slots}
                groupColor={
                  scheduler.questingGroupId ? getGroupColor(scheduler.questingGroupId) : null
                }
                attendanceSummary={scheduler.attendanceSummary}
                participants={scheduler.effectiveParticipants || []}
                voters={scheduler.voters || []}
                questingGroup={
                  scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null
                }
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
