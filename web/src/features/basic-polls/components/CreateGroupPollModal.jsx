import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  SimpleModal,
  SimpleModalDescription,
  SimpleModalFooter,
  SimpleModalHeader,
  SimpleModalTitle,
} from "../../../components/ui/simple-modal";
import { createBasicPoll } from "../../../lib/data/basicPolls";

function createDefaultOptions() {
  return [
    { id: `option-${crypto.randomUUID()}`, label: "", note: "" },
    { id: `option-${crypto.randomUUID()}`, label: "", note: "" },
  ];
}

function buildInitialState() {
  return {
    title: "",
    description: "",
    descriptionTab: "write",
    voteType: "MULTIPLE_CHOICE",
    allowMultiple: false,
    maxSelections: "",
    allowWriteIn: false,
    deadlineAtLocal: "",
    options: createDefaultOptions(),
    noteEditor: { optionId: null, tab: "write", value: "" },
  };
}

export function CreateGroupPollModal({
  open,
  onOpenChange,
  groupId,
  groupName,
  creatorId,
  onCreated,
}) {
  const [state, setState] = useState(() => buildInitialState());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setState(buildInitialState());
    setSaving(false);
    setError(null);
  }, [open]);

  const selectedOption = useMemo(
    () => state.options.find((option) => option.id === state.noteEditor.optionId) || null,
    [state.noteEditor.optionId, state.options]
  );

  function updateOption(optionId, updates) {
    setState((previous) => ({
      ...previous,
      options: previous.options.map((option) =>
        option.id === optionId ? { ...option, ...updates } : option
      ),
    }));
  }

  function moveOption(optionId, direction) {
    setState((previous) => {
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
    setState((previous) => ({
      ...previous,
      options: [...previous.options, { id: `option-${crypto.randomUUID()}`, label: "", note: "" }],
    }));
  }

  function removeOption(optionId) {
    setState((previous) => {
      if (previous.options.length <= 2) return previous;
      return {
        ...previous,
        options: previous.options.filter((option) => option.id !== optionId),
      };
    });
  }

  async function handleCreatePoll() {
    if (!groupId || saving) return;
    const normalizedTitle = String(state.title || "").trim();
    if (!normalizedTitle) {
      setError("Title is required.");
      return;
    }

    const normalizedOptions = state.options
      .map((option, index) => ({
        id: option.id || `option-${index + 1}`,
        label: String(option.label || "").trim(),
        order: index,
        note: String(option.note || "").trim(),
      }))
      .filter((option) => option.label.length > 0);

    if (normalizedOptions.length < 2) {
      setError("Add at least two options.");
      return;
    }

    const parsedMaxSelections =
      state.voteType === "MULTIPLE_CHOICE" && state.allowMultiple && state.maxSelections
        ? Number(state.maxSelections)
        : null;
    if (
      parsedMaxSelections != null &&
      (!Number.isFinite(parsedMaxSelections) || parsedMaxSelections < 1)
    ) {
      setError("Max selections must be a positive number.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const pollId = await createBasicPoll(
        groupId,
        {
          title: normalizedTitle,
          description: String(state.description || "").trim(),
          creatorId: creatorId || null,
          status: "OPEN",
          options: normalizedOptions,
          settings: {
            voteType: state.voteType,
            allowMultiple: state.voteType === "MULTIPLE_CHOICE" && state.allowMultiple,
            maxSelections:
              state.voteType === "MULTIPLE_CHOICE" && state.allowMultiple && parsedMaxSelections
                ? parsedMaxSelections
                : null,
            allowWriteIn: state.voteType === "MULTIPLE_CHOICE" && state.allowWriteIn,
            deadlineAt: state.deadlineAtLocal ? new Date(state.deadlineAtLocal) : null,
          },
        },
        { useServer: true }
      );

      toast.success("Poll created");
      onOpenChange(false);
      if (onCreated) onCreated(pollId);
    } catch (nextError) {
      setError(nextError?.message || "Failed to create poll.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SimpleModal open={open} onOpenChange={onOpenChange}>
        <div className="max-w-2xl">
          <SimpleModalHeader>
            <SimpleModalTitle>Create poll</SimpleModalTitle>
            <SimpleModalDescription>
              Create a standalone poll for "{groupName}".
            </SimpleModalDescription>
          </SimpleModalHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Title
              </label>
              <input
                value={state.title}
                onChange={(event) =>
                  setState((previous) => ({ ...previous, title: event.target.value }))
                }
                placeholder="What should we decide?"
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
                      setState((previous) => ({ ...previous, descriptionTab: "write" }))
                    }
                    className={`rounded-full px-3 py-1 ${
                      state.descriptionTab === "write"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setState((previous) => ({ ...previous, descriptionTab: "preview" }))
                    }
                    className={`rounded-full px-3 py-1 ${
                      state.descriptionTab === "preview"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    }`}
                  >
                    Preview
                  </button>
                </div>
              </div>
              {state.descriptionTab === "write" ? (
                <textarea
                  value={state.description}
                  onChange={(event) =>
                    setState((previous) => ({ ...previous, description: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              ) : (
                <div className="prose prose-sm prose-slate max-w-none rounded-lg border border-slate-200 bg-white px-3 py-2 prose-headings:font-display prose-a:text-brand-primary prose-a:underline hover:prose-a:text-brand-primary/80 dark:prose-invert dark:border-slate-700 dark:bg-slate-900">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {state.description || "_No description_"}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Vote type
                </label>
                <select
                  value={state.voteType}
                  onChange={(event) => {
                    const nextVoteType = event.target.value;
                    setState((previous) => ({
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
                  value={state.deadlineAtLocal}
                  onChange={(event) =>
                    setState((previous) => ({ ...previous, deadlineAtLocal: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
            </div>

            {state.voteType === "MULTIPLE_CHOICE" ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={state.allowMultiple}
                    onChange={(event) =>
                      setState((previous) => ({
                        ...previous,
                        allowMultiple: event.target.checked,
                      }))
                    }
                  />
                  Allow multiple selections
                </label>
                {state.allowMultiple ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Max selections
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={state.maxSelections}
                      onChange={(event) =>
                        setState((previous) => ({
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
                    checked={state.allowWriteIn}
                    onChange={(event) =>
                      setState((previous) => ({
                        ...previous,
                        allowWriteIn: event.target.checked,
                      }))
                    }
                  />
                  Allow write-in "Other"
                </label>
              </div>
            ) : null}

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
                {state.options.map((option, index) => (
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
                        disabled={index === state.options.length - 1}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setState((previous) => ({
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
                        disabled={state.options.length <= 2}
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
              onClick={handleCreatePoll}
              disabled={saving}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create poll"}
            </button>
          </SimpleModalFooter>
        </div>
      </SimpleModal>

      <SimpleModal
        open={Boolean(state.noteEditor.optionId)}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          setState((previous) => ({
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
                  setState((previous) => ({
                    ...previous,
                    noteEditor: { ...previous.noteEditor, tab: "write" },
                  }))
                }
                className={`rounded-full px-3 py-1 ${
                  state.noteEditor.tab === "write"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() =>
                  setState((previous) => ({
                    ...previous,
                    noteEditor: { ...previous.noteEditor, tab: "preview" },
                  }))
                }
                className={`rounded-full px-3 py-1 ${
                  state.noteEditor.tab === "preview"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                Preview
              </button>
            </div>
            {state.noteEditor.tab === "write" ? (
              <textarea
                value={state.noteEditor.value}
                onChange={(event) =>
                  setState((previous) => ({
                    ...previous,
                    noteEditor: { ...previous.noteEditor, value: event.target.value },
                  }))
                }
                rows={6}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            ) : (
              <div className="prose prose-sm prose-slate max-w-none rounded-lg border border-slate-200 bg-white px-3 py-2 prose-headings:font-display prose-a:text-brand-primary prose-a:underline hover:prose-a:text-brand-primary/80 dark:prose-invert dark:border-slate-700 dark:bg-slate-900">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {state.noteEditor.value || "_No note_"}
                </ReactMarkdown>
              </div>
            )}
          </div>

          <SimpleModalFooter className="mt-6">
            <button
              type="button"
              onClick={() =>
                setState((previous) => ({
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
                if (!state.noteEditor.optionId) return;
                updateOption(state.noteEditor.optionId, { note: state.noteEditor.value });
                setState((previous) => ({
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
