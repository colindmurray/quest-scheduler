import { useEffect, useMemo, useState } from "react";
import {
  SimpleModal,
  SimpleModalDescription,
  SimpleModalFooter,
  SimpleModalHeader,
  SimpleModalTitle,
} from "../../../components/ui/simple-modal";
import { PollMarkdownContent } from "../../../components/polls/poll-markdown-content";
import {
  DEFAULT_VOTE_VISIBILITY,
  VOTE_VISIBILITY,
  VOTE_VISIBILITY_OPTIONS,
  resolveHideVoterIdentitiesForVisibility,
  resolveVoteVisibility,
} from "../../../lib/vote-visibility";

function buildDefaultOptions() {
  return [
    { id: `option-${crypto.randomUUID()}`, label: "", note: "" },
    { id: `option-${crypto.randomUUID()}`, label: "", note: "" },
  ];
}

function createInitialDraft(initialPoll) {
  if (!initialPoll) {
    return {
      title: "",
      description: "",
      voteType: "MULTIPLE_CHOICE",
      allowMultiple: false,
      maxSelections: "",
      allowWriteIn: false,
      required: false,
      voteVisibility: DEFAULT_VOTE_VISIBILITY,
      hideVoterIdentities: false,
      deadlineAtLocal: "",
      options: buildDefaultOptions(),
      descriptionTab: "write",
      noteEditor: { optionId: null, tab: "write", value: "" },
    };
  }

  const settings = initialPoll.settings || {};
  const voteType = settings.voteType || "MULTIPLE_CHOICE";
  const options = Array.isArray(initialPoll.options) ? initialPoll.options : [];
  const normalizedOptions = options.length
    ? options
        .slice()
        .sort((left, right) => {
          const leftOrder = Number.isFinite(left?.order) ? left.order : Number.MAX_SAFE_INTEGER;
          const rightOrder = Number.isFinite(right?.order) ? right.order : Number.MAX_SAFE_INTEGER;
          return leftOrder - rightOrder;
        })
        .map((option, index) => ({
          id: option?.id || `option-${index + 1}`,
          label: option?.label || "",
          note: option?.note || "",
        }))
    : buildDefaultOptions();
  const deadline =
    settings.deadlineAt && typeof settings.deadlineAt.toDate === "function"
      ? settings.deadlineAt.toDate()
      : settings.deadlineAt
        ? new Date(settings.deadlineAt)
        : null;
  const deadlineAtLocal =
    deadline && !Number.isNaN(deadline.getTime())
      ? new Date(deadline.getTime() - deadline.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : "";

  return {
    title: initialPoll.title || "",
    description: initialPoll.description || "",
    voteType,
    allowMultiple: voteType === "MULTIPLE_CHOICE" && settings.allowMultiple === true,
    maxSelections:
      voteType === "MULTIPLE_CHOICE" && Number.isFinite(settings.maxSelections)
        ? String(settings.maxSelections)
        : "",
    allowWriteIn: voteType === "MULTIPLE_CHOICE" && settings.allowWriteIn === true,
    required: initialPoll.required === true,
    voteVisibility: resolveVoteVisibility(initialPoll?.voteVisibility),
    hideVoterIdentities: resolveHideVoterIdentitiesForVisibility(
      initialPoll?.hideVoterIdentities === true,
      initialPoll?.voteVisibility
    ),
    deadlineAtLocal,
    options: normalizedOptions,
    descriptionTab: "write",
    noteEditor: { optionId: null, tab: "write", value: "" },
  };
}

export function EmbeddedPollEditorModal({
  open,
  onOpenChange,
  initialPoll = null,
  onSave,
  saving = false,
}) {
  const [draft, setDraft] = useState(() => createInitialDraft(initialPoll));
  const [error, setError] = useState(null);
  const [votePrivacyExpanded, setVotePrivacyExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(createInitialDraft(initialPoll));
    setError(null);
    setVotePrivacyExpanded(false);
  }, [open, initialPoll]);

  const selectedOption = useMemo(
    () => draft.options.find((option) => option.id === draft.noteEditor.optionId) || null,
    [draft.noteEditor.optionId, draft.options]
  );
  const hideVoterIdentitiesLocked = draft.voteVisibility === VOTE_VISIBILITY.FULL;
  const voteVisibilityLabel =
    VOTE_VISIBILITY_OPTIONS.find((option) => option.value === resolveVoteVisibility(draft.voteVisibility))
      ?.label || "Vote visibility";

  function updateOption(optionId, updates) {
    setDraft((previous) => ({
      ...previous,
      options: previous.options.map((option) =>
        option.id === optionId ? { ...option, ...updates } : option
      ),
    }));
  }

  function moveOption(optionId, direction) {
    setDraft((previous) => {
      const currentIndex = previous.options.findIndex((option) => option.id === optionId);
      if (currentIndex < 0) return previous;
      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= previous.options.length) return previous;
      const nextOptions = [...previous.options];
      const [moved] = nextOptions.splice(currentIndex, 1);
      nextOptions.splice(nextIndex, 0, moved);
      return { ...previous, options: nextOptions };
    });
  }

  function addOption() {
    setDraft((previous) => ({
      ...previous,
      options: [...previous.options, { id: `option-${crypto.randomUUID()}`, label: "", note: "" }],
    }));
  }

  function removeOption(optionId) {
    setDraft((previous) => {
      if (previous.options.length <= 2) return previous;
      return {
        ...previous,
        options: previous.options.filter((option) => option.id !== optionId),
      };
    });
  }

  async function handleSave() {
    const normalizedTitle = String(draft.title || "").trim();
    if (!normalizedTitle) {
      setError("Poll title is required.");
      return;
    }

    const normalizedOptions = draft.options
      .map((option, index) => ({
        id: option.id || `option-${index + 1}`,
        label: String(option.label || "").trim(),
        order: index,
        note: String(option.note || "").trim(),
      }))
      .filter((option) => option.label.length > 0);
    if (normalizedOptions.length < 2) {
      setError("At least two options are required.");
      return;
    }

    const parsedMaxSelections =
      draft.voteType === "MULTIPLE_CHOICE" && draft.allowMultiple && draft.maxSelections
        ? Number(draft.maxSelections)
        : null;
    if (
      parsedMaxSelections != null &&
      (!Number.isFinite(parsedMaxSelections) || parsedMaxSelections < 1)
    ) {
      setError("Max selections must be a positive number.");
      return;
    }

    const deadlineAt = draft.deadlineAtLocal ? new Date(draft.deadlineAtLocal) : null;
    if (deadlineAt && Number.isNaN(deadlineAt.getTime())) {
      setError("Deadline is invalid.");
      return;
    }

    setError(null);
    try {
      const normalizedVoteVisibility = resolveVoteVisibility(draft.voteVisibility);
      await onSave({
        title: normalizedTitle,
        description: String(draft.description || "").trim(),
        options: normalizedOptions,
        required: draft.required,
        voteVisibility: normalizedVoteVisibility,
        hideVoterIdentities: resolveHideVoterIdentitiesForVisibility(
          draft.hideVoterIdentities === true,
          normalizedVoteVisibility
        ),
        settings: {
          voteType: draft.voteType,
          allowMultiple: draft.voteType === "MULTIPLE_CHOICE" && draft.allowMultiple,
          maxSelections:
            draft.voteType === "MULTIPLE_CHOICE" && draft.allowMultiple && parsedMaxSelections
              ? parsedMaxSelections
              : null,
          allowWriteIn: draft.voteType === "MULTIPLE_CHOICE" && draft.allowWriteIn,
          deadlineAt: deadlineAt || null,
        },
      });
      onOpenChange(false);
    } catch (nextError) {
      setError(nextError?.message || "Failed to save embedded poll.");
    }
  }

  return (
    <>
      <SimpleModal open={open} onOpenChange={onOpenChange}>
        <div className="max-w-2xl">
          <SimpleModalHeader>
            <SimpleModalTitle>{initialPoll ? "Edit embedded poll" : "Add embedded poll"}</SimpleModalTitle>
            <SimpleModalDescription>
              Configure an embedded poll for this session.
            </SimpleModalDescription>
          </SimpleModalHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Title
              </label>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, title: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((previous) => ({ ...previous, descriptionTab: "write" }))
                    }
                    className={`rounded-full px-3 py-1 ${
                      draft.descriptionTab === "write"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((previous) => ({ ...previous, descriptionTab: "preview" }))
                    }
                    className={`rounded-full px-3 py-1 ${
                      draft.descriptionTab === "preview"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    }`}
                  >
                    Preview
                  </button>
                </div>
              </div>
              {draft.descriptionTab === "write" ? (
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, description: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              ) : (
                <PollMarkdownContent
                  content={draft.description}
                  fallback="_No description_"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                />
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Vote type
                </label>
                <select
                  value={draft.voteType}
                  onChange={(event) => {
                    const nextVoteType = event.target.value;
                    setDraft((previous) => ({
                      ...previous,
                      voteType: nextVoteType,
                      allowMultiple: nextVoteType === "MULTIPLE_CHOICE" ? previous.allowMultiple : false,
                      allowWriteIn: nextVoteType === "MULTIPLE_CHOICE" ? previous.allowWriteIn : false,
                      maxSelections: nextVoteType === "MULTIPLE_CHOICE" ? previous.maxSelections : "",
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="MULTIPLE_CHOICE">Multiple choice</option>
                  <option value="RANKED_CHOICE">Ranked choice</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Deadline
                </label>
                <input
                  type="datetime-local"
                  value={draft.deadlineAtLocal}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, deadlineAtLocal: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Vote privacy
                      </label>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Current: {voteVisibilityLabel}
                        {draft.hideVoterIdentities ? " + identities hidden" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVotePrivacyExpanded((previous) => !previous)}
                      aria-expanded={votePrivacyExpanded}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {votePrivacyExpanded ? "Hide privacy" : "Edit privacy"}
                    </button>
                  </div>
                  {votePrivacyExpanded ? (
                    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-700 dark:bg-slate-900/60">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={draft.hideVoterIdentities}
                            disabled={hideVoterIdentitiesLocked}
                            onChange={(event) =>
                              setDraft((previous) => ({
                                ...previous,
                                hideVoterIdentities: event.target.checked,
                              }))
                            }
                            className="disabled:cursor-not-allowed"
                          />
                          <span className="font-medium">Hide who has/hasn't voted</span>
                        </label>
                        <div className="w-full shrink-0 sm:w-64">
                          <select
                            value={draft.voteVisibility}
                            onChange={(event) => {
                              const nextVisibility = resolveVoteVisibility(event.target.value);
                              setDraft((previous) => ({
                                ...previous,
                                voteVisibility: nextVisibility,
                                hideVoterIdentities: resolveHideVoterIdentitiesForVisibility(
                                  previous.hideVoterIdentities,
                                  nextVisibility
                                ),
                              }));
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {VOTE_VISIBILITY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {
                          VOTE_VISIBILITY_OPTIONS.find(
                            (option) => option.value === resolveVoteVisibility(draft.voteVisibility)
                          )?.description
                        }
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {hideVoterIdentitiesLocked
                          ? "Hide who has/hasn't voted is unavailable for Full visibility."
                          : "When enabled, only show vote counts without revealing who voted."}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {draft.voteType === "MULTIPLE_CHOICE" ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.allowMultiple}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        allowMultiple: event.target.checked,
                      }))
                    }
                  />
                  Allow multiple selections
                </label>
                {draft.allowMultiple ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Max selections
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={draft.maxSelections}
                      onChange={(event) =>
                        setDraft((previous) => ({
                          ...previous,
                          maxSelections: event.target.value,
                        }))
                      }
                      className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.allowWriteIn}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        allowWriteIn: event.target.checked,
                      }))
                    }
                  />
                  Allow write-in "Other"
                </label>
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, required: event.target.checked }))
                }
              />
              Required poll
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Options</h3>
                <button
                  type="button"
                  onClick={addOption}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  Add option
                </button>
              </div>
              <div className="space-y-2">
                {draft.options.map((option, index) => (
                  <div
                    key={option.id}
                    className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={option.label}
                        onChange={(event) => updateOption(option.id, { label: event.target.value })}
                        placeholder={`Option ${index + 1}`}
                        className="min-w-[180px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => moveOption(option.id, "up")}
                        disabled={index === 0}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOption(option.id, "down")}
                        disabled={index === draft.options.length - 1}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((previous) => ({
                            ...previous,
                            noteEditor: { optionId: option.id, tab: "write", value: option.note || "" },
                          }))
                        }
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700"
                      >
                        {option.note ? "Edit note" : "Add note"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeOption(option.id)}
                        disabled={draft.options.length <= 2}
                        className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-40 dark:border-rose-600 dark:text-rose-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
          </div>

          <SimpleModalFooter className="mt-6">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : initialPoll ? "Save poll" : "Add poll"}
            </button>
          </SimpleModalFooter>
        </div>
      </SimpleModal>

      <SimpleModal
        open={Boolean(draft.noteEditor.optionId)}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          setDraft((previous) => ({
            ...previous,
            noteEditor: { optionId: null, tab: "write", value: "" },
          }));
        }}
      >
        <div className="max-w-lg">
          <SimpleModalHeader>
            <SimpleModalTitle>Option note</SimpleModalTitle>
            <SimpleModalDescription>
              Add markdown details for {selectedOption?.label || "this option"}.
            </SimpleModalDescription>
          </SimpleModalHeader>
          <div className="mt-4 space-y-3">
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() =>
                  setDraft((previous) => ({
                    ...previous,
                    noteEditor: { ...previous.noteEditor, tab: "write" },
                  }))
                }
                className={`rounded-full px-3 py-1 ${
                  draft.noteEditor.tab === "write"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft((previous) => ({
                    ...previous,
                    noteEditor: { ...previous.noteEditor, tab: "preview" },
                  }))
                }
                className={`rounded-full px-3 py-1 ${
                  draft.noteEditor.tab === "preview"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                Preview
              </button>
            </div>
            {draft.noteEditor.tab === "write" ? (
              <textarea
                value={draft.noteEditor.value}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    noteEditor: { ...previous.noteEditor, value: event.target.value },
                  }))
                }
                rows={6}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            ) : (
              <PollMarkdownContent
                content={draft.noteEditor.value}
                fallback="_No note_"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            )}
          </div>

          <SimpleModalFooter className="mt-6">
            <button
              type="button"
              onClick={() =>
                setDraft((previous) => ({
                  ...previous,
                  noteEditor: { optionId: null, tab: "write", value: "" },
                }))
              }
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!draft.noteEditor.optionId) return;
                updateOption(draft.noteEditor.optionId, { note: draft.noteEditor.value });
                setDraft((previous) => ({
                  ...previous,
                  noteEditor: { optionId: null, tab: "write", value: "" },
                }));
              }}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
            >
              Save note
            </button>
          </SimpleModalFooter>
        </div>
      </SimpleModal>
    </>
  );
}
