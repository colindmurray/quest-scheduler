import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

export function LeaveDialog({ open, onOpenChange, onLeave, saving = false }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Leave session poll</DialogTitle>
          <DialogDescription>
            Leaving will remove you from the participant list and delete your votes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onLeave}
            disabled={saving}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Leaving..." : "Leave poll"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
