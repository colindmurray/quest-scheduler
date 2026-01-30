import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export function CalendarJumpControls({
  hasEvents,
  hasEventsInView,
  onPrev,
  onNext,
  onPrevWindow,
  onNextWindow,
  label = "Jump to session",
}) {
  if (!hasEvents) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      {!hasEventsInView && (
        <span className="mr-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
          No sessions in view
        </span>
      )}
      <span className="font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-0.5 dark:border-slate-600 dark:bg-slate-800">
        <button
          type="button"
          onClick={onPrevWindow}
          className="rounded-full px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          title="Previous window"
        >
          <ChevronsLeft className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onPrev}
          className="rounded-full px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          title="Previous session"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-full px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          title="Next session"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onNextWindow}
          className="rounded-full px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          title="Next window"
        >
          <ChevronsRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
