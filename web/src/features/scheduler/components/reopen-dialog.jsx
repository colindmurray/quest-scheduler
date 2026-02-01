import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

export function ReopenDialog({
  open,
  onOpenChange,
  saving = false,
  hasExistingEvent = false,
  updateCalendar = false,
  onToggleUpdateCalendar,
  onConfirm,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Re-open session poll</DialogTitle>
          <DialogDescription>
            Re-opening clears the winning slot and allows voting again.
          </DialogDescription>
        </DialogHeader>
        {hasExistingEvent && (
          <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={updateCalendar}
                onChange={(event) => onToggleUpdateCalendar(event.target.checked)}
              />
              Update Google Calendar entry
            </label>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Delete the existing calendar event so the poll can be rescheduled.
            </p>
          </div>
        )}
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
            onClick={onConfirm}
            disabled={saving}
            className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {saving ? "Re-opening..." : "Re-open poll"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
