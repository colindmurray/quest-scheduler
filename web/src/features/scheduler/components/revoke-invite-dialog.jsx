import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

export function RevokeInviteDialog({
  open,
  onOpenChange,
  inviteeEmail,
  onRevoke,
  disabled = false,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke pending invite</DialogTitle>
          <DialogDescription>
            Remove the pending invite for {inviteeEmail}?
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
            onClick={onRevoke}
            disabled={disabled}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            Revoke invite
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
