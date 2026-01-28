import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { Calendar, ExternalLink, Users } from "lucide-react";
import { AvatarStack } from "../../../components/ui/voter-avatars";
import { buildColorMap } from "../../../components/ui/voter-avatar-utils";
import { useUserProfiles } from "../../../hooks/useUserProfiles";

export function NextSessionCard({ scheduler, winningSlot, groupColor, participants = [] }) {
  const navigate = useNavigate();
  const participantEmails = participants.map((p) => (typeof p === "string" ? p : p.email));
  const colorMap = buildColorMap(participantEmails);
  const { enrichUsers } = useUserProfiles(participantEmails);
  const participantUsers = enrichUsers(participantEmails);

  if (!scheduler || !winningSlot) {
    return null;
  }

  const slotDate = new Date(winningSlot.start);
  const slotEnd = winningSlot.end ? new Date(winningSlot.end) : null;
  const relativeTime = formatDistanceToNow(slotDate, { addSuffix: true });

  const googleCalendarUrl = scheduler.googleEventId
    ? `https://calendar.google.com/calendar/event?eid=${btoa(scheduler.googleEventId)}`
    : null;

  const handleOpen = () => {
    const target = `/scheduler/${scheduler.id}`;
    navigate(target);
    setTimeout(() => {
      if (window.location.pathname !== target) {
        window.location.assign(target);
      }
    }, 50);
  };

  return (
    <div
      className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50 p-6 shadow-lg shadow-slate-200/50 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:shadow-slate-900/50"
      style={{
        borderLeftWidth: groupColor ? "6px" : undefined,
        borderLeftColor: groupColor || undefined,
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Next Session
          </p>
          <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
            {scheduler.title || "Untitled Session"}
          </h3>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          {relativeTime}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary/10 dark:bg-brand-primary/20">
          <Calendar className="h-6 w-6 text-brand-primary" />
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {format(slotDate, "EEEE, MMMM d")}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {format(slotDate, "h:mm a")}
            {slotEnd && ` - ${format(slotEnd, "h:mm a")}`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <AvatarStack
            users={participantUsers}
            max={6}
            size={24}
            colorMap={colorMap}
          />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {participants.length} participant{participants.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex gap-2">
          {googleCalendarUrl && (
            <a
              href={googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
              Calendar
            </a>
          )}
          <button
            type="button"
            onClick={handleOpen}
            className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90"
          >
            View details
          </button>
        </div>
      </div>
    </div>
  );
}
