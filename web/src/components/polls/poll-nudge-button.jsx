const NUDGE_COOLDOWN_MS = 8 * 60 * 60 * 1000;

function resolveDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    const resolved = value.toDate();
    return Number.isFinite(resolved?.getTime?.()) ? resolved : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function getNudgeCooldownRemaining(lastNudgeAt, nowMs = Date.now()) {
  const lastNudgeDate = resolveDate(lastNudgeAt);
  if (!lastNudgeDate) return 0;

  const elapsed = nowMs - lastNudgeDate.getTime();
  return Math.max(0, NUDGE_COOLDOWN_MS - elapsed);
}

function formatCooldown(remainingMs) {
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const mins = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function PollNudgeButton({
  onClick,
  sending = false,
  cooldownRemainingMs = 0,
  disabled = false,
  className = "",
}) {
  const onCooldown = cooldownRemainingMs > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || sending || onCooldown}
      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
        onCooldown
          ? "border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed dark:border-slate-600 dark:bg-slate-700 dark:text-slate-500"
          : "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
      } ${sending ? "opacity-50" : ""} ${className}`.trim()}
      title={
        onCooldown
          ? "Nudge is on cooldown"
          : "Send a reminder to participants who haven't voted"
      }
    >
      {sending ? "Sending..." : onCooldown ? formatCooldown(cooldownRemainingMs) : "Nudge participants"}
    </button>
  );
}

export const __test__ = {
  resolveDate,
  formatCooldown,
  NUDGE_COOLDOWN_MS,
};
