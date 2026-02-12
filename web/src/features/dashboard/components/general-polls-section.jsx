import { Plus } from "lucide-react";
import { BasicPollCard } from "../../../components/polls/basic-poll-card";
import { SectionHeader } from "./section-header";
import { TabButton } from "./tab-button";

export function GeneralPollsSection({
  hasQuestingGroupMembership,
  canCreateGeneralPoll,
  onCreateGeneralPoll,
  basicPollTab,
  setBasicPollTab,
  basicPollBuckets,
  basicPollLoading,
  visibleBasicPolls,
  basicPollArchiveBusy,
  basicPollActionBusy,
  onOpenBasicPoll,
  onToggleBasicPollArchive,
  onFinalizeBasicPoll,
  onReopenBasicPoll,
  onEditBasicPoll,
  onDeleteBasicPoll,
}) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
      <SectionHeader
        title="General Polls"
        subtitle="Standalone and add-on polls."
        action={
          hasQuestingGroupMembership ? (
            <button
              type="button"
              aria-label="Create new general poll"
              onClick={onCreateGeneralPoll}
              disabled={!canCreateGeneralPoll}
              title={
                canCreateGeneralPoll
                  ? "Create a new general poll"
                  : "You need manager access to create a general poll"
              }
              className="flex items-center gap-1 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              New poll
            </button>
          ) : null
        }
      />
      <div className="mt-3 flex w-fit gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-700">
        <TabButton
          active={basicPollTab === "needs-vote"}
          onClick={() => setBasicPollTab("needs-vote")}
        >
          Needs vote ({basicPollBuckets["needs-vote"].length})
        </TabButton>
        <TabButton
          active={basicPollTab === "open-voted"}
          onClick={() => setBasicPollTab("open-voted")}
        >
          Open voted ({basicPollBuckets["open-voted"].length})
        </TabButton>
        <TabButton active={basicPollTab === "closed"} onClick={() => setBasicPollTab("closed")}>
          Closed ({basicPollBuckets.closed.length})
        </TabButton>
        <TabButton active={basicPollTab === "archived"} onClick={() => setBasicPollTab("archived")}>
          Archived ({basicPollBuckets.archived.length})
        </TabButton>
      </div>
      <div className="mt-4 space-y-3">
        {basicPollLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading general polls...</p>
        ) : visibleBasicPolls.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {basicPollTab === "needs-vote"
              ? "No open general polls need your vote right now."
              : basicPollTab === "open-voted"
                ? "No open general polls where you've already voted."
                : basicPollTab === "closed"
                  ? "No closed general polls right now."
                  : "No archived general polls yet."}
          </p>
        ) : (
          visibleBasicPolls.slice(0, 5).map((poll) => (
            <BasicPollCard
              key={`${poll.parentType}:${poll.parentId}:${poll.pollId}`}
              poll={poll}
              onOpen={() => onOpenBasicPoll(poll)}
              onArchiveToggle={() => onToggleBasicPollArchive(poll)}
              archiveBusy={Boolean(basicPollArchiveBusy[poll.archiveKey])}
              onFinalizePoll={() => onFinalizeBasicPoll(poll)}
              onReopenPoll={() => onReopenBasicPoll(poll)}
              onEditPoll={() => onEditBasicPoll(poll)}
              onDeletePoll={() => onDeleteBasicPoll(poll)}
              canManage={Boolean(poll.canManage)}
              actionBusy={Boolean(
                basicPollActionBusy[`${poll.archiveKey}:finalize`] ||
                  basicPollActionBusy[`${poll.archiveKey}:reopen`] ||
                  basicPollActionBusy[`${poll.archiveKey}:delete`]
              )}
            />
          ))
        )}
        {visibleBasicPolls.length > 5 ? (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            +{visibleBasicPolls.length - 5} more
          </p>
        ) : null}
      </div>
    </section>
  );
}
