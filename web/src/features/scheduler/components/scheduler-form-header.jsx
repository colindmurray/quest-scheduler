export function SchedulerFormHeader({ title, subtitle, onBack, backLabel = "Back" }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onBack}
        className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
      >
        {backLabel}
      </button>
    </div>
  );
}
