import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { AvatarStack, VotingAvatarStack } from "../../../components/ui/voter-avatars";
import { buildColorMap } from "../../../components/ui/voter-avatar-utils";
import { useUserProfiles } from "../../../hooks/useUserProfiles";
import { normalizeEmail } from "../../../lib/utils";
import { PollStatusMeta } from "../../../components/poll-status-meta";

export function SessionCard({
  scheduler,
  isArchived = false,
  groupColor = null,
  showVoteNeeded = false,
  winningSlot = null,
  slots = [],
  participants = [],
  voters = [],
  attendanceSummary = null,
  conflictsWith = [],
  questingGroup = null,
}) {
  const navigate = useNavigate();
  const participantEmails = participants.map((p) => (typeof p === "string" ? p : p.email));
  const voterEmails = voters.map((v) => normalizeEmail(v.email)).filter(Boolean);
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
    (p) => !voterEmailSet.has(normalizeEmail(p.email))
  );

  // Determine guests (participants not in questing group)
  const groupMemberSet = new Set(
    (questingGroup?.members || []).map((email) => normalizeEmail(email)).filter(Boolean)
  );
  const guestCount = participantEmails.filter(
    (email) => !groupMemberSet.has(normalizeEmail(email))
  ).length;

  const totalParticipants = participantUsers.length;
  const hasParticipants = totalParticipants > 0;
  const allVotesIn = scheduler.status === "OPEN" && hasParticipants && pendingVoters.length === 0;
  const isCancelled =
    scheduler?.status === "CANCELLED" ||
    scheduler?.calendarSync?.state === "CANCELLED" ||
    Boolean(
      scheduler?.cancelledAt ||
        scheduler?.calendarSync?.cancelled?.at ||
        scheduler?.calendarSync?.cancelledAt ||
        scheduler?.cancelled?.at
    );
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
        className="relative flex w-full flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-left transition-all duration-150 hover:scale-[1.02] hover:shadow-lg dark:border-slate-700 dark:bg-slate-800"
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
            </div>

            <PollStatusMeta
              scheduler={scheduler}
              winningSlot={winningSlot}
              slots={slots}
              allVotesIn={allVotesIn}
              isArchived={isArchived}
              questingGroupName={questingGroup?.name || null}
              questingGroupColor={groupColor}
              guestCount={guestCount}
            />
          </div>

          {/* Google Calendar indicator */}
          {scheduler.googleEventId && (
            <div className="flex-shrink-0" title="Synced to Google Calendar">
              <ExternalLink className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            </div>
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
            {scheduler.status === "OPEN" && hasParticipants && (
              <div className="flex items-center gap-1.5">
                {pendingVoters.length > 0 ? (
                  <>
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      {pendingVoters.length}/{totalParticipants} pending:
                    </span>
                    <VotingAvatarStack users={pendingVoters} size={18} colorMap={colorMap} />
                  </>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">All voted!</span>
                )}
              </div>
            )}
          </div>
        )}

        {scheduler.status === "FINALIZED" && attendanceSummary && (
          <div className="mt-2 grid w-full gap-2 rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-emerald-600 dark:text-emerald-300">
                Confirmed
              </span>
              <VotingAvatarStack users={confirmedUsers} size={16} colorMap={colorMap} />
              <span className="text-slate-400 dark:text-slate-500">
                {confirmedUsers.length}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-rose-600 dark:text-rose-300">
                Unavailable
              </span>
              <VotingAvatarStack users={unavailableUsers} size={16} colorMap={colorMap} />
              <span className="text-slate-400 dark:text-slate-500">
                {unavailableUsers.length}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-500 dark:text-slate-300">
                Unresponded
              </span>
              <VotingAvatarStack users={unrespondedUsers} size={16} colorMap={colorMap} />
              <span className="text-slate-400 dark:text-slate-500">
                {unrespondedUsers.length}
              </span>
            </div>
          </div>
        )}
      </button>
  );
}
