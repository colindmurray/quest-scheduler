import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, isBefore, startOfDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";

function doEventsOverlap(event1, event2) {
  if (event1.id === event2.id) return false;
  // Only check finalized sessions for conflicts
  if (event1.status === "OPEN" || event2.status === "OPEN") return false;
  // Events overlap if one starts before the other ends
  return event1.start < event2.end && event2.start < event1.end;
}

function detectConflicts(events) {
  const conflicts = new Map();

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      if (doEventsOverlap(events[i], events[j])) {
        // Mark both events as conflicting
        if (!conflicts.has(events[i].id)) {
          conflicts.set(events[i].id, []);
        }
        if (!conflicts.has(events[j].id)) {
          conflicts.set(events[j].id, []);
        }
        conflicts.get(events[i].id).push(events[j].title);
        conflicts.get(events[j].id).push(events[i].title);
      }
    }
  }

  return conflicts;
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

function EventCell({ event }) {
  const isPast = event.isPast;
  const hasConflict = event.conflictsWith?.length > 0;

  return (
    <div
      className={`flex items-center gap-1 text-xs ${isPast ? "opacity-60" : ""}`}
      style={{
        backgroundColor: event.groupColor || undefined,
      }}
      title={hasConflict ? `Conflicts with: ${event.conflictsWith.join(", ")}` : event.title}
    >
      {hasConflict && (
        <AlertTriangle className="h-3 w-3 flex-shrink-0 text-amber-200" />
      )}
      <span className="truncate font-medium">{event.title}</span>
      {event.status === "OPEN" && (
        <span className="ml-auto text-[10px] opacity-75">Open</span>
      )}
    </div>
  );
}

export function DashboardCalendar({
  sessions = [],
  getGroupColor = () => null,
  height = 500,
}) {
  const [view, setView] = useState("month");
  const navigate = useNavigate();

  const events = useMemo(() => {
    const now = new Date();
    const baseEvents = sessions
      .filter((session) => session.winningSlot?.start || session.status === "OPEN")
      .map((session) => {
        const startDate = session.winningSlot?.start
          ? new Date(session.winningSlot.start)
          : session.firstSlot?.start
            ? new Date(session.firstSlot.start)
            : new Date();

        const endDate = session.winningSlot?.end
          ? new Date(session.winningSlot.end)
          : session.firstSlot?.end
            ? new Date(session.firstSlot.end)
            : new Date(startDate.getTime() + 4 * 60 * 60 * 1000);

        const isPast = isBefore(startDate, startOfDay(now));

        return {
          id: session.id,
          title: session.title || "Untitled",
          start: startDate,
          end: endDate,
          status: session.status,
          groupColor: session.questingGroupId
            ? getGroupColor(session.questingGroupId)
            : null,
          isPast,
          resource: session,
        };
      });

    // Detect conflicts between finalized sessions
    const conflicts = detectConflicts(baseEvents);

    // Add conflict info to events
    return baseEvents.map((event) => ({
      ...event,
      conflictsWith: conflicts.get(event.id) || [],
    }));
  }, [sessions, getGroupColor]);

  const handleSelectEvent = (event) => {
    const target = `/scheduler/${event.id}`;
    navigate(target);
    setTimeout(() => {
      if (window.location.pathname !== target) {
        window.location.assign(target);
      }
    }, 50);
  };

  const eventStyleGetter = (event) => {
    const hasConflict = event.conflictsWith?.length > 0;
    const style = {
      backgroundColor: event.groupColor || "hsl(210 70% 50%)",
      borderRadius: "8px",
      opacity: event.isPast ? 0.5 : 1,
      border: hasConflict ? "2px solid #f59e0b" : "none",
      color: "white",
      fontSize: "11px",
      padding: "2px 6px",
    };

    if (event.status === "OPEN") {
      style.backgroundColor = event.groupColor || "hsl(210 70% 60%)";
      style.border = "2px dashed rgba(255,255,255,0.5)";
    }

    return { style };
  };

  const dayPropGetter = (date) => {
    const isPast = isBefore(date, startOfDay(new Date()));
    if (isPast) {
      return {
        className: "rbc-past-day",
      };
    }
    return {};
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      {/* View toggle */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Session Calendar
        </h3>
        <div className="flex gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-700">
          <button
            type="button"
            onClick={() => setView("week")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              view === "week"
                ? "bg-brand-primary text-white"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600"
            }`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setView("month")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              view === "month"
                ? "bg-brand-primary text-white"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600"
            }`}
          >
            Month
          </button>
        </div>
      </div>

      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={setView}
        views={["month", "week"]}
        onSelectEvent={handleSelectEvent}
        eventPropGetter={eventStyleGetter}
        dayPropGetter={dayPropGetter}
        components={{ event: EventCell }}
        style={{ height }}
        popup
      />
    </div>
  );
}
