import { format, formatDistanceToNow, isToday, isTomorrow, isThisWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Calendar, ChevronRight } from "lucide-react";

function groupSessionsByDate(sessions) {
  const groups = {};

  sessions.forEach((session) => {
    const date = session.winningSlot?.start
      ? new Date(session.winningSlot.start)
      : session.firstSlot?.start
        ? new Date(session.firstSlot.start)
        : null;

    if (!date) return;

    const dateKey = format(date, "yyyy-MM-dd");
    if (!groups[dateKey]) {
      groups[dateKey] = {
        date,
        sessions: [],
      };
    }
    groups[dateKey].sessions.push({ ...session, sortDate: date });
  });

  // Sort sessions within each group by time
  Object.values(groups).forEach((group) => {
    group.sessions.sort((a, b) => a.sortDate - b.sortDate);
  });

  // Sort groups by date
  return Object.values(groups).sort((a, b) => a.date - b.date);
}

function getDateLabel(date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isThisWeek(date)) return format(date, "EEEE");
  return format(date, "EEEE, MMM d");
}

function AgendaItem({ session, groupColor }) {
  const navigate = useNavigate();
  const date = session.winningSlot?.start
    ? new Date(session.winningSlot.start)
    : session.firstSlot?.start
      ? new Date(session.firstSlot.start)
      : null;

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
          {date && <span>{format(date, "h:mm a")}</span>}
          {session.status === "OPEN" && (
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

export function MobileAgendaView({ sessions = [], getGroupColor = () => null }) {
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
              {getDateLabel(group.date)}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {formatDistanceToNow(group.date, { addSuffix: true })}
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
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
