import { AvatarStack, VotingAvatarStack } from "../ui/voter-avatars";
import { buildColorMap } from "../ui/voter-avatar-utils";

function buildEmailKeySet(users = []) {
  return new Set(
    (users || [])
      .map((entry) => String(entry?.email || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

function toCount(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function PollParticipantSummary({
  eligibleUsers = [],
  votedUsers = [],
  pendingUsers = [],
  eligibleCount = null,
  votedCount = null,
  showPending = true,
  showVoteProgress = true,
  showVoterIdentities = true,
  className = "",
}) {
  const effectiveEligibleCount = toCount(eligibleCount, eligibleUsers.length);
  if (effectiveEligibleCount <= 0) return null;

  const effectiveVotedCount = toCount(votedCount, votedUsers.length);
  const pendingEmailSet = buildEmailKeySet(pendingUsers);
  const pendingCount =
    pendingEmailSet.size > 0
      ? pendingEmailSet.size
      : Math.max(0, effectiveEligibleCount - effectiveVotedCount);
  const participantEmails = (eligibleUsers || [])
    .map((entry) => entry?.email)
    .filter(Boolean);
  const colorMap = buildColorMap(participantEmails);

  return (
    <div className={`flex flex-col gap-1.5 text-xs text-slate-500 dark:text-slate-400 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">
          {effectiveEligibleCount} invitee{effectiveEligibleCount !== 1 ? "s" : ""}:
        </span>
        {showVoterIdentities ? (
          <AvatarStack users={eligibleUsers} max={10} size={18} colorMap={colorMap} />
        ) : (
          <span>{effectiveEligibleCount}</span>
        )}
      </div>
      {!showVoteProgress ? (
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Vote progress hidden.
        </div>
      ) : null}
      {showVoteProgress ? (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {effectiveVotedCount}/{effectiveEligibleCount} voted:
          </span>
          {showVoterIdentities ? (
            <VotingAvatarStack users={votedUsers} max={10} size={18} colorMap={colorMap} />
          ) : null}
        </div>
        {showPending ? (
          <div className="flex items-center gap-1.5">
            {pendingCount > 0 ? (
              <>
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  {pendingCount}/{effectiveEligibleCount} pending:
                </span>
                {showVoterIdentities ? (
                  <VotingAvatarStack users={pendingUsers} max={10} size={18} colorMap={colorMap} />
                ) : null}
              </>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">All voted!</span>
            )}
          </div>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}
