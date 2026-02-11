import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../../app/useAuth";
import { AvatarStack } from "../../components/ui/voter-avatars";
import { LoadingState } from "../../components/ui/spinner";
import { useQuestingGroups } from "../../hooks/useQuestingGroups";
import { useUserProfilesByIds } from "../../hooks/useUserProfiles";
import { getUserLabel } from "../../lib/identity";
import { computeInstantRunoffResults } from "../../lib/basic-polls/irv";
import { computeMultipleChoiceTallies } from "../../lib/basic-polls/multiple-choice";
import {
  deleteBasicPollVote,
  resetBasicPollVotes,
  submitBasicPollVote,
  updateBasicPoll,
  subscribeToBasicPoll,
  subscribeToBasicPollVotes,
  subscribeToMyBasicPollVote,
} from "../../lib/data/basicPolls";

const OTHER_OPTION_ID = "__other__";
const MAX_WRITE_IN_LENGTH = 120;

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeVoteOptionIds(vote) {
  return Array.isArray(vote?.optionIds)
    ? vote.optionIds.filter((id) => typeof id === "string" && id.trim())
    : [];
}

function normalizeVoteRankings(vote) {
  return Array.isArray(vote?.rankings)
    ? vote.rankings.filter((id) => typeof id === "string" && id.trim())
    : [];
}

