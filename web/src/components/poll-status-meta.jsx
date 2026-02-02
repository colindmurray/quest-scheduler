import { Calendar, AlertTriangle, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatSlotRange, getPollStatusLabel, getSlotRange } from "../features/dashboard/lib/poll-card-utils";
import { formatZonedDateTime } from "../lib/time";

const toneStyles = {
  amber: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    icon: "text-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    subtext: "text-amber-600 dark:text-amber-400",
  },
  blue: {
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    icon: "text-blue-500",
    text: "text-blue-700 dark:text-blue-300",
    subtext: "text-blue-600 dark:text-blue-400",
  },
  emerald: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    icon: "text-emerald-500",
    text: "text-slate-700 dark:text-slate-300",
    subtext: "text-emerald-600 dark:text-emerald-400",
  },
  rose: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    icon: "text-rose-500",
    text: "text-rose-700 dark:text-rose-300",
    subtext: "text-rose-600 dark:text-rose-400",
  },
  slate: {
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    icon: "text-slate-400",
    text: "text-slate-600 dark:text-slate-300",
    subtext: "text-slate-500 dark:text-slate-400",
  },
};

export function PollStatusMeta({
  scheduler,
  winningSlot,
  slots = [],
  allVotesIn = false,
  isArchived = false,
  questingGroupName = null,
  questingGroupColor = null,
  guestCount = 0,
  displayTimeZone = null,
  showTimeZone = true,
}) {
  const timeZone = displayTimeZone || scheduler?.timezone || null;
  const slotRange = getSlotRange(slots);
  const slotRangeLabel = formatSlotRange(slotRange, timeZone, showTimeZone);
  const cancelledAt =
    scheduler?.cancelledAt ||
    scheduler?.calendarSync?.cancelled?.at ||
    scheduler?.calendarSync?.cancelledAt ||
    scheduler?.cancelled?.at ||
    null;
  const isCancelled =
    scheduler?.status === "CANCELLED" ||
    scheduler?.calendarSync?.state === "CANCELLED" ||
    Boolean(cancelledAt);
  const isRescheduled =
    scheduler?.calendarSync?.state === "RESCHEDULED" ||
    Boolean(scheduler?.calendarSync?.rescheduled);
  const statusLabel = getPollStatusLabel({
    status: scheduler?.status,
    allVotesIn,
    isCancelled,
  });
  const statusTone = isCancelled
    ? "rose"
    : scheduler?.status === "FINALIZED"
      ? "emerald"
      : allVotesIn
        ? "blue"
        : "amber";

  let timeDisplay = null;
  let relativeTime = null;
  let dateTone = statusTone;

  if (isCancelled) {
    if (winningSlot?.start) {
      const slotDate = new Date(winningSlot.start);
      timeDisplay = formatZonedDateTime(slotDate, timeZone, undefined, { showTimeZone });
    } else if (slotRangeLabel) {
      timeDisplay = slotRangeLabel;
    } else if (cancelledAt) {
      const cancelledDate = new Date(cancelledAt);
      if (!Number.isNaN(cancelledDate.getTime())) {
        timeDisplay = formatZonedDateTime(cancelledDate, timeZone, undefined, { showTimeZone });
      }
    }
    dateTone = "slate";
  } else if (scheduler?.status === "FINALIZED" && winningSlot?.start) {
    const slotDate = new Date(winningSlot.start);
    timeDisplay = formatZonedDateTime(slotDate, timeZone, undefined, { showTimeZone });
    if (slotDate > new Date()) {
      relativeTime = formatDistanceToNow(slotDate, { addSuffix: true });
    }
    dateTone = "emerald";
  } else if (scheduler?.status === "OPEN" && slotRangeLabel) {
    timeDisplay = slotRangeLabel;
    dateTone = allVotesIn ? "blue" : "amber";
  }

  return (
    <>
      {timeDisplay && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Calendar className={`h-3 w-3 ${toneStyles[dateTone].icon}`} />
          <span className={`text-xs font-medium ${toneStyles[dateTone].text}`}>
            {timeDisplay}
          </span>
          {relativeTime && (
            <span className={`text-xs ${toneStyles[dateTone].subtext}`}>{relativeTime}</span>
          )}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold leading-none ${toneStyles[statusTone].chip}`}
        >
          {statusLabel}
        </span>
        {questingGroupName && (
          <span
            className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-semibold leading-none text-white"
            style={{ backgroundColor: questingGroupColor || "#6366f1" }}
          >
            <Users className="h-3 w-3" />
            {questingGroupName}
            {guestCount > 0 && (
              <span className="opacity-80">
                + {guestCount} guest{guestCount !== 1 ? "s" : ""}
              </span>
            )}
          </span>
        )}
        {isRescheduled && !isCancelled && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            Rescheduled
          </span>
        )}
        {isArchived && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            Archived
          </span>
        )}
      </div>
    </>
  );
}
