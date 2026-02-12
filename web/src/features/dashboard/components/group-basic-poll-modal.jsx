import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, CheckCircle2, MoreVertical, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../app/useAuth";
import { LoadingState } from "../../../components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { useQuestingGroups } from "../../../hooks/useQuestingGroups";
import { useUserSettings } from "../../../hooks/useUserSettings";
import { useUserProfilesByIds } from "../../../hooks/useUserProfiles";
import { BasicPollVotingCard } from "../../../components/polls/basic-poll-voting-card";
import { PollDiscordMetaRow } from "../../../components/polls/poll-discord-meta-row";
import { PollNudgeButton, getNudgeCooldownRemaining } from "../../../components/polls/poll-nudge-button";
import { PollOptionNoteDialog } from "../../../components/polls/poll-option-note-dialog";
import {
  hasSubmittedVoteForPoll,
  normalizeVoteOptionIds,
  normalizeVoteRankings,
} from "../../../lib/basic-polls/vote-submission";
import { BASIC_POLL_STATUSES, BASIC_POLL_VOTE_TYPES } from "../../../lib/basic-polls/constants";
import { coerceDate } from "../../../lib/time";
import {
  deleteBasicPoll,
  deleteBasicPollVote,
  finalizeBasicPoll,
  reopenBasicPoll,
  submitBasicPollVote,
  subscribeToBasicPoll,
  subscribeToBasicPollVotes,
  subscribeToMyBasicPollVote,
} from "../../../lib/data/basicPolls";
import { nudgeDiscordBasicPoll } from "../../../lib/data/discord";

const MAX_WRITE_IN_LENGTH = 120;

