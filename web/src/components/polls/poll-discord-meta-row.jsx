export function PollDiscordMetaRow({
  statusLabel = "",
  messageUrl = "",
  pendingSync = false,
  className = "",
  children = null,
}) {
  const normalizedStatus = String(statusLabel || "").trim();
  const normalizedUrl = String(messageUrl || "").trim();
  const hasContent = Boolean(normalizedStatus || normalizedUrl || pendingSync || children);
  if (!hasContent) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 ${className}`.trim()}>
      {normalizedStatus ? (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
          {normalizedStatus}
        </span>
      ) : null}
      {pendingSync ? (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200">
          Sync pending
        </span>
      ) : null}
      {normalizedUrl ? (
        <a
          href={normalizedUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          View in Discord
        </a>
      ) : null}
      {children}
    </div>
  );
}
