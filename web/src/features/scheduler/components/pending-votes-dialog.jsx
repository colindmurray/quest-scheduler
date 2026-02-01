import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

export function PendingVotesDialog({
  open,
  onOpenChange,
  busy = false,
  onDiscard,
  onSubmit,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit your votes first?</DialogTitle>
          <DialogDescription>
            You have unsaved votes. Submit them before finalizing, or discard them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Discard my votes
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {busy ? "Submitting..." : "Submit votes & continue"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