export function GroupBasicPollModal({ groupId, pollId, onClose, onEditPoll }) {
  const { user } = useAuth();
  const { groups, loading: groupsLoading } = useQuestingGroups();
  const { archivedPolls, archivePoll, unarchivePoll } = useUserSettings();
  const [poll, setPoll] = useState(null);
  const [pollLoading, setPollLoading] = useState(true);
  const [pollError, setPollError] = useState(null);
  const [votes, setVotes] = useState([]);
  const [votesLoading, setVotesLoading] = useState(true);
  const [myVote, setMyVote] = useState(null);
  const [voteDraft, setVoteDraft] = useState({});
  const [submittingVote, setSubmittingVote] = useState(false);
  const [clearingVote, setClearingVote] = useState(false);
  const [voteError, setVoteError] = useState(null);
  const [optionNoteViewer, setOptionNoteViewer] = useState(null);
  const [headerActionBusy, setHeaderActionBusy] = useState(false);
  const [nudgeSending, setNudgeSending] = useState(false);

  const group = useMemo(
    () => (groups || []).find((entry) => entry.id === groupId) || null,
    [groups, groupId]
  );
  const isGroupMember = Boolean(group);
  const canManagePoll =
    Boolean(group && user?.uid) &&
    (group.creatorId === user.uid ||
      (group.memberManaged === true && Array.isArray(group.memberIds) && group.memberIds.includes(user.uid)));
  const archiveKey = useMemo(
    () => (groupId && pollId ? `basic:group:${groupId}:${pollId}` : null),
    [groupId, pollId]
  );
  const isArchived = Boolean(archiveKey && archivedPolls.includes(archiveKey));
  const participantIds = useMemo(() => {
    const ids = new Set(Array.isArray(group?.memberIds) ? group.memberIds : []);
    if (group?.creatorId) ids.add(group.creatorId);
    return Array.from(ids).filter(Boolean);
  }, [group?.creatorId, group?.memberIds]);
  const { profiles: participantProfilesById = {} } = useUserProfilesByIds(participantIds);
  const voteType = poll?.settings?.voteType || BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE;
  const isMultipleChoice = voteType === BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE;
  const isRankedChoice = voteType === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE;
  const allowMultiple = poll?.settings?.allowMultiple === true;
  const allowWriteIn = poll?.settings?.allowWriteIn === true;
  const maxSelections = Number.isFinite(poll?.settings?.maxSelections)
    ? Math.max(1, Number(poll.settings.maxSelections))
    : null;
  const isPollOpen = (poll?.status || BASIC_POLL_STATUSES.OPEN) === BASIC_POLL_STATUSES.OPEN;
  const deadlineAt = coerceDate(poll?.settings?.deadlineAt || poll?.deadlineAt || null);
  const isDeadlinePassed = Boolean(deadlineAt && Date.now() >= deadlineAt.getTime());
  const canVote = isPollOpen && !isDeadlinePassed;
  const hasSubmitted = hasSubmittedVoteForPoll(poll, myVote);
  const voteCount = useMemo(
    () => (votes || []).filter((voteDoc) => hasSubmittedVoteForPoll(poll, voteDoc)).length,
    [poll, votes]
  );
  const participantUsers = useMemo(
    () =>
      participantIds
        .map((participantId) => {
          const profile = participantProfilesById?.[participantId] || {};
          return {
            id: participantId,
            email: profile?.email || null,
            avatar: profile?.photoURL || null,
            ...profile,
          };
        })
        .filter((entry) => entry.email),
    [participantIds, participantProfilesById]
  );
  const votedUsers = useMemo(() => {
    const entries = (votes || [])
      .filter((voteDoc) => hasSubmittedVoteForPoll(poll, voteDoc))
      .map((voteDoc) => {
        const profile = participantProfilesById?.[voteDoc.id] || {};
        return {
          id: voteDoc.id,
          email: profile?.email || voteDoc?.userEmail || null,
          avatar: voteDoc?.userAvatar || profile?.photoURL || null,
          ...profile,
        };
      })
      .filter((entry) => entry.email);
    const seen = new Set();
    return entries.filter((entry) => {
      if (!entry.id || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  }, [participantProfilesById, poll, votes]);
  const pendingUsers = useMemo(() => {
    const votedIdSet = new Set(votedUsers.map((entry) => entry.id).filter(Boolean));
    return participantUsers.filter((entry) => !votedIdSet.has(entry.id));
  }, [participantUsers, votedUsers]);
  const participantCountForSummary = participantIds.length;
  const pollDiscord = poll?.discord || null;
  const discordStatusLabel = pollDiscord?.messageId
    ? "Posted in Discord"
    : group?.discord?.channelId
      ? "Discord linked"
      : "";
  const isPollCreator = Boolean(
    user?.uid && poll?.creatorId && String(poll.creatorId) === String(user.uid)
  );
  const nudgeCooldownRemaining = useMemo(
    () => getNudgeCooldownRemaining(pollDiscord?.nudgeLastSentAt),
    [pollDiscord?.nudgeLastSentAt]
  );
  const basicPollMissingNudgeUserIds = useMemo(() => {
    if (!poll || !user?.uid) return [];

    const submittedVoterIds = new Set(
      (votes || [])
        .filter((voteDoc) => hasSubmittedVoteForPoll(poll, voteDoc))
        .map((voteDoc) => String(voteDoc?.id || "").trim())
        .filter(Boolean)
    );

    return (participantIds || [])
      .map((participantId) => String(participantId || "").trim())
      .filter(Boolean)
      .filter((participantId) => participantId !== String(user.uid))
      .filter((participantId) => !submittedVoterIds.has(participantId));
  }, [participantIds, poll, user?.uid, votes]);
  const showBasicPollNudgeButton = Boolean(
    isPollCreator &&
      pollDiscord?.messageId &&
      isPollOpen &&
      basicPollMissingNudgeUserIds.length > 0
  );
  const cardBusy = submittingVote || clearingVote;

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
      (nextVote) => setMyVote(nextVote || null),
      () => setMyVote(null)
    );
    return () => unsubscribe();
  }, [groupId, pollId, isGroupMember, user?.uid]);

  useEffect(() => {
    if (!poll) return;
    const sortedOptions = [...(Array.isArray(poll?.options) ? poll.options : [])].sort((left, right) => {
      const leftOrder = Number.isFinite(left?.order) ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right?.order) ? right.order : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
    const optionIds = new Set(sortedOptions.filter((option) => option?.id).map((option) => option.id));
    if (isMultipleChoice) {
      const selectedIds = normalizeVoteOptionIds(myVote).filter((id) => optionIds.has(id));
      setVoteDraft({
        optionIds: selectedIds,
        otherText: allowWriteIn ? String(myVote?.otherText || "") : "",
      });
      return;
    }
    if (isRankedChoice) {
      const rankings = normalizeVoteRankings(myVote).filter((id) => optionIds.has(id));
      setVoteDraft({ rankings, optionIds: [], otherText: "" });
      return;
    }
    setVoteDraft({});
  }, [allowWriteIn, isMultipleChoice, isRankedChoice, myVote, poll]);

  function setMultipleChoiceSelection(optionId) {
    setVoteError(null);
    setVoteDraft((previous) => {
      const selected = Array.isArray(previous.optionIds) ? previous.optionIds : [];
      const alreadySelected = selected.includes(optionId);
      if (!allowMultiple) {
        return {
          ...previous,
          optionIds: alreadySelected ? [] : [optionId],
        };
      }
      if (alreadySelected) {
        return {
          ...previous,
          optionIds: selected.filter((entry) => entry !== optionId),
        };
      }
      if (maxSelections && selected.length >= maxSelections) {
        setVoteError(`You can select up to ${maxSelections} options.`);
        return previous;
      }
      return {
        ...previous,
        optionIds: [...selected, optionId],
      };
    });
  }

  function setOtherText(value) {
    setVoteDraft((previous) => ({ ...previous, otherText: value }));
  }

  function addRankedOption(optionId) {
    setVoteError(null);
    setVoteDraft((previous) => {
      const rankings = Array.isArray(previous.rankings) ? previous.rankings : [];
      if (rankings.includes(optionId)) return previous;
      return { ...previous, rankings: [...rankings, optionId] };
    });
  }

  function moveRankedOption(optionId, direction) {
    setVoteDraft((previous) => {
      const rankings = Array.isArray(previous.rankings) ? [...previous.rankings] : [];
      const index = rankings.indexOf(optionId);
      if (index < 0) return previous;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= rankings.length) return previous;
      const [item] = rankings.splice(index, 1);
      rankings.splice(nextIndex, 0, item);
      return { ...previous, rankings };
    });
  }

  function removeRankedOption(optionId) {
    setVoteError(null);
    setVoteDraft((previous) => {
      const rankings = Array.isArray(previous.rankings) ? previous.rankings : [];
      return { ...previous, rankings: rankings.filter((entry) => entry !== optionId) };
    });
  }

  async function submitVote() {
    if (!groupId || !pollId || !user?.uid || !canVote) return;
    setSubmittingVote(true);
    setVoteError(null);
    try {
      if (isMultipleChoice) {
        const optionIds = Array.isArray(voteDraft.optionIds) ? voteDraft.optionIds : [];
        const normalizedOtherText = String(voteDraft.otherText || "").trim();
        if (optionIds.length === 0 && normalizedOtherText.length === 0) {
          throw new Error("Select at least one option before submitting.");
        }
        if (!allowWriteIn && normalizedOtherText.length > 0) {
          throw new Error("Write-in voting is disabled for this poll.");
        }
        if (normalizedOtherText.length > MAX_WRITE_IN_LENGTH) {
          throw new Error(`Write-in options must be ${MAX_WRITE_IN_LENGTH} characters or fewer.`);
        }
        if (!allowMultiple && optionIds.length + (normalizedOtherText.length > 0 ? 1 : 0) > 1) {
          throw new Error("This poll allows only one selection.");
        }
        await submitBasicPollVote("group", groupId, pollId, user.uid, {
          optionIds,
          otherText: normalizedOtherText,
          source: "web",
        });
      } else if (isRankedChoice) {
        const rankings = Array.isArray(voteDraft.rankings) ? voteDraft.rankings : [];
        if (rankings.length === 0) {
          throw new Error("Rank at least one option before submitting.");
        }
        await submitBasicPollVote("group", groupId, pollId, user.uid, {
          rankings,
          source: "web",
        });
      }
    } catch (error) {
      setVoteError(error?.message || "Failed to submit vote.");
    } finally {
      setSubmittingVote(false);
    }
  }

  async function clearVote() {
    if (!groupId || !pollId || !user?.uid || !canVote) return;
    setClearingVote(true);
    setVoteError(null);
    try {
      await deleteBasicPollVote("group", groupId, pollId, user.uid);
      setVoteDraft({});
    } catch (error) {
      setVoteError(error?.message || "Failed to clear vote.");
    } finally {
      setClearingVote(false);
    }
  }

  async function nudgeParticipants() {
    if (!groupId || !pollId) return;
    setNudgeSending(true);
    setVoteError(null);
    try {
      const result = await nudgeDiscordBasicPoll(groupId, pollId);
      const nudgedCount = Number(result?.nudgedCount || 0);
      const totalNonVoters = Number(result?.totalNonVoters || 0);
      if (nudgedCount < totalNonVoters) {
        toast.success(
          `Nudged ${nudgedCount} participant${nudgedCount === 1 ? "" : "s"} on Discord. ${totalNonVoters - nudgedCount} non-voter${totalNonVoters - nudgedCount === 1 ? " has" : "s have"} not linked Discord.`
        );
      } else {
        toast.success(
          `Nudged ${nudgedCount} participant${nudgedCount === 1 ? "" : "s"} on Discord!`
        );
      }
    } catch (error) {
      setVoteError(error?.message || "Failed to nudge participants.");
    } finally {
      setNudgeSending(false);
    }
  }

  async function toggleArchive() {
    if (!archiveKey) return;
    setHeaderActionBusy(true);
    try {
      if (isArchived) {
        await unarchivePoll(archiveKey);
      } else {
        await archivePoll(archiveKey);
      }
    } finally {
      setHeaderActionBusy(false);
    }
  }

  async function reopenPollAction() {
    if (!canManagePoll || !groupId || !pollId) return;
    setHeaderActionBusy(true);
    try {
      await reopenBasicPoll(groupId, pollId);
    } catch (error) {
      setVoteError(error?.message || "Failed to re-open poll.");
    } finally {
      setHeaderActionBusy(false);
    }
  }

  async function finalizePollAction() {
    if (!canManagePoll || !groupId || !pollId) return;
    setHeaderActionBusy(true);
    try {
      await finalizeBasicPoll(groupId, pollId);
    } catch (error) {
      setVoteError(error?.message || "Failed to finalize poll.");
    } finally {
      setHeaderActionBusy(false);
    }
  }

  async function deletePollAction() {
    if (!canManagePoll || !groupId || !pollId) return;
    const confirmed = window.confirm(
      `Delete "${poll?.title || "this poll"}"? This will remove all votes.`
    );
    if (!confirmed) return;
    setHeaderActionBusy(true);
    try {
      await deleteBasicPoll(groupId, pollId, { useServer: true });
      onClose?.();
    } catch (error) {
      setVoteError(error?.message || "Failed to delete poll.");
    } finally {
      setHeaderActionBusy(false);
    }
  }

  const showLoading = groupsLoading || pollLoading || votesLoading;
  const isAccessDenied = !groupsLoading && (!groupId || !isGroupMember || pollError?.code === "permission-denied");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              General poll
            </p>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {poll?.title || "Loading poll..."}
            </h2>
            {group?.name ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Questing group: {group.name}</p>
            ) : null}
            <PollDiscordMetaRow
              statusLabel={discordStatusLabel}
              messageUrl={pollDiscord?.messageUrl || ""}
              pendingSync={pollDiscord?.pendingSync === true}
              className="mt-2"
            >
              {showBasicPollNudgeButton ? (
                <PollNudgeButton
                  onClick={nudgeParticipants}
                  sending={nudgeSending}
                  cooldownRemainingMs={nudgeCooldownRemaining}
                />
              ) : null}
            </PollDiscordMetaRow>
          </div>
          <div className="flex items-center gap-2">
            {canManagePoll &&
            (poll?.status || BASIC_POLL_STATUSES.OPEN) === BASIC_POLL_STATUSES.FINALIZED ? (
              <button
                type="button"
                onClick={reopenPollAction}
                disabled={headerActionBusy}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Re-open
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggleArchive}
              disabled={headerActionBusy}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              {isArchived ? "Unarchive" : "Archive"}
            </button>
            {canManagePoll ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={headerActionBusy}
                    className="rounded-full border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    aria-label="General poll actions"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {canManagePoll &&
                  (poll?.status || BASIC_POLL_STATUSES.OPEN) === BASIC_POLL_STATUSES.OPEN ? (
                    <DropdownMenuItem onClick={finalizePollAction} disabled={headerActionBusy}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Finalize
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onClick={() => {
                      onEditPoll?.({
                        groupId,
                        pollId,
                        poll,
                      });
                    }}
                    disabled={headerActionBusy}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  {canManagePoll ? (
                    <DropdownMenuItem
                      onClick={deletePollAction}
                      disabled={headerActionBusy}
                      className="text-rose-600 dark:text-rose-400"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Close general poll modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[80vh] overflow-y-auto p-5">
          {showLoading ? (
            <LoadingState message="Loading group poll..." />
          ) : isAccessDenied ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">
              You do not have access to this group poll.
            </p>
          ) : !poll ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">This group poll was not found.</p>
          ) : (
            <div className="space-y-4">
              <BasicPollVotingCard
                poll={poll}
                participantCount={participantCountForSummary}
                voteCount={voteCount}
                hasSubmitted={hasSubmitted}
                myVote={myVote}
                draft={voteDraft}
                canVote={canVote}
                cardBusy={cardBusy}
                voteError={voteError}
                onMoveRankedOption={moveRankedOption}
                onAddRankedOption={addRankedOption}
                onRemoveRankedOption={removeRankedOption}
                onSelectOption={setMultipleChoiceSelection}
                onChangeOtherText={setOtherText}
                onSubmitVote={submitVote}
                onClearVote={clearVote}
                eligibleUsers={participantUsers}
                votedUsers={votedUsers}
                pendingUsers={pendingUsers}
                onViewOptionNote={(pollTitle, option) =>
                  setOptionNoteViewer({
                    pollTitle: String(pollTitle || "General poll"),
                    optionLabel: String(option?.label || "Option"),
                    note: String(option?.note || ""),
                  })
                }
              />
            </div>
          )}
        </div>
      </div>

      <PollOptionNoteDialog
        noteViewer={optionNoteViewer}
        onClose={() => setOptionNoteViewer(null)}
        overlayClassName="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 px-4"
      />
    </div>
  );
}
