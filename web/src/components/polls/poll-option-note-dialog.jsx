import { PollMarkdownContent } from "./poll-markdown-content";

export function PollOptionNoteDialog({
  noteViewer,
  onClose,
  overlayClassName = "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4",
}) {
  if (!noteViewer) return null;

  return (
    <div className={overlayClassName}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Option note for ${noteViewer.optionLabel}`}
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {noteViewer.pollTitle}
            </p>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Option note: {noteViewer.optionLabel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300"
          >
            Close
          </button>
        </div>
        <PollMarkdownContent
          content={noteViewer.note}
          className="max-h-[65vh] overflow-auto rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
    </div>
  );
}
