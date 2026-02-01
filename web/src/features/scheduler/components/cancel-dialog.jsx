import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

export function CancelDialog({
  open,
  onOpenChange,
  title = "Untitled poll",
  saving = false,
  onCancelSession,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel session</DialogTitle>
          <DialogDescription>
            This stops voting and marks the session as cancelled for everyone.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-200">{title}</p>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onCancelSession}
            disabled={saving}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Cancelling..." : "Cancel session"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
