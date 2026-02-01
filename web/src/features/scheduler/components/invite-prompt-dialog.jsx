import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { UserIdentity } from "../../../components/UserIdentity";

export function InvitePromptDialog({
  open,
  onOpenChange,
  isPendingInvite = false,
  inviterProfile = null,
  busy = false,
  onAccept,
  onDecline,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Join this session poll?</DialogTitle>
          <DialogDescription>
            {isPendingInvite ? (
              <>
                <UserIdentity user={inviterProfile} /> invited you to join this poll.
              </>
            ) : (
              "This poll is open to anyone with the link."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          {isPendingInvite
            ? "Accepting confirms your spot and unlocks voting on times."
            : "Accepting will add you as a participant so you can vote on times."}
        </div>
        <DialogFooter className="mt-6">
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Joining..." : "Accept & join"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
