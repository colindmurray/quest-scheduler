import { format, formatDistanceToNow, isToday, isTomorrow, isThisWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Calendar, ChevronRight } from "lucide-react";
import { formatZonedTime, getTimeZoneAbbr, toDisplayDate } from "../../../lib/time";

function groupSessionsByDate(sessions) {
  const groups = {};

  sessions.forEach((session) => {
    const sourceDate = session.winningSlot?.start
      ? new Date(session.winningSlot.start)
      : session.firstSlot?.start
        ? new Date(session.firstSlot.start)
        : null;

    if (!sourceDate) return;

    const displayDate = toDisplayDate(sourceDate, session.displayTimeZone) || sourceDate;
    const dateKey = format(displayDate, "yyyy-MM-dd");
    if (!groups[dateKey]) {
      groups[dateKey] = {
        date: displayDate,
        sortDate: sourceDate,
        sessions: [],
      };
    }
    groups[dateKey].sessions.push({
      ...session,
      sortDate: sourceDate,
      displayDate,
    });
  });

  // Sort sessions within each group by time
  Object.values(groups).forEach((group) => {
    group.sessions.sort((a, b) => a.sortDate - b.sortDate);
  });

  // Sort groups by date
  return Object.values(groups).sort((a, b) => a.sortDate - b.sortDate);
}

function getDateLabel(displayDate, rawDate, timeZone, showTimeZone) {
  let baseLabel = null;
  if (isToday(displayDate)) baseLabel = "Today";
  if (!baseLabel && isTomorrow(displayDate)) baseLabel = "Tomorrow";
  if (!baseLabel && isThisWeek(displayDate)) baseLabel = format(displayDate, "EEEE");
  if (!baseLabel) baseLabel = format(displayDate, "EEEE, MMM d");
  const shouldShow = showTimeZone !== false;
  const abbr = shouldShow ? getTimeZoneAbbr(rawDate || displayDate, timeZone) : "";
  return abbr ? `${baseLabel} ${abbr}` : baseLabel;
}

function AgendaItem({ session, groupColor, showVoteNeeded }) {
  const navigate = useNavigate();
  const date = session.winningSlot?.start
    ? new Date(session.winningSlot.start)
    : session.firstSlot?.start
      ? new Date(session.firstSlot.start)
      : null;
  const displayDate = date ? toDisplayDate(date, session.displayTimeZone) || date : null;

  const handleOpen = () => {
    const target = `/scheduler/${session.id}`;
    navigate(target);
    setTimeout(() => {
      if (window.location.pathname !== target) {
        window.location.assign(target);
      }
    }, 50);
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
      style={{
        borderLeftWidth: groupColor ? "4px" : undefined,
        borderLeftColor: groupColor || undefined,
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {session.title || "Untitled"}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {date && (
            <span>
              {formatZonedTime(date, session.displayTimeZone, "h:mm a", {
                showTimeZone: session.showTimeZone,
              })}
            </span>
          )}
          {session.status === "OPEN" && showVoteNeeded && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              Vote needed
            </span>
          )}
          {session.status === "OPEN" && !showVoteNeeded && (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              Open
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
    </button>
  );
}

export function MobileAgendaView({ sessions = [], getGroupColor = () => null, needsVote = new Set() }) {
  const groupedSessions = groupSessionsByDate(sessions);

  if (groupedSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Calendar className="h-10 w-10 text-slate-300 dark:text-slate-600" />
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          No upcoming sessions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
              {groupedSessions.map((group) => (
        <div key={format(group.date, "yyyy-MM-dd")}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {getDateLabel(
                group.date,
                group.sortDate,
                group.sessions?.[0]?.displayTimeZone,
                group.sessions?.[0]?.showTimeZone
              )}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {formatDistanceToNow(group.sortDate, { addSuffix: true })}
            </p>
          </div>
          <div className="space-y-2">
            {group.sessions.map((session) => (
              <AgendaItem
                key={session.id}
                session={session}
                groupColor={
                  session.questingGroupId
                    ? getGroupColor(session.questingGroupId)
                    : null
                }
                showVoteNeeded={needsVote.has(session.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