function normalizeCount(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function toDateTimeLocalValue(dateValue) {
  const date = toDate(dateValue);
  if (!date) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function RankedOptionItem({
  option,
  index,
  total,
  disabled = false,
  onMoveUp,
  onMoveDown,
  onUnrank,
  onViewNote,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
    disabled,
  });
  const hasNote = String(option?.note || "").trim().length > 0;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-200 p-1 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
          disabled={disabled}
          aria-label={`Drag ${option.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
            {index + 1}. {option.label}
          </p>
          {hasNote ? (
            <button
              type="button"
              onClick={() => onViewNote?.(option)}
              className="mt-1 text-xs font-semibold text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
            >
              View note
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMoveUp(option.id)}
            disabled={disabled || index === 0}
            aria-label={`Move ${option.label} up`}
            className="rounded-md border border-slate-200 p-1 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(option.id)}
            disabled={disabled || index === total - 1}
            aria-label={`Move ${option.label} down`}
            className="rounded-md border border-slate-200 p-1 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onUnrank(option.id)}
            disabled={disabled}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            Unrank
          </button>
        </div>
      </div>
    </li>
  );
}

export default function GroupPollPage() {
  const { groupId, pollId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { groups, loading: groupsLoading } = useQuestingGroups();

  const [poll, setPoll] = useState(null);
  const [pollLoading, setPollLoading] = useState(true);
  const [pollError, setPollError] = useState(null);

  const [votes, setVotes] = useState([]);
  const [votesLoading, setVotesLoading] = useState(true);
  const [myVote, setMyVote] = useState(null);

  const [selectedOptionIds, setSelectedOptionIds] = useState([]);
  const [otherText, setOtherText] = useState("");
  const [rankedOptionIds, setRankedOptionIds] = useState([]);

  const [submittingVote, setSubmittingVote] = useState(false);
  const [clearingVote, setClearingVote] = useState(false);
  const [voteActionError, setVoteActionError] = useState(null);
  const [expandedResultKey, setExpandedResultKey] = useState(null);

  const [editMode, setEditMode] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [editorTab, setEditorTab] = useState("write");
  const [noteEditor, setNoteEditor] = useState({ optionId: null, tab: "write", value: "" });
  const [noteViewer, setNoteViewer] = useState(null);
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    voteType: "MULTIPLE_CHOICE",
    allowMultiple: false,
    maxSelections: "",
    allowWriteIn: false,
    deadlineAtLocal: "",
    options: [],
  });

  const group = useMemo(
    () => (groups || []).find((entry) => entry.id === groupId) || null,
    [groups, groupId]
  );
  const isGroupMember = Boolean(group);
  const canManagePoll =
    Boolean(group && user?.uid) &&
    (group.creatorId === user.uid || (group.memberManaged === true && group.memberIds?.includes(user.uid)));
  const isAccessDenied = !groupsLoading && (!groupId || !isGroupMember || pollError?.code === "permission-denied");

  const sortedOptions = useMemo(() => {
    const options = Array.isArray(poll?.options) ? poll.options : [];
    return [...options].sort((left, right) => {
      const leftOrder = Number.isFinite(left?.order) ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right?.order) ? right.order : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return String(left?.label || "").localeCompare(String(right?.label || ""));
    });
  }, [poll?.options]);

  const optionsById = useMemo(() => {
    const map = new Map();
    sortedOptions.forEach((option) => {
      if (option?.id) map.set(option.id, option);
    });
    return map;
  }, [sortedOptions]);

  const settings = poll?.settings || {};
  const voteType = settings.voteType || "MULTIPLE_CHOICE";
  const isMultipleChoice = voteType === "MULTIPLE_CHOICE";
  const isRankedChoice = voteType === "RANKED_CHOICE";

  const allowMultiple = settings.allowMultiple === true;
  const allowWriteIn = settings.allowWriteIn === true;
  const maxSelections = Number.isFinite(settings.maxSelections)
    ? Math.max(1, Number(settings.maxSelections))
    : null;

  const deadlineAt = toDate(settings.deadlineAt || poll?.deadlineAt || null);
  const isPollOpen = (poll?.status || "OPEN") === "OPEN";
  const isFinalizedPoll = (poll?.status || "OPEN") === "FINALIZED";
  const isDeadlinePassed = Boolean(deadlineAt && Date.now() >= deadlineAt.getTime());
  const isWritable = isPollOpen && !isDeadlinePassed;
  const finalResults = poll?.finalResults || null;

  const rankedOptions = useMemo(
    () => rankedOptionIds.map((id) => optionsById.get(id)).filter(Boolean),
    [optionsById, rankedOptionIds]
  );
  const unrankedOptions = useMemo(
    () => sortedOptions.filter((option) => option?.id && !rankedOptionIds.includes(option.id)),
    [rankedOptionIds, sortedOptions]
  );

  const useFinalizedMultipleSnapshot = Boolean(
    isMultipleChoice &&
      isFinalizedPoll &&
      finalResults?.voteType === "MULTIPLE_CHOICE" &&
      Array.isArray(finalResults?.rows)
  );

  const tallyRowsMultiple = useMemo(() => {
    if (!isMultipleChoice) return [];
    if (useFinalizedMultipleSnapshot) {
      return finalResults.rows.map((row, index) => ({
        key: row?.key || `snapshot-row-${index}`,
        label: row?.label || `Option ${index + 1}`,
        order: Number.isFinite(row?.order) ? row.order : index,
        count: normalizeCount(row?.count),
        percentage: normalizeCount(row?.percentage),
        voterIds: Array.isArray(row?.voterIds) ? row.voterIds.filter(Boolean) : [],
      }));
    }
    return computeMultipleChoiceTallies({
      options: sortedOptions,
      votes,
      allowWriteIn,
    }).rows;
  }, [allowWriteIn, finalResults?.rows, isMultipleChoice, sortedOptions, useFinalizedMultipleSnapshot, votes]);

  const tallyRowsRanked = useMemo(() => {
    if (!isRankedChoice) return [];
    const rows = sortedOptions.map((option, index) => {
      const firstChoiceVoterIds = votes
        .filter((voteDoc) => normalizeVoteRankings(voteDoc)[0] === option.id)
        .map((voteDoc) => voteDoc.id);
      return {
        key: option.id || `option-${index}`,
        label: option.label || `Option ${index + 1}`,
        order: Number.isFinite(option.order) ? option.order : index,
        count: firstChoiceVoterIds.length,
      };
    });
    return rows.sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      if (left.order !== right.order) return left.order - right.order;
      return left.label.localeCompare(right.label);
    });
  }, [isRankedChoice, sortedOptions, votes]);
  const rankedFinalResults = useMemo(() => {
    if (!isRankedChoice) return null;
    if (isFinalizedPoll && finalResults?.voteType === "RANKED_CHOICE") {
      return {
        rounds: Array.isArray(finalResults.rounds) ? finalResults.rounds : [],
        winnerIds: Array.isArray(finalResults.winnerIds) ? finalResults.winnerIds : [],
        tiedIds: Array.isArray(finalResults.tiedIds) ? finalResults.tiedIds : [],
        totalBallots: Number.isFinite(finalResults.voterCount)
          ? finalResults.voterCount
          : normalizeCount(finalResults.totalBallots),
      };
    }
    return computeInstantRunoffResults({
      optionIds: sortedOptions.map((option) => option.id).filter(Boolean),
      votes,
    });
  }, [finalResults, isFinalizedPoll, isRankedChoice, sortedOptions, votes]);

  const totalVoters = useMemo(() => {
    if (useFinalizedMultipleSnapshot) {
      return Number.isFinite(finalResults?.voterCount) ? finalResults.voterCount : 0;
    }
    return votes.length;
  }, [finalResults?.voterCount, useFinalizedMultipleSnapshot, votes.length]);
  const voterIds = useMemo(
    () =>
      Array.from(
        new Set(
          tallyRowsMultiple.flatMap((row) => (Array.isArray(row.voterIds) ? row.voterIds : []))
        )
      ).filter(Boolean),
    [tallyRowsMultiple]
  );
  const { profiles: voterProfiles } = useUserProfilesByIds(voterIds);

  const rankedSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!groupId || !pollId || !isGroupMember) {
      setPoll(null);
      setPollLoading(false);
      setPollError(null);
      return;
    }

    setPollLoading(true);
    setPollError(null);
    const unsubscribe = subscribeToBasicPoll(
      groupId,
      pollId,
      (nextPoll) => {
        setPoll(nextPoll);
        setPollLoading(false);
      },
      (error) => {
        setPoll(null);
        setPollError(error);
        setPollLoading(false);
      }
    );

    return () => unsubscribe();
  }, [groupId, pollId, isGroupMember]);

  useEffect(() => {
    if (!groupId || !pollId || !isGroupMember) {
      setVotes([]);
      setVotesLoading(false);
      return;
    }

    setVotesLoading(true);
    const unsubscribe = subscribeToBasicPollVotes(
      "group",
      groupId,
      pollId,
      (nextVotes) => {
        setVotes(nextVotes || []);
        setVotesLoading(false);
      },
      () => {
        setVotes([]);
        setVotesLoading(false);
      }
    );
    return () => unsubscribe();
  }, [groupId, pollId, isGroupMember]);

  useEffect(() => {
    if (!groupId || !pollId || !isGroupMember || !user?.uid) {
      setMyVote(null);
      return;
    }

    const unsubscribe = subscribeToMyBasicPollVote(
      "group",
      groupId,
      pollId,
      user.uid,
      (nextVote) => setMyVote(nextVote),
      () => setMyVote(null)
    );
    return () => unsubscribe();
  }, [groupId, pollId, isGroupMember, user?.uid]);

  useEffect(() => {
    setVoteActionError(null);
    setExpandedResultKey(null);

    if (isMultipleChoice) {
      const optionIds = normalizeVoteOptionIds(myVote).filter((id) => optionsById.has(id));
      if (!allowWriteIn) {
        setSelectedOptionIds(optionIds);
        setOtherText("");
        return;
      }
      const trimmedOtherText = String(myVote?.otherText || "").trim();
      const hasOther = trimmedOtherText.length > 0;
      setSelectedOptionIds(hasOther ? [...optionIds, OTHER_OPTION_ID] : optionIds);
      setOtherText(hasOther ? String(myVote?.otherText || "") : "");
      return;
    }

    if (isRankedChoice) {
      const rankings = normalizeVoteRankings(myVote).filter((id) => optionsById.has(id));
      setRankedOptionIds(rankings);
      setSelectedOptionIds([]);
      setOtherText("");
      return;
    }

    setSelectedOptionIds([]);
    setOtherText("");
    setRankedOptionIds([]);
  }, [allowWriteIn, isMultipleChoice, isRankedChoice, myVote, optionsById, pollId]);

  useEffect(() => {
    if (!poll) return;
    const draftSettings = poll.settings || {};
    const draftVoteType = draftSettings.voteType || "MULTIPLE_CHOICE";
    const draftDeadlineAt = draftSettings.deadlineAt || poll.deadlineAt || null;
    const draftOptions = sortedOptions.map((option, index) => ({
      id: option.id || `option-${index + 1}`,
      label: option.label || "",
      order: Number.isFinite(option.order) ? option.order : index,
      note: option.note || "",
    }));
    setEditDraft({
      title: poll.title || "",
      description: poll.description || "",
      voteType: draftVoteType,
      allowMultiple: draftVoteType === "MULTIPLE_CHOICE" && draftSettings.allowMultiple === true,
      maxSelections:
        draftVoteType === "MULTIPLE_CHOICE" && Number.isFinite(draftSettings.maxSelections)
          ? String(draftSettings.maxSelections)
          : "",
      allowWriteIn: draftVoteType === "MULTIPLE_CHOICE" && draftSettings.allowWriteIn === true,
      deadlineAtLocal: toDateTimeLocalValue(draftDeadlineAt),
      options: draftOptions,
    });
  }, [poll, sortedOptions]);

  function toggleSelection(optionId) {
    setVoteActionError(null);
    setSelectedOptionIds((previous) => {
      const alreadySelected = previous.includes(optionId);
      if (!allowMultiple) {
        return alreadySelected ? [] : [optionId];
      }
      if (alreadySelected) {
        return previous.filter((entry) => entry !== optionId);
      }
      if (maxSelections && previous.length >= maxSelections) {
        setVoteActionError(`You can select up to ${maxSelections} options.`);
        return previous;
      }
      return [...previous, optionId];
    });
  }

  function moveRankedOption(optionId, direction) {
    setRankedOptionIds((previous) => {
      const index = previous.indexOf(optionId);
      if (index < 0) return previous;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= previous.length) return previous;
      return arrayMove(previous, index, nextIndex);
    });
  }

  function addRankedOption(optionId) {
    if (!optionId || rankedOptionIds.includes(optionId)) return;
    setVoteActionError(null);
    setRankedOptionIds((previous) => [...previous, optionId]);
  }

  function unrankOption(optionId) {
    setVoteActionError(null);
    setRankedOptionIds((previous) => previous.filter((id) => id !== optionId));
  }

  function handleRankedDragEnd(event) {
    const { active, over } = event;
    if (!active?.id || !over?.id || active.id === over.id) return;
    setRankedOptionIds((previous) => {
      const oldIndex = previous.indexOf(active.id);
      const newIndex = previous.indexOf(over.id);
      if (oldIndex < 0 || newIndex < 0) return previous;
      return arrayMove(previous, oldIndex, newIndex);
    });
  }

  async function handleSubmitVote() {
    if (!groupId || !pollId || !user?.uid || !isWritable) return;
    setSubmittingVote(true);
    setVoteActionError(null);
    try {
      if (isMultipleChoice) {
        const includesOther = allowWriteIn && selectedOptionIds.includes(OTHER_OPTION_ID);
        const normalizedOtherText = String(otherText || "").trim();
        const optionIds = selectedOptionIds.filter((optionId) => optionId !== OTHER_OPTION_ID);

        if (optionIds.length === 0 && !includesOther) {
          throw new Error("Select at least one option before submitting.");
        }
        if (includesOther && normalizedOtherText.length === 0) {
          throw new Error("Enter a write-in option before submitting.");
        }
        if (includesOther && normalizedOtherText.length > MAX_WRITE_IN_LENGTH) {
          throw new Error(`Write-in options must be ${MAX_WRITE_IN_LENGTH} characters or fewer.`);
        }
        if (!allowMultiple && optionIds.length + (includesOther ? 1 : 0) > 1) {
          throw new Error("This poll allows only one selection.");
        }

        await submitBasicPollVote("group", groupId, pollId, user.uid, {
          optionIds,
          otherText: includesOther ? normalizedOtherText : "",
          source: "web",
        });
        return;
      }

      if (isRankedChoice) {
        if (rankedOptionIds.length === 0) {
          throw new Error("Rank at least one option before submitting.");
        }
        await submitBasicPollVote("group", groupId, pollId, user.uid, {
          rankings: rankedOptionIds,
          source: "web",
        });
        return;
      }

      throw new Error("Unsupported vote type.");
    } catch (error) {
      setVoteActionError(error?.message || "Failed to submit your vote.");
    } finally {
      setSubmittingVote(false);
    }
  }

  async function handleClearVote() {
    if (!groupId || !pollId || !user?.uid || !isWritable) return;
    setClearingVote(true);
    setVoteActionError(null);
    try {
      await deleteBasicPollVote("group", groupId, pollId, user.uid);
      setSelectedOptionIds([]);
      setOtherText("");
      setRankedOptionIds([]);
    } catch (error) {
      setVoteActionError(error?.message || "Failed to clear your vote.");
    } finally {
      setClearingVote(false);
    }
  }

  function updateDraftOption(optionId, updates) {
    setEditDraft((previous) => ({
      ...previous,
      options: previous.options.map((option) =>
        option.id === optionId ? { ...option, ...updates } : option
      ),
    }));
  }

  function moveDraftOption(optionId, direction) {
    setEditDraft((previous) => {
      const index = previous.options.findIndex((option) => option.id === optionId);
      if (index < 0) return previous;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= previous.options.length) return previous;
      const reordered = arrayMove(previous.options, index, nextIndex).map((option, optionIndex) => ({
        ...option,
        order: optionIndex,
      }));
      return { ...previous, options: reordered };
    });
  }

  function addDraftOption() {
    setEditDraft((previous) => {
      const newId = `option-${crypto.randomUUID()}`;
      return {
        ...previous,
        options: [
          ...previous.options,
          { id: newId, label: "", order: previous.options.length, note: "" },
        ],
      };
    });
  }

  function removeDraftOption(optionId) {
    if (votes.length > 0) return;
    setEditDraft((previous) => ({
      ...previous,
      options: previous.options
        .filter((option) => option.id !== optionId)
        .map((option, index) => ({ ...option, order: index })),
    }));
  }

  function openOptionNoteEditor(optionId) {
    const option = editDraft.options.find((entry) => entry.id === optionId);
    if (!option) return;
    setNoteEditor({
      optionId,
      tab: "write",
      value: option.note || "",
    });
  }

  function saveOptionNote() {
    if (!noteEditor.optionId) return;
    updateDraftOption(noteEditor.optionId, { note: noteEditor.value });
    setNoteEditor({ optionId: null, tab: "write", value: "" });
  }

  function openOptionNoteViewer(option) {
    const note = String(option?.note || "").trim();
    if (!note) return;
    setNoteViewer({
      label: String(option?.label || "Option"),
      note,
    });
  }

  function hasUnsafeEditChanges() {
    if (!poll) return false;
    const pollSettings = poll.settings || {};
    const originalVoteType = pollSettings.voteType || "MULTIPLE_CHOICE";
    const originalAllowMultiple =
      originalVoteType === "MULTIPLE_CHOICE" && pollSettings.allowMultiple === true;
    const originalAllowWriteIn =
      originalVoteType === "MULTIPLE_CHOICE" && pollSettings.allowWriteIn === true;
    const originalMaxSelections = Number.isFinite(pollSettings.maxSelections)
      ? String(pollSettings.maxSelections)
      : "";
    const originalOptionIds = sortedOptions.map((option) => option.id).filter(Boolean);
    const nextOptionIds = editDraft.options.map((option) => option.id).filter(Boolean);

    if (editDraft.voteType !== originalVoteType) return true;
    if (editDraft.voteType === "MULTIPLE_CHOICE" && editDraft.allowMultiple !== originalAllowMultiple) {
      return true;
    }
    if (editDraft.voteType === "MULTIPLE_CHOICE" && editDraft.allowWriteIn !== originalAllowWriteIn) {
      return true;
    }
    if (editDraft.voteType === "MULTIPLE_CHOICE" && editDraft.maxSelections !== originalMaxSelections) {
      return true;
    }
    if (originalOptionIds.length !== nextOptionIds.length) return true;
    return originalOptionIds.some((optionId, index) => optionId !== nextOptionIds[index]);
  }

  async function handleSaveEdits() {
    if (!groupId || !pollId || !canManagePoll || savingEdits) return;
    const normalizedTitle = String(editDraft.title || "").trim();
    if (!normalizedTitle) {
      setVoteActionError("Poll title is required.");
      return;
    }

    const normalizedOptions = editDraft.options
      .map((option, index) => ({
        id: option.id || `option-${index + 1}`,
        label: String(option.label || "").trim(),
        order: index,
        note: String(option.note || "").trim(),
      }))
      .filter((option) => option.label);

    if (normalizedOptions.length < 2) {
      setVoteActionError("At least two options are required.");
      return;
    }

    const parsedMaxSelections =
      editDraft.voteType === "MULTIPLE_CHOICE" && editDraft.allowMultiple && editDraft.maxSelections
        ? Number(editDraft.maxSelections)
        : null;
    if (
      parsedMaxSelections != null &&
      (!Number.isFinite(parsedMaxSelections) || parsedMaxSelections < 1)
    ) {
      setVoteActionError("Max selections must be a positive number.");
      return;
    }

    const unsafeChanges = hasUnsafeEditChanges();
    if (votes.length > 0 && unsafeChanges) {
      const shouldReset = window.confirm(
        "This edit requires resetting existing votes. Continue and clear all current votes?"
      );
      if (!shouldReset) return;
    }

    setSavingEdits(true);
    setVoteActionError(null);
    try {
      if (votes.length > 0 && unsafeChanges) {
        await resetBasicPollVotes("group", groupId, pollId, { useServer: true });
      }

      await updateBasicPoll(groupId, pollId, {
        title: normalizedTitle,
        description: String(editDraft.description || "").trim(),
        options: normalizedOptions,
        settings: {
          voteType: editDraft.voteType,
          allowMultiple: editDraft.voteType === "MULTIPLE_CHOICE" && editDraft.allowMultiple,
          maxSelections:
            editDraft.voteType === "MULTIPLE_CHOICE" && editDraft.allowMultiple && parsedMaxSelections
              ? parsedMaxSelections
              : null,
          allowWriteIn: editDraft.voteType === "MULTIPLE_CHOICE" && editDraft.allowWriteIn,
          deadlineAt: fromDateTimeLocalValue(editDraft.deadlineAtLocal),
        },
      });

      setEditMode(false);
      setEditorTab("write");
      setNoteEditor({ optionId: null, tab: "write", value: "" });
    } catch (error) {
      setVoteActionError(error?.message || "Failed to save poll edits.");
    } finally {
      setSavingEdits(false);
    }
  }

  function buildVotersForRow(row) {
    const voterIdList = Array.isArray(row?.voterIds) ? row.voterIds : [];
    return voterIdList.map((voterId) => {
      const profile = voterProfiles[voterId] || {};
      return {
        id: voterId,
        email: profile.email || `${voterId}@local`,
        displayName: profile.displayName || null,
        publicIdentifier: profile.publicIdentifier || null,
        publicIdentifierType: profile.publicIdentifierType || null,
        qsUsername: profile.qsUsername || null,
        discordUsername: profile.discordUsername || null,
      };
    });
  }

  if (groupsLoading || (isGroupMember && pollLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center dark:text-slate-300">
        <LoadingState message="Loading group poll..." />
      </div>
    );
  }

  if (isAccessDenied) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center text-slate-600 dark:text-slate-400">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Access denied
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
            You don&apos;t have access to this group poll.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (pollError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center text-slate-600 dark:text-slate-400">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-500">Error</p>
          <p className="mt-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
            Failed to load this group poll.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!poll) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center text-slate-600 dark:text-slate-400">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Not found
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
            This group poll was not found.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/friends")}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Back to friends & groups
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Group Poll
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {poll.title || "Untitled poll"}
          </h1>
          {group?.name ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">Questing group: {group.name}</p>
          ) : null}
        </div>
        {canManagePoll ? (
          <button
            type="button"
            onClick={() => {
              setVoteActionError(null);
              setEditMode((previous) => !previous);
            }}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {editMode ? "Exit edit mode" : "Edit poll"}
          </button>
        ) : null}
      </header>

      {poll.description ? (
        <div className="prose prose-sm prose-slate max-w-none rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm prose-headings:font-display prose-a:text-brand-primary prose-a:underline hover:prose-a:text-brand-primary/80 dark:prose-invert dark:border-slate-700 dark:bg-slate-900/70">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{poll.description}</ReactMarkdown>
        </div>
      ) : null}

      {editMode ? (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Edit poll</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {votes.length > 0
                ? "Unsafe edits will require resetting existing votes."
                : "No votes yet. All edits are currently safe."}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Title
            </label>
            <input
              value={editDraft.title}
              onChange={(event) =>
                setEditDraft((previous) => ({ ...previous, title: event.target.value }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Description
              </label>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEditorTab("write")}
                  className={`rounded-full px-3 py-1 ${
                    editorTab === "write"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                  }`}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab("preview")}
                  className={`rounded-full px-3 py-1 ${
                    editorTab === "preview"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>
            {editorTab === "write" ? (
              <textarea
                value={editDraft.description}
                onChange={(event) =>
                  setEditDraft((previous) => ({ ...previous, description: event.target.value }))
                }
                rows={5}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            ) : (
              <div className="prose prose-sm prose-slate max-w-none rounded-lg border border-slate-200 bg-white px-3 py-2 prose-headings:font-display prose-a:text-brand-primary prose-a:underline hover:prose-a:text-brand-primary/80 dark:prose-invert dark:border-slate-700 dark:bg-slate-900">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {editDraft.description || "_No description_"}
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
                value={editDraft.voteType}
                onChange={(event) => {
                  const nextVoteType = event.target.value;
                  setEditDraft((previous) => ({
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
                value={editDraft.deadlineAtLocal}
                onChange={(event) =>
                  setEditDraft((previous) => ({
                    ...previous,
                    deadlineAtLocal: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>

          {editDraft.voteType === "MULTIPLE_CHOICE" ? (
            <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={editDraft.allowMultiple}
                  onChange={(event) =>
                    setEditDraft((previous) => ({
                      ...previous,
                      allowMultiple: event.target.checked,
                    }))
                  }
                />
                Allow multiple selections
              </label>
              {editDraft.allowMultiple ? (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Max selections
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editDraft.maxSelections}
                    onChange={(event) =>
                      setEditDraft((previous) => ({
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
                  checked={editDraft.allowWriteIn}
                  onChange={(event) =>
                    setEditDraft((previous) => ({
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
                onClick={addDraftOption}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
              >
                Add option
              </button>
            </div>
            <div className="space-y-2">
              {editDraft.options.map((option, index) => (
                <div
                  key={option.id}
                  className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={option.label}
                      onChange={(event) =>
                        updateDraftOption(option.id, { label: event.target.value })
                      }
                      placeholder={`Option ${index + 1}`}
                      className="min-w-[180px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => moveDraftOption(option.id, "up")}
                      disabled={index === 0}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDraftOption(option.id, "down")}
                      disabled={index === editDraft.options.length - 1}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => openOptionNoteEditor(option.id)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700"
                    >
                      {option.note ? "Edit note" : "Add note"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDraftOption(option.id)}
                      disabled={votes.length > 0}
                      className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-40 dark:border-rose-600 dark:text-rose-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {votes.length > 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Option removal is disabled once votes exist.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditMode(false)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdits}
              disabled={savingEdits}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              {savingEdits ? "Saving..." : "Save changes"}
            </button>
          </div>

          {voteActionError ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{voteActionError}</p>
          ) : null}
        </section>
      ) : null}

      {!editMode && !isMultipleChoice && !isRankedChoice ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
          This poll type is not supported in this view yet.
        </section>
      ) : null}

      {!editMode && isMultipleChoice ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cast your vote</h2>
              <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {allowMultiple ? "Multiple choice" : "Single choice"}
              </span>
            </div>
            <div className="space-y-3">
              {sortedOptions.map((option, index) => {
                const optionId = option.id || `option-${index}`;
                const isSelected = selectedOptionIds.includes(optionId);
                const hasNote = String(option?.note || "").trim().length > 0;
                return (
                  <label
                    key={optionId}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                  >
                    <input
                      type={allowMultiple ? "checkbox" : "radio"}
                      name="group-poll-options"
                      checked={isSelected}
                      onChange={() => toggleSelection(optionId)}
                      disabled={!isWritable || submittingVote || clearingVote}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span className="flex min-w-0 flex-1 items-start justify-between gap-2">
                      <span className="text-slate-800 dark:text-slate-200">
                        {option.label || `Option ${index + 1}`}
                      </span>
                      {hasNote ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            openOptionNoteViewer(option);
                          }}
                          aria-label={`View note for ${option.label || `Option ${index + 1}`}`}
                          className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          View note
                        </button>
                      ) : null}
                    </span>
                  </label>
                );
              })}
              {allowWriteIn ? (
                <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type={allowMultiple ? "checkbox" : "radio"}
                      name="group-poll-options"
                      checked={selectedOptionIds.includes(OTHER_OPTION_ID)}
                      onChange={() => toggleSelection(OTHER_OPTION_ID)}
                      disabled={!isWritable || submittingVote || clearingVote}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span className="text-slate-800 dark:text-slate-200">Other</span>
                  </label>
                  {selectedOptionIds.includes(OTHER_OPTION_ID) ? (
                    <textarea
                      value={otherText}
                      onChange={(event) => {
                        setVoteActionError(null);
                        setOtherText(event.target.value);
                      }}
                      placeholder="Enter your write-in option"
                      maxLength={MAX_WRITE_IN_LENGTH}
                      disabled={!isWritable || submittingVote || clearingVote}
                      className="mt-3 min-h-[80px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-0 transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-slate-500"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {maxSelections && allowMultiple ? `Select up to ${maxSelections} options.` : null}
                {!maxSelections && allowMultiple ? "You may select multiple options." : null}
                {!allowMultiple ? "Select one option." : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClearVote}
                  disabled={!myVote || !isWritable || submittingVote || clearingVote}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {clearingVote ? "Clearing..." : "Clear vote"}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitVote}
                  disabled={!isWritable || submittingVote || clearingVote}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                >
                  {submittingVote ? "Submitting..." : "Submit vote"}
                </button>
              </div>
            </div>
            {!isWritable ? (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
                Voting is closed for this poll.
              </p>
            ) : null}
            {voteActionError ? (
              <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{voteActionError}</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {isFinalizedPoll ? "Final results" : "Live results"}
            </h2>
            {votesLoading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading results...</p>
            ) : totalVoters === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No votes yet.</p>
            ) : (
              <div className="space-y-4">
                {tallyRowsMultiple.map((row) => {
                  const votersForRow = buildVotersForRow(row);
                  const percentage = totalVoters > 0 ? Math.round((row.count / totalVoters) * 100) : 0;
                  const winningCount = Math.max(...tallyRowsMultiple.map((entry) => entry.count), 0);
                  const isWinner = row.count > 0 && row.count === winningCount;
                  const optionForRow = optionsById.get(row.key) || null;
                  const hasNote = String(optionForRow?.note || "").trim().length > 0;
                  const countLabel = allowMultiple
                    ? `${row.count} of ${totalVoters} voters (${percentage}%)`
                    : `${row.count} vote${row.count === 1 ? "" : "s"} (${percentage}%)`;
                  return (
                    <div key={row.key} className="space-y-2">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={`font-medium ${
                              isWinner
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-slate-800 dark:text-slate-200"
                            }`}
                          >
                            {row.label}
                            {isWinner ? (
                              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                Winner
                              </span>
                            ) : null}
                          </span>
                          {hasNote ? (
                            <button
                              type="button"
                              onClick={() => openOptionNoteViewer(optionForRow)}
                              aria-label={`View note for ${row.label}`}
                              className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              View note
                            </button>
                          ) : null}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {countLabel}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className={`h-2 rounded-full ${
                            isWinner ? "bg-emerald-600 dark:bg-emerald-400" : "bg-slate-700 dark:bg-slate-300"
                          }`}
                          style={{ width: `${Math.max(percentage, row.count > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      {row.count > 0 && Array.isArray(row.voterIds) && row.voterIds.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedResultKey((previous) => (previous === row.key ? null : row.key))
                          }
                          className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
                        >
                          {expandedResultKey === row.key ? "Hide" : "Show"} voters ({row.count})
                        </button>
                      ) : null}
                      {expandedResultKey === row.key && votersForRow.length > 0 ? (
                        <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                          <AvatarStack users={votersForRow} max={12} size={22} />
                          <div className="flex flex-wrap gap-2">
                            {votersForRow.map((voter) => (
                              <span
                                key={voter.id}
                                className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              >
                                {getUserLabel(voter) || "Unknown voter"}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {totalVoters} voter{totalVoters === 1 ? "" : "s"} participated.
                </p>
              </div>
            )}
          </section>
        </>
      ) : null}

      {!editMode && isRankedChoice ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Rank your choices</h2>
              <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Ranked choice
              </span>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Drag to reorder your ranked options. You can submit a partial ranking.
              </p>
              {rankedOptions.length > 0 ? (
                <DndContext
                  sensors={rankedSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleRankedDragEnd}
                >
                  <SortableContext items={rankedOptionIds} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-2">
                      {rankedOptions.map((option, index) => (
                        <RankedOptionItem
                          key={option.id}
                          option={option}
                          index={index}
                          total={rankedOptions.length}
                          disabled={!isWritable || submittingVote || clearingVote}
                          onMoveUp={(optionId) => moveRankedOption(optionId, "up")}
                          onMoveDown={(optionId) => moveRankedOption(optionId, "down")}
                          onUnrank={unrankOption}
                          onViewNote={openOptionNoteViewer}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No ranked options yet. Add options from the unranked list below.
                </div>
              )}
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Unranked options</p>
              <div className="flex flex-wrap gap-2">
                {unrankedOptions.length === 0 ? (
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    All options are currently ranked.
                  </span>
                ) : (
                  unrankedOptions.map((option) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => addRankedOption(option.id)}
                        disabled={!isWritable || submittingVote || clearingVote}
                        className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Rank {option.label}
                      </button>
                      {String(option?.note || "").trim() ? (
                        <button
                          type="button"
                          onClick={() => openOptionNoteViewer(option)}
                          aria-label={`View note for ${option.label}`}
                          className="rounded-full border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          View note
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Use arrow buttons on mobile for precise rank ordering.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClearVote}
                  disabled={!myVote || !isWritable || submittingVote || clearingVote}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {clearingVote ? "Clearing..." : "Clear ranking"}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitVote}
                  disabled={!isWritable || submittingVote || clearingVote}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                >
                  {submittingVote ? "Submitting..." : "Submit ranking"}
                </button>
              </div>
            </div>

            {!isWritable ? (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
                Voting is closed for this poll.
              </p>
            ) : null}
            {voteActionError ? (
              <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{voteActionError}</p>
            ) : null}
          </section>

          {isWritable ? (
            <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Live first-choice results
              </h2>
              {votesLoading ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading results...</p>
              ) : totalVoters === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No votes yet.</p>
              ) : (
                <div className="space-y-4">
                  {tallyRowsRanked.map((row) => {
                    const percentage = totalVoters > 0 ? Math.round((row.count / totalVoters) * 100) : 0;
                    const optionForRow = optionsById.get(row.key) || null;
                    const hasNote = String(optionForRow?.note || "").trim().length > 0;
                    return (
                      <div key={row.key} className="space-y-2">
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="font-medium text-slate-800 dark:text-slate-200">{row.label}</span>
                            {hasNote ? (
                              <button
                                type="button"
                                onClick={() => openOptionNoteViewer(optionForRow)}
                                aria-label={`View note for ${row.label}`}
                                className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                View note
                              </button>
                            ) : null}
                          </span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {row.count} first-choice vote{row.count === 1 ? "" : "s"} ({percentage}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-2 rounded-full bg-slate-700 dark:bg-slate-300"
                            style={{ width: `${Math.max(percentage, row.count > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {totalVoters} voter{totalVoters === 1 ? "" : "s"} participated.
                  </p>
                </div>
              )}
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Final ranked results
              </h2>
              {votesLoading ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading results...</p>
              ) : (
                <div className="space-y-4">
                  {rankedFinalResults?.tiedIds?.length > 1 ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
                      {poll.creatorId === user?.uid
                        ? "This poll ended in a tie. Choose a winner or reopen the poll."
                        : "This poll ended in a tie. Ask the poll creator to choose a winner or reopen the poll."}
                    </div>
                  ) : rankedFinalResults?.winnerIds?.length ? (
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Winner:{" "}
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {optionsById.get(rankedFinalResults.winnerIds[0])?.label || rankedFinalResults.winnerIds[0]}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No winning option could be determined.</p>
                  )}

                  {rankedFinalResults?.rounds?.length ? (
                    <div className="space-y-3">
                      {rankedFinalResults.rounds.map((roundData) => (
                        <div
                          key={`round-${roundData.round}`}
                          className="rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700"
                        >
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            Round {roundData.round}
                          </p>
                          <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-slate-600 dark:text-slate-300">
                            {sortedOptions.map((option) => (
                              <div key={`${roundData.round}:${option.id}`} className="flex justify-between gap-3">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span>{option.label}</span>
                                  {String(option?.note || "").trim() ? (
                                    <button
                                      type="button"
                                      onClick={() => openOptionNoteViewer(option)}
                                      aria-label={`View note for ${option.label}`}
                                      className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                      View note
                                    </button>
                                  ) : null}
                                </span>
                                <span>{roundData.counts?.[option.id] ?? 0}</span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            Exhausted ballots: {roundData.exhausted}
                          </p>
                          {Array.isArray(roundData.eliminatedIds) && roundData.eliminatedIds.length > 0 ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Eliminated:{" "}
                              {roundData.eliminatedIds
                                .map((optionId) => optionsById.get(optionId)?.label || optionId)
                                .join(", ")}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No round data is available.</p>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      ) : null}

      {noteViewer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Option note for ${noteViewer.label}`}
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Option note: {noteViewer.label}
              </h3>
              <button
                type="button"
                onClick={() => setNoteViewer(null)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                Close
              </button>
            </div>
            <div className="prose prose-sm prose-slate max-h-[65vh] max-w-none overflow-auto rounded-lg border border-slate-200 bg-white px-3 py-2 prose-headings:font-display prose-a:text-brand-primary prose-a:underline hover:prose-a:text-brand-primary/80 dark:prose-invert dark:border-slate-700 dark:bg-slate-900">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{noteViewer.note}</ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}

      {noteEditor.optionId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Option note</h3>
              <button
                type="button"
                onClick={() => setNoteEditor({ optionId: null, tab: "write", value: "" })}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                Close
              </button>
            </div>
            <div className="mb-3 flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setNoteEditor((previous) => ({ ...previous, tab: "write" }))}
                className={`rounded-full px-3 py-1 ${
                  noteEditor.tab === "write"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setNoteEditor((previous) => ({ ...previous, tab: "preview" }))}
                className={`rounded-full px-3 py-1 ${
                  noteEditor.tab === "preview"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                Preview
              </button>
            </div>
            {noteEditor.tab === "write" ? (
              <textarea
                value={noteEditor.value}
                onChange={(event) =>
                  setNoteEditor((previous) => ({ ...previous, value: event.target.value }))
                }
                rows={8}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            ) : (
              <div className="prose prose-sm prose-slate max-h-[320px] max-w-none overflow-auto rounded-lg border border-slate-200 bg-white px-3 py-2 prose-headings:font-display prose-a:text-brand-primary prose-a:underline hover:prose-a:text-brand-primary/80 dark:prose-invert dark:border-slate-700 dark:bg-slate-900">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {noteEditor.value || "_No note_"}
                </ReactMarkdown>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteEditor({ optionId: null, tab: "write", value: "" })}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveOptionNote}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
              >
                Save note
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
