import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Switch } from "../../../components/ui/switch";
import { VoteToggle } from "./vote-toggle";

export function VoteDialog({
  open,
  onOpenChange,
  modalDate,
  slots = [],
  noTimesWork = false,
  canVote = false,
  onToggleNoTimesWork,
  draftVotes = {},
  pastSlotIds = new Set(),
  onSetVote,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Vote for {modalDate ? format(modalDate, "MMM d") : ""}
          </DialogTitle>
          <DialogDescription>
            Toggle Feasible or Preferred for each slot.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <span>No times work for me</span>
          <Switch
            checked={noTimesWork}
            disabled={!canVote}
            onCheckedChange={onToggleNoTimesWork}
          />
        </div>
        <div className="mt-4 space-y-3">
          {slots.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No slots on this day.
            </p>
          )}
          {slots.map((slot) => {
            const vote = draftVotes[slot.id];
            const isPast = pastSlotIds.has(slot.id);
            return (
              <div
                key={slot.id}
                className={`grid gap-2 rounded-2xl border px-4 py-3 dark:border-slate-700 ${
                  isPast
                    ? "border-red-300 bg-red-50/60 dark:border-red-700 dark:bg-red-900/20"
                    : "border-slate-200/70"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {format(new Date(slot.start), "h:mm a")}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Feasible</span>
                  <VoteToggle
                    checked={vote === "FEASIBLE" || vote === "PREFERRED"}
                    disabled={!canVote || noTimesWork || vote === "PREFERRED" || isPast}
                    onChange={(checked) => onSetVote(slot.id, checked ? "FEASIBLE" : null)}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Preferred</span>
                  <VoteToggle
                    checked={vote === "PREFERRED"}
                    disabled={!canVote || noTimesWork || isPast}
                    onChange={(checked) => onSetVote(slot.id, checked ? "PREFERRED" : null)}
                  />
                </div>
                {isPast && (
                  <p className="text-xs font-semibold text-red-500 dark:text-red-400">
                    This slot is in the past.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
          >
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
