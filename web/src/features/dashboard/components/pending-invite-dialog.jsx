import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { UserIdentity } from "../../../components/UserIdentity";

export function PendingInviteDialog({
  open,
  onOpenChange,
  invite = null,
  inviterProfile = null,
  onAccept,
  onDecline,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Session poll invite</DialogTitle>
          <DialogDescription>
            {invite
              ? `You've been invited to join "${invite.title || "Session Poll"}".`
              : "Review your pending invite."}
          </DialogDescription>
        </DialogHeader>
        {invite && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-200">
            Invited by{" "}
            {inviterProfile ? <UserIdentity user={inviterProfile} /> : "Unknown"}
          </div>
        )}
        <DialogFooter className="mt-6">
          <button
            type="button"
            onClick={onDecline}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Accept &amp; view poll
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
