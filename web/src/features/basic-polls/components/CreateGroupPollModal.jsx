import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, CalendarClock, CircleHelp, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  SimpleModal,
  SimpleModalDescription,
  SimpleModalFooter,
  SimpleModalHeader,
  SimpleModalTitle,
} from "../../../components/ui/simple-modal";
import { Calendar } from "../../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { BASIC_POLL_STATUSES, BASIC_POLL_VOTE_TYPES, resolveBasicPollVoteType } from "../../../lib/basic-polls/constants";
import { createBasicPoll, updateBasicPoll } from "../../../lib/data/basicPolls";
import { coerceDate } from "../../../lib/time";
import { PollMarkdownContent } from "../../../components/polls/poll-markdown-content";
import { QuestingGroupSelect } from "../../scheduler/components/questing-group-select";

function createDefaultOptions() {
  return [
    { id: `option-${crypto.randomUUID()}`, label: "", note: "" },
    { id: `option-${crypto.randomUUID()}`, label: "", note: "" },
  ];
}

function toDateTimeLocalValue(dateValue) {
  const date = coerceDate(dateValue);
  if (!date) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function parseLocalDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeInitialOptions(initialPoll) {
  const rawOptions = Array.isArray(initialPoll?.options) ? initialPoll.options : [];
  const sorted = [...rawOptions].sort((left, right) => {
    const leftOrder = Number.isFinite(left?.order) ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right?.order) ? right.order : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
  const normalized = sorted.map((option, index) => ({
    id: option?.id || `option-${crypto.randomUUID()}`,
    label: String(option?.label || ""),
    note: String(option?.note || ""),
    order: index,
  }));
  if (normalized.length >= 2) return normalized;
  if (normalized.length === 1) {
    return [...normalized, { id: `option-${crypto.randomUUID()}`, label: "", note: "" }];
  }
  return createDefaultOptions();
}

function buildInitialState(selectedGroupId = null, initialPoll = null) {
  const settings = initialPoll?.settings || {};
  const voteType = resolveBasicPollVoteType(settings.voteType);
  const allowMultiple = voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && settings.allowMultiple === true;
  const allowWriteIn = voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && settings.allowWriteIn === true;
  const maxSelections =
    allowMultiple && Number.isFinite(settings.maxSelections)
      ? String(Math.max(1, Number(settings.maxSelections)))
      : "";
  const deadlineAtLocal = toDateTimeLocalValue(settings.deadlineAt || initialPoll?.deadlineAt || null);
  return {
    selectedGroupId,
    title: String(initialPoll?.title || ""),
    description: String(initialPoll?.description || ""),
    descriptionTab: "write",
    voteType,
    allowMultiple,
    maxSelections,
    allowWriteIn,
    deadlineAtLocal,
    options: normalizeInitialOptions(initialPoll),
    noteEditor: { optionId: null, tab: "write", value: "" },
  };
}

export function CreateGroupPollModal({
  open,
  onOpenChange,
  groupId,
  groupName,
  groupOptions = [],
  initialGroupId = null,
  creatorId,
  mode = "create",
  initialPoll = null,
  onCreated,
  onEdited,
}) {
  const isEditMode = mode === "edit";
  const editPollId = initialPoll?.pollId || initialPoll?.id || null;
  const selectableGroups = useMemo(() => {
    if (groupId) {
      return [{ id: groupId, name: groupName || "Questing group" }];
    }
    return Array.isArray(groupOptions) ? groupOptions.filter((group) => group?.id) : [];
  }, [groupId, groupName, groupOptions]);
  const initialSelectedGroupId = useMemo(() => {
    if (groupId) return groupId;
    if (
      initialGroupId &&
      selectableGroups.some((group) => group.id === initialGroupId)
    ) {
      return initialGroupId;
    }
    return selectableGroups[0]?.id || null;
  }, [groupId, initialGroupId, selectableGroups]);

  const [state, setState] = useState(() =>
    buildInitialState(initialSelectedGroupId, initialPoll)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deadlineEditorOpen, setDeadlineEditorOpen] = useState(false);
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const activeGroupId = groupId || state.selectedGroupId || null;
  const activeGroupName =
    groupName ||
    selectableGroups.find((group) => group.id === activeGroupId)?.name ||
    "Questing group";

  useEffect(() => {
    if (!open) return;
    setState(buildInitialState(initialSelectedGroupId, initialPoll));
    setSaving(false);
    setError(null);
  }, [initialPoll, initialSelectedGroupId, open]);

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

  function updateVotingSetup(value) {
    setState((previous) => {
      if (value === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE) {
        return {
          ...previous,
          voteType: BASIC_POLL_VOTE_TYPES.RANKED_CHOICE,
          allowMultiple: false,
          allowWriteIn: false,
          maxSelections: "",
        };
      }
      return {
        ...previous,
        voteType: BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE,
      };
    });
  }

  function updateDeadlineDate(nextDate) {
    if (!nextDate) return;
    setState((previous) => {
      const current = parseLocalDateTime(previous.deadlineAtLocal) || new Date();
      const merged = new Date(current);
      merged.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
      return { ...previous, deadlineAtLocal: toDateTimeLocalValue(merged) };
    });
  }

  function updateDeadlineTime(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return;
    const [hoursText, minutesText] = value.split(":");
    const hours = Number(hoursText);
    const minutes = Number(minutesText);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
    setState((previous) => {
      const current = parseLocalDateTime(previous.deadlineAtLocal) || new Date();
      const merged = new Date(current);
      merged.setHours(hours, minutes, 0, 0);
      return { ...previous, deadlineAtLocal: toDateTimeLocalValue(merged) };
    });
  }

  function clearDeadline() {
    setState((previous) => ({ ...previous, deadlineAtLocal: "" }));
  }

  const filledOptionCount = useMemo(
    () =>
      state.options.filter((option) => String(option?.label || "").trim().length > 0).length,
    [state.options]
  );
  const voteTypeLabel =
    state.voteType === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE ? "Ranked choice" : "Multiple choice";
  const votingSetupValue =
    state.voteType === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE
      ? BASIC_POLL_VOTE_TYPES.RANKED_CHOICE
      : BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE;
  const hasMaxSelectionCustomization =
    state.voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE &&
    state.allowMultiple &&
    String(state.maxSelections || "").trim().length > 0;
  const deadlineDate = useMemo(() => parseLocalDateTime(state.deadlineAtLocal), [state.deadlineAtLocal]);
  const deadlineTimeValue = deadlineDate
    ? `${String(deadlineDate.getHours()).padStart(2, "0")}:${String(
        deadlineDate.getMinutes()
      ).padStart(2, "0")}`
    : "19:00";
  const deadlineChipLabel = deadlineDate
    ? format(deadlineDate, "MMM d, yyyy h:mm a")
    : "Add deadline";

  async function handleSubmitPoll() {
    if (saving) return;
    if (!activeGroupId) {
      setError("Select a questing group.");
      return;
    }
    if (isEditMode && !editPollId) {
      setError("This poll can no longer be edited.");
      return;
    }
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
      state.voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && state.allowMultiple && state.maxSelections
        ? Number(state.maxSelections)
        : null;
    if (
      parsedMaxSelections != null &&
      (!Number.isFinite(parsedMaxSelections) ||
        parsedMaxSelections <= 2 ||
        parsedMaxSelections >= normalizedOptions.length)
    ) {
      setError("Max selections must be greater than 2 and less than the total option count.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: normalizedTitle,
        description: String(state.description || "").trim(),
        options: normalizedOptions,
        settings: {
          voteType: state.voteType,
          allowMultiple: state.voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && state.allowMultiple,
          maxSelections:
            state.voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE &&
            state.allowMultiple &&
            parsedMaxSelections
              ? parsedMaxSelections
              : null,
          allowWriteIn: state.voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && state.allowWriteIn,
          deadlineAt: state.deadlineAtLocal ? new Date(state.deadlineAtLocal) : null,
        },
      };
      if (isEditMode) {
        await updateBasicPoll(activeGroupId, editPollId, payload);
      } else {
        const pollId = await createBasicPoll(
          activeGroupId,
          {
            ...payload,
            creatorId: creatorId || null,
            status: BASIC_POLL_STATUSES.OPEN,
          },
          { useServer: true }
        );
        if (onCreated) onCreated(pollId, activeGroupId);
      }

      toast.success(isEditMode ? "Poll updated" : "Poll created");
      onOpenChange(false);
      if (isEditMode) {
        if (onEdited) onEdited(editPollId, activeGroupId);
      }
    } catch (nextError) {
      setError(nextError?.message || `Failed to ${isEditMode ? "update" : "create"} poll.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SimpleModal
        open={open}
        onOpenChange={onOpenChange}
        contentClassName="max-w-2xl"
      >
        <div className="max-h-[85vh] overflow-y-auto pr-1">
          <SimpleModalHeader>
            <SimpleModalTitle>{isEditMode ? "Edit poll" : "Create poll"}</SimpleModalTitle>
            <SimpleModalDescription>
              {isEditMode
                ? `Update poll details for "${activeGroupName}".`
                : `Create a standalone poll for "${activeGroupName}".`}
            </SimpleModalDescription>
          </SimpleModalHeader>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              {activeGroupName}
            </span>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              {voteTypeLabel}
            </span>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              {filledOptionCount} option{filledOptionCount === 1 ? "" : "s"}
            </span>
            <Popover open={deadlineEditorOpen} onOpenChange={setDeadlineEditorOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  {deadlineChipLabel}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[22rem] p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Deadline
                    </p>
                    {deadlineDate ? (
                      <button
                        type="button"
                        onClick={clearDeadline}
                        className="text-xs font-semibold text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <div className="flex justify-center rounded-xl border border-slate-200 dark:border-slate-700">
                    <Calendar mode="single" selected={deadlineDate || undefined} onSelect={updateDeadlineDate} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Time
                    </label>
                    <input
                      type="time"
                      value={deadlineTimeValue}
                      onChange={(event) => updateDeadlineTime(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="mt-4 space-y-4">
            {!groupId && !isEditMode ? (
              selectableGroups.length > 0 ? (
                <QuestingGroupSelect
                  groups={selectableGroups}
                  selectedId={state.selectedGroupId}
                  onChange={(value) =>
                    setState((previous) => ({
                      ...previous,
                      selectedGroupId: value === "none" ? null : value,
                    }))
                  }
                  label="Questing group"
                  placeholder="Select a questing group"
                  showNoneOption={false}
                  helperText={null}
                />
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200">
                  You need manager access to at least one questing group to create a general poll.
                </p>
              )
            ) : null}

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
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <div className="inline-flex rounded-full border border-slate-300 bg-white p-0.5 text-xs dark:border-slate-600 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() =>
                      setState((previous) => ({ ...previous, descriptionTab: "write" }))
                    }
                    className={`rounded-full px-3 py-1 font-semibold ${
                      state.descriptionTab === "write"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setState((previous) => ({ ...previous, descriptionTab: "preview" }))
                    }
                    className={`rounded-full px-3 py-1 font-semibold ${
                      state.descriptionTab === "preview"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "text-slate-600 dark:text-slate-300"
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              ) : (
                <PollMarkdownContent
                  content={state.description}
                  fallback="_No description_"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                />
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Options</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={votingSetupValue} onValueChange={updateVotingSetup}>
                    <SelectTrigger className="h-8 w-[13rem] rounded-full border-slate-300 bg-white px-3 text-xs dark:border-slate-600 dark:bg-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE}>Multiple choice</SelectItem>
                      <SelectItem value={BASIC_POLL_VOTE_TYPES.RANKED_CHOICE}>Ranked choice</SelectItem>
                    </SelectContent>
                  </Select>
                  <Popover open={customizationOpen} onOpenChange={setCustomizationOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Settings
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-3">
                      {state.voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE ? (
                        <div className="space-y-3">
                          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={state.allowMultiple}
                              onChange={(event) =>
                                setState((previous) => ({
                                  ...previous,
                                  allowMultiple: event.target.checked,
                                  maxSelections: event.target.checked ? previous.maxSelections : "",
                                }))
                              }
                            />
                            Allow multiple
                          </label>
                          {state.allowMultiple ? (
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Max selections
                              </label>
                              <input
                                type="number"
                                min="3"
                                value={state.maxSelections}
                                onChange={(event) =>
                                  setState((previous) => ({
                                    ...previous,
                                    maxSelections: event.target.value,
                                  }))
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                              />
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Must be greater than 2 and less than the total option count.
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Ranked choice has no extra customization settings.
                        </p>
                      )}
                    </PopoverContent>
                  </Popover>
                  {state.voteType === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE ? (
                    <span
                      className="inline-flex h-8 items-center justify-center text-slate-500 dark:text-slate-300"
                      title="Ranked choice does not support multi-select or write-in options."
                      aria-label="Ranked choice help"
                    >
                      <CircleHelp className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {state.voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && state.allowMultiple ? (
                  <div className="group relative">
                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 pr-7 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                      Allow multiple
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setState((previous) => ({
                          ...previous,
                          allowMultiple: false,
                          maxSelections: "",
                        }))
                      }
                      className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 opacity-0 transition-opacity hover:bg-slate-400/15 hover:text-slate-700 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-600/30 dark:hover:text-slate-200"
                      aria-label="Remove allow multiple customization"
                    >
                      x
                    </button>
                  </div>
                ) : null}
                {hasMaxSelectionCustomization ? (
                  <div className="group relative">
                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 pr-7 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                      Max selections: {state.maxSelections}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setState((previous) => ({
                          ...previous,
                          maxSelections: "",
                        }))
                      }
                      className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 opacity-0 transition-opacity hover:bg-slate-400/15 hover:text-slate-700 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-600/30 dark:hover:text-slate-200"
                      aria-label="Remove max selections customization"
                    >
                      x
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 space-y-2">
                {state.options.map((option, index) => (
                  <div
                    key={option.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-300 bg-slate-50 px-1 text-[11px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {index + 1}
                      </span>
                      <input
                        value={option.label}
                        onChange={(event) => updateOption(option.id, { label: event.target.value })}
                        placeholder={`Option ${index + 1}`}
                        className="min-w-[180px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
                      <button
                        type="button"
                        onClick={() => moveOption(option.id, "up")}
                        disabled={index === 0}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <ArrowUp className="h-3 w-3" />
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOption(option.id, "down")}
                        disabled={index === state.options.length - 1}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <ArrowDown className="h-3 w-3" />
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
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        {option.note ? "Edit note" : "Add note"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeOption(option.id)}
                        disabled={state.options.length <= 2}
                        className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-40 dark:border-rose-600 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={addOption}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Option
                </button>
                {state.voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && !state.allowWriteIn ? (
                  <>
                    <span aria-hidden="true">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        setState((previous) => ({
                          ...previous,
                          allowWriteIn: true,
                        }))
                      }
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Other
                    </button>
                  </>
                ) : null}
              </div>
              {state.voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE && state.allowWriteIn ? (
                <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Other (write-in)
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setState((previous) => ({
                        ...previous,
                        allowWriteIn: false,
                      }))
                    }
                    className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-600 dark:text-rose-300 dark:hover:bg-rose-950/30"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
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
              onClick={handleSubmitPoll}
              disabled={saving || (!groupId && selectableGroups.length === 0)}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-60"
            >
              {saving ? (isEditMode ? "Saving..." : "Creating...") : isEditMode ? "Save changes" : "Create poll"}
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
        contentClassName="max-w-2xl"
      >
        <div>
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
              <PollMarkdownContent
                content={state.noteEditor.value}
                fallback="_No note_"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
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
