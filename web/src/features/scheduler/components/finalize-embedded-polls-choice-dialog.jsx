import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

export function FinalizeEmbeddedPollsChoiceDialog({
  open,
  onOpenChange,
  unfinalizedCount = 0,
  onFinalizeAll,
  onFinalizeSessionOnly,
}) {
  const countLabel = `${unfinalizedCount} embedded poll${unfinalizedCount === 1 ? "" : "s"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Finalize embedded polls too?</DialogTitle>
          <DialogDescription>
            {countLabel} are still open. You can lock them now with the session finalize action,
            or leave them open for continued voting.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          Finalize all: session and embedded poll votes are locked.
          <br />
          Session only: session voting locks, embedded polls remain open unless finalized separately.
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
            onClick={onFinalizeSessionOnly}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Finalize session only
          </button>
          <button
            type="button"
            onClick={onFinalizeAll}
            className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
          >
            Finalize session + embedded polls
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
