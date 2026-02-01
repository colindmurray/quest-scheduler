import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

export function DeleteDialog({
  open,
  onOpenChange,
  title = "Untitled poll",
  participantCount = 0,
  slotCount = 0,
  voteCount = 0,
  hasExistingEvent = false,
  updateCalendar = false,
  onToggleUpdateCalendar,
  onDelete,
  saving = false,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete session poll</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this poll? This action cannot be undone and will remove the poll for all participants.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{title}</p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {participantCount} participants · {slotCount} slots · {voteCount} votes
          </p>
        </div>
        {hasExistingEvent && (
          <label className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={updateCalendar}
              onChange={(event) => onToggleUpdateCalendar(event.target.checked)}
            />
            Update Google Calendar entry (delete the linked event)
          </label>
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
            onClick={onDelete}
            disabled={saving}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Deleting..." : "Delete poll"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
