import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { Calendar, AlertCircle, AlertTriangle, ExternalLink, Users } from "lucide-react";
import { AvatarStack, buildColorMap } from "../../../components/ui/voter-avatars";
import { useUserProfiles } from "../../../hooks/useUserProfiles";

export function SessionCard({
  scheduler,
  isArchived = false,
  groupColor = null,
  showVoteNeeded = false,
  winningSlot = null,
  participants = [],
  voters = [],
  votedCount = 0,
  attendanceSummary = null,
  conflictsWith = [],
  questingGroup = null,
}) {
  const navigate = useNavigate();
  const participantEmails = participants.map((p) => (typeof p === "string" ? p : p.email));
  const voterEmails = voters.map((v) => v.email?.toLowerCase()).filter(Boolean);
  const colorMap = buildColorMap(participantEmails);
  const { enrichUsers } = useUserProfiles(participantEmails);
  const participantUsers = enrichUsers(participantEmails);
  const confirmedUsers = useMemo(
    () => enrichUsers(attendanceSummary?.confirmed || []),
    [attendanceSummary?.confirmed, enrichUsers]
  );
  const unavailableUsers = useMemo(
    () => enrichUsers(attendanceSummary?.unavailable || []),
    [attendanceSummary?.unavailable, enrichUsers]
  );
  const unrespondedUsers = useMemo(
    () => enrichUsers(attendanceSummary?.unresponded || []),
    [attendanceSummary?.unresponded, enrichUsers]
  );
  // Calculate who has voted and who hasn't
  const voterEmailSet = new Set(voterEmails);
  const pendingVoters = participantUsers.filter(
    (p) => !voterEmailSet.has(p.email?.toLowerCase())
  );
  const respondedVoters = participantUsers.filter(
    (p) => voterEmailSet.has(p.email?.toLowerCase())
  );

  // Determine guests (participants not in questing group)
  const groupMemberSet = new Set(
    (questingGroup?.members || []).map((m) => m.toLowerCase())
  );
  const guestCount = participantEmails.filter(
    (email) => !groupMemberSet.has(email.toLowerCase())
  ).length;

  const totalParticipants = scheduler.participants?.length || 0;
  const actualVotedCount = respondedVoters.length || votedCount;

  // Determine the time display
  let timeDisplay = null;
  let relativeTime = null;

  if (winningSlot?.start) {
    const slotDate = new Date(winningSlot.start);
    timeDisplay = format(slotDate, "MMM d, yyyy · h:mm a");
    if (slotDate > new Date()) {
      relativeTime = formatDistanceToNow(slotDate, { addSuffix: true });
    }
  }

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
      <button
        type="button"
        onClick={handleOpen}
        className="relative flex w-full flex-col gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left transition-all duration-150 hover:scale-[1.02] hover:shadow-lg dark:border-slate-700 dark:bg-slate-800"
        style={{
          borderLeftWidth: groupColor ? "4px" : undefined,
          borderLeftColor: groupColor || undefined,
        }}
      >
        {/* Title Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {scheduler.title || "Untitled poll"}
              </p>
              {showVoteNeeded && (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  <AlertCircle className="h-3 w-3" />
                  Needs vote
                </span>
              )}
              {conflictsWith.length > 0 && (
                <span
                  className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
                  title={`Conflicts with: ${conflictsWith.join(", ")}`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Conflict
                </span>
              )}
              {isArchived && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  Archived
                </span>
              )}
            </div>

            {/* Date/time for finalized sessions */}
            {timeDisplay && (
              <div className="mt-1 flex items-center gap-2">
                <Calendar className="h-3 w-3 text-emerald-500" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {timeDisplay}
                </span>
                {relativeTime && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    {relativeTime}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Google Calendar indicator */}
          {scheduler.googleEventId && (
            <div className="flex-shrink-0" title="Synced to Google Calendar">
              <ExternalLink className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            </div>
          )}
        </div>

        {/* Status and Group Row */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status badge */}
          {scheduler.status === "OPEN" && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              Open
            </span>
          )}
          {scheduler.status === "FINALIZED" && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              Finalized
            </span>
          )}

          {/* Questing Group chip */}
          {questingGroup && (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: groupColor || "#6366f1" }}
            >
              <Users className="h-3 w-3" />
              {questingGroup.name}
              {guestCount > 0 && (
                <span className="opacity-80">+ {guestCount} guest{guestCount !== 1 ? "s" : ""}</span>
              )}
            </span>
          )}
        </div>

        {/* Participants Row - only show if we have participants */}
        {participantUsers.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            {/* Invitees section */}
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{participantUsers.length} invitee{participantUsers.length !== 1 ? "s" : ""}:</span>
              <AvatarStack
                users={participantUsers}
                max={10}
                size={18}
                colorMap={colorMap}
              />
            </div>

            {/* Pending votes section - only show for open polls */}
            {scheduler.status === "OPEN" && (
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  {pendingVoters.length}/{totalParticipants} pending:
                </span>
                {pendingVoters.length > 0 ? (
                  <AvatarStack
                    users={pendingVoters}
                    max={10}
                    size={18}
                    colorMap={colorMap}
                  />
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">All voted!</span>
                )}
              </div>
            )}
          </div>
        )}

        {scheduler.status === "FINALIZED" && attendanceSummary && (
          <div className="mt-2 grid w-full gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-emerald-600 dark:text-emerald-300">
                Confirmed
              </span>
              <AvatarStack users={confirmedUsers} max={4} size={16} colorMap={colorMap} />
              <span className="text-slate-400 dark:text-slate-500">
                {confirmedUsers.length}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-rose-600 dark:text-rose-300">
                Unavailable
              </span>
              <AvatarStack users={unavailableUsers} max={4} size={16} colorMap={colorMap} />
              <span className="text-slate-400 dark:text-slate-500">
                {unavailableUsers.length}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-500 dark:text-slate-300">
                Unresponded
              </span>
              <AvatarStack users={unrespondedUsers} max={4} size={16} colorMap={colorMap} />
              <span className="text-slate-400 dark:text-slate-500">
                {unrespondedUsers.length}
              </span>
            </div>
          </div>
        )}
      </button>
  );
}
