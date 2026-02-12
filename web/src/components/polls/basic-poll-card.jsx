import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Archive, ArchiveRestore, MoreVertical, Pencil, RotateCcw, Trash2, CheckCircle2 } from "lucide-react";
import { AvatarStack, VotingAvatarStack } from "../ui/voter-avatars";
import { buildColorMap } from "../ui/voter-avatar-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

function formatDeadlineLabel(deadlineAt, isOpen) {
  if (!deadlineAt) return isOpen ? "No deadline" : "Closed";
  if (!isOpen) return `Closed ${formatDistanceToNow(deadlineAt, { addSuffix: true })}`;
  if (deadlineAt.getTime() <= Date.now()) return "Deadline passed";
  return `Deadline ${formatDistanceToNow(deadlineAt, { addSuffix: true })}`;
}

function voteTypeLabel(voteType) {
  return voteType === "RANKED_CHOICE" ? "Ranked choice" : "Multiple choice";
}

const STATE_STYLE = {
  NEEDS_VOTE:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200",
  OPEN_VOTED:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/70 dark:bg-emerald-900/30 dark:text-emerald-200",
  CLOSED:
    "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200",
  ARCHIVED:
    "border-slate-300 bg-slate-200 text-slate-700 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100",
};

const STATE_LABEL = {
  NEEDS_VOTE: "Needs vote",
  OPEN_VOTED: "Voted",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};

function parentLabel(parentType) {
  return parentType === "scheduler" ? "Session" : "Group";
}

export function BasicPollCard({
  poll,
  onArchiveToggle,
  archiveBusy = false,
  onOpen,
  onReopenPoll,
  onFinalizePoll,
  onEditPoll,
  onDeletePoll,
  canManage = false,
  actionBusy = false,
}) {
  const navigate = useNavigate();
  const {
    title,
    contextLabel,
    voteType,
    required,
    deadlineAt,
    state,
    voteLink,
    isOpen,
    eligibleUsers = [],
    votedUsers = [],
    pendingUsers = [],
    votedCount = 0,
    eligibleCount = 0,
    parentType,
    isArchived,
    pollStatus = "OPEN",
    accentColor = null,
  } = poll;
  const participantEmails = (eligibleUsers || [])
    .map((entry) => entry?.email)
    .filter(Boolean);
  const colorMap = buildColorMap(participantEmails);
  const primaryActionLabel = state === "NEEDS_VOTE" ? "Vote" : state === "OPEN_VOTED" ? "Edit vote" : "View results";
  const handleOpen = () => {
    if (typeof onOpen === "function") {
      onOpen();
      return;
    }
    if (!voteLink) return;
    navigate(voteLink);
    setTimeout(() => {
      if (window.location.pathname !== voteLink) {
        window.location.assign(voteLink);
      }
    }, 50);
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleOpen();
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label={`${primaryActionLabel}: ${title || "Untitled poll"}`}
      className="group relative flex w-full flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-left transition-all duration-150 hover:scale-[1.02] hover:shadow-lg dark:border-slate-700 dark:bg-slate-800"
      style={{
        borderLeftWidth: accentColor ? "4px" : undefined,
        borderLeftColor: accentColor || undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {title || "Untitled poll"}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATE_STYLE[state] || STATE_STYLE.CLOSED}`}
            >
              {STATE_LABEL[state] || STATE_LABEL.CLOSED}
            </span>
            {required ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200">
                Required
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate">{contextLabel}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
              •
            </span>
            <span>{formatDeadlineLabel(deadlineAt, isOpen)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              {voteTypeLabel(voteType)}
            </span>
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              {parentLabel(parentType)}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              disabled={actionBusy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
              aria-label="General poll actions"
              title="General poll actions"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {onArchiveToggle ? (
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onArchiveToggle();
                }}
                disabled={archiveBusy || actionBusy}
              >
                {isArchived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                {isArchived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            ) : null}
            {canManage && state === "CLOSED" && pollStatus === "FINALIZED" && onReopenPoll ? (
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onReopenPoll();
                }}
                disabled={actionBusy}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Re-open
              </DropdownMenuItem>
            ) : null}
            {canManage && pollStatus === "OPEN" && onFinalizePoll ? (
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onFinalizePoll();
                }}
                disabled={actionBusy}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Finalize
              </DropdownMenuItem>
            ) : null}
            {canManage && onEditPoll ? (
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onEditPoll();
                }}
                disabled={actionBusy}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            ) : null}
            {canManage && onDeletePoll ? (
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onDeletePoll();
                }}
                disabled={actionBusy}
                className="text-rose-600 dark:text-rose-400"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {eligibleUsers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">
              {eligibleUsers.length} invitee{eligibleUsers.length !== 1 ? "s" : ""}:
            </span>
            <AvatarStack users={eligibleUsers} max={10} size={18} colorMap={colorMap} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {votedCount}/{eligibleCount} voted:
            </span>
            <VotingAvatarStack users={votedUsers} max={10} size={18} colorMap={colorMap} />
          </div>
          {isOpen ? (
            <div className="flex items-center gap-1.5">
              {pendingUsers.length > 0 ? (
                <>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {pendingUsers.length}/{eligibleCount} pending:
                  </span>
                  <VotingAvatarStack users={pendingUsers} max={10} size={18} colorMap={colorMap} />
                </>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">All voted!</span>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
