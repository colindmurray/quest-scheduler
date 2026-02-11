import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

function formatMissingUserLabel(user = {}) {
  const displayName = String(user?.displayName || "").trim();
  const email = String(user?.email || "").trim();
  if (displayName && email && displayName !== email) {
    return `${displayName} (${email})`;
  }
  return displayName || email || String(user?.userId || "Unknown user");
}

export function RequiredEmbeddedFinalizeWarningDialog({
  open,
  onOpenChange,
  pollSummaries = [],
  busy = false,
  onContinue,
}) {
  const [expandedByPollId, setExpandedByPollId] = useState({});

  const pollsWithMissing = useMemo(
    () => (pollSummaries || []).filter((poll) => Number(poll?.missingCount || 0) > 0),
    [pollSummaries]
  );

  const toggleExpanded = (pollId) => {
    setExpandedByPollId((previous) => ({
      ...previous,
      [pollId]: !previous[pollId],
    }));
  };

  const totalMissingVotes = pollsWithMissing.reduce(
    (sum, poll) => sum + Number(poll?.missingCount || 0),
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Finalize with missing required poll votes?</DialogTitle>
          <DialogDescription>
            Some required embedded polls still have missing votes. You can still finalize, but the
            session will be marked as finalized with missing required poll votes.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
            {pollsWithMissing.length} poll{pollsWithMissing.length === 1 ? "" : "s"} incomplete · {totalMissingVotes} missing vote{totalMissingVotes === 1 ? "" : "s"}
          </p>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {pollsWithMissing.map((poll) => {
              const isExpanded = expandedByPollId[poll.basicPollId] === true;
              const missingUsers = poll.missingUsers || [];
              return (
                <div
                  key={poll.basicPollId}
                  className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 dark:border-amber-700/60 dark:bg-amber-900/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {poll.basicPollTitle || "Untitled poll"}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {poll.missingCount} missing voter{poll.missingCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(poll.basicPollId)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {isExpanded ? "Hide users" : "Show users"}
                    </button>
                  </div>

                  {isExpanded ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700 dark:text-slate-200">
                      {missingUsers.length === 0 ? (
                        <li>Missing users unavailable.</li>
                      ) : (
                        missingUsers.map((user) => (
                          <li key={`${poll.basicPollId}:${user.userId || user.email || "unknown"}`}>
                            {formatMissingUserLabel(user)}
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "Continuing..." : "Finalize anyway"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
