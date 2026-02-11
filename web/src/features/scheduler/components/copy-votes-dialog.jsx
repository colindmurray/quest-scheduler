import { serverTimestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, TriangleAlert } from "lucide-react";
import { useAuth } from "../../../app/useAuth";
import { useQuestingGroups } from "../../../hooks/useQuestingGroups";
import { usePollInvites } from "../../../hooks/usePollInvites";
import { useSchedulersByGroupIds, useSchedulersByParticipant } from "../../../hooks/useSchedulers";
import {
  upsertSchedulerVote,
  fetchSchedulerSlots,
  fetchUserSchedulerVote,
} from "../../../lib/data/schedulers";
import { acceptPollInvite } from "../../../lib/data/pollInvites";
import { normalizeEmail } from "../../../lib/utils";
import {
  formatZonedDateTimeRange,
  resolveDisplayTimeZone,
  shouldShowTimeZone,
} from "../../../lib/time";
import { buildCopyVotePlan } from "../utils/copy-votes";
import { VOTE_VALUES } from "../../../lib/vote-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";
import { VoteToggle } from "./vote-toggle";
import { emitPollEvent } from "../../../lib/data/notification-events";
import { buildNotificationActor } from "../../../lib/data/notification-events";

function toMs(iso) {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function groupSlotsByDay(slots = [], displayTimeZone = null) {
  const groups = new Map();
  (slots || []).forEach((slot) => {
    const start = slot?.start ? new Date(slot.start) : null;
    if (!start) return;
    const key = displayTimeZone
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: displayTimeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(start)
      : start.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slot);
  });
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
  return sortedKeys.map((key) => {
    const items = groups.get(key) || [];
    items.sort((a, b) => (toMs(a.start) || 0) - (toMs(b.start) || 0));
    return { key, slots: items };
  });
}

export function CopyVotesDialog({
  open,
  onOpenChange,
  sourceSchedulerId,
  sourceTitle,
  sourceSlots = [],
  sourceVoteDoc = null,
  sourceTimeZone = null,
  userSettings = null,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { groups } = useQuestingGroups();
  const { pendingInvites } = usePollInvites();

  const groupIds = useMemo(() => (groups || []).map((g) => g.id).filter(Boolean), [groups]);
  const participating = useSchedulersByParticipant(user?.uid || null);
  const { data: groupSchedulers } = useSchedulersByGroupIds(groupIds);

  const normalizedUserEmail = normalizeEmail(user?.email) || null;

  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidateSlotsById, setCandidateSlotsById] = useState({});

  const [selectedSchedulerId, setSelectedSchedulerId] = useState("");
  const [destinationSlots, setDestinationSlots] = useState([]);
  const [matchInfoBySlotId, setMatchInfoBySlotId] = useState({});
  const [draftVotes, setDraftVotes] = useState({});
  const [draftNoTimesWork, setDraftNoTimesWork] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveDisplayTimeZone = useMemo(() => {
    const pollTimeZone = sourceTimeZone || null;
    return resolveDisplayTimeZone({ pollTimeZone, settings: userSettings });
  }, [sourceTimeZone, userSettings]);
  const showTimeZone = useMemo(() => shouldShowTimeZone(userSettings), [userSettings]);

  const sourceVotes = sourceVoteDoc?.votes || {};
  const sourceNoTimesWork = Boolean(sourceVoteDoc?.noTimesWork);

  const baseCandidateDocs = useMemo(() => {
    const deduped = new Map();
    [...(participating.data || []), ...(groupSchedulers || []), ...(pendingInvites || [])].forEach(
      (sched) => {
        if (!sched?.id) return;
        if (sched.id === sourceSchedulerId) return;
        deduped.set(sched.id, sched);
      }
    );
    return Array.from(deduped.values());
  }, [participating.data, groupSchedulers, pendingInvites, sourceSchedulerId]);

  useEffect(() => {
    if (!open) return;
    setSelectedSchedulerId("");
    setDestinationSlots([]);
    setMatchInfoBySlotId({});
    setDraftVotes({});
    setDraftNoTimesWork(false);
  }, [open]);

  useEffect(() => {
    if (!open || !user?.uid) return;
    let cancelled = false;
    const nowMs = Date.now();

    const load = async () => {
      setLoadingCandidates(true);
      try {
        const pendingIds = new Set((pendingInvites || []).map((s) => s.id).filter(Boolean));

        const eligible = [];
        const slotsById = {};

        // Compute eligibility by fetching slots + checking if the current user already voted.
        await Promise.all(
          baseCandidateDocs
            .filter((sched) => sched?.status === "OPEN")
            .map(async (sched) => {
              const schedulerId = sched.id;
              try {
                const [slots, existingVote] = await Promise.all([
                  fetchSchedulerSlots(schedulerId),
                  fetchUserSchedulerVote(schedulerId, user.uid),
                ]);
                const hasFuture = (slots || []).some((slot) => {
                  const endMs = slot?.end ? toMs(slot.end) : slot?.start ? toMs(slot.start) : null;
                  return endMs != null && endMs > nowMs;
                });
                if (!hasFuture) return;
                if (existingVote) return; // not eligible if already voted
                slotsById[schedulerId] = slots || [];
                eligible.push({
                  id: schedulerId,
                  title: sched.title || "Session Poll",
                  creatorId: sched.creatorId || null,
                  creatorEmail: sched.creatorEmail || null,
                  pendingInvite: pendingIds.has(schedulerId) || (normalizedUserEmail
                    ? (sched.pendingInvites || []).some(
                        (email) => normalizeEmail(email) === normalizedUserEmail
                      )
                    : false),
                  timezone: sched.timezone || null,
                });
              } catch (err) {
                console.error("Failed to evaluate copy votes candidate:", err);
              }
            })
        );

        eligible.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        if (!cancelled) {
          setCandidateSlotsById(slotsById);
          setCandidates(eligible);
        }
      } finally {
        if (!cancelled) setLoadingCandidates(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, user?.uid, pendingInvites, baseCandidateDocs, normalizedUserEmail]);

  useEffect(() => {
    if (!open || !selectedSchedulerId) return;
    const nowMs = Date.now();
    const slots = candidateSlotsById[selectedSchedulerId] || [];
    const plan = buildCopyVotePlan({
      sourceSlots,
      sourceVotes,
      sourceNoTimesWork,
      destinationSlots: slots,
      nowMs,
    });
    setDestinationSlots(plan.futureDestinationSlots);
    setMatchInfoBySlotId(plan.matchInfoBySlotId);
    setDraftNoTimesWork(sourceNoTimesWork);
    setDraftVotes(sourceNoTimesWork ? {} : plan.prefilledVotes);
  }, [open, selectedSchedulerId, candidateSlotsById, sourceSlots, sourceVotes, sourceNoTimesWork]);

  const groupedDestinationSlots = useMemo(() => {
    return groupSlotsByDay(destinationSlots, effectiveDisplayTimeZone);
  }, [destinationSlots, effectiveDisplayTimeZone]);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedSchedulerId) || null,
    [candidates, selectedSchedulerId]
  );

  const toggleNoTimesWork = (checked) => {
    if (checked) {
      setDraftVotes({});
      setDraftNoTimesWork(true);
      return;
    }
    setDraftNoTimesWork(false);
  };

  const setVote = (slotId, nextValue) => {
    setDraftVotes((prev) => {
      const next = { ...prev };
      if (!nextValue) {
        delete next[slotId];
      } else {
        next[slotId] = nextValue;
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!user?.uid || !user?.email) return;
    if (!selectedCandidate?.id) return;
    setSaving(true);
    try {
      if (selectedCandidate.pendingInvite) {
        toast("Accepting invite...");
        await acceptPollInvite(selectedCandidate.id, user.email, user.uid);
      }

      await upsertSchedulerVote(selectedCandidate.id, user.uid, {
        voterId: user.uid,
        userEmail: user.email,
        userAvatar: user.photoURL,
        votes: draftNoTimesWork ? {} : draftVotes,
        noTimesWork: draftNoTimesWork,
        lastVotedFrom: "copyVotes",
        updatedAt: serverTimestamp(),
      });

      const recipient = normalizeEmail(selectedCandidate.creatorEmail);
      if (recipient && normalizeEmail(user.email) !== recipient) {
        const recipients = {
          userIds: selectedCandidate.creatorId ? [selectedCandidate.creatorId] : [],
          emails: recipient ? [recipient] : [],
        };
        if (recipients.userIds.length || recipients.emails.length) {
          try {
            await emitPollEvent({
              eventType: "VOTE_SUBMITTED",
              schedulerId: selectedCandidate.id,
              pollTitle: selectedCandidate.title || "Session Poll",
              actor: buildNotificationActor(user),
              payload: {
                pollTitle: selectedCandidate.title || "Session Poll",
                voterEmail: normalizeEmail(user.email) || user.email,
                voterUserId: user.uid,
              },
              recipients,
              dedupeKey: `poll:${selectedCandidate.id}:vote:${user.uid}`,
            });
          } catch (notifyErr) {
            console.error("Failed to notify creator about vote:", notifyErr);
          }
        }
      }

      toast.success("Votes copied");
      onOpenChange(false);
      navigate(`/scheduler/${selectedCandidate.id}`);
    } catch (err) {
      console.error("Failed to copy votes:", err);
      toast.error(err?.message || "Failed to copy votes.");
    } finally {
      setSaving(false);
    }
  };

  const title = sourceTitle || "this poll";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Copy votes</DialogTitle>
          <DialogDescription>
            Copy your votes from {title} into another open poll, then review and adjust.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Destination poll
            </label>
            <Select value={selectedSchedulerId} onValueChange={setSelectedSchedulerId}>
              <SelectTrigger
                className="h-11 rounded-xl px-3 text-sm"
                aria-label="Destination poll"
              >
                <SelectValue
                  placeholder={loadingCandidates ? "Loading eligible polls..." : "Select a poll"}
                />
              </SelectTrigger>
              <SelectContent>
                {candidates.length === 0 && (
                  <SelectItem value="__none__" disabled>
                    No eligible polls found
                  </SelectItem>
                )}
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCandidate?.pendingInvite && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This poll is a pending invite. Submitting will automatically accept the invite.
              </p>
            )}
          </div>

          {selectedSchedulerId && (
            <>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <span>No times work for me</span>
                <Switch checked={draftNoTimesWork} onCheckedChange={toggleNoTimesWork} />
              </div>

              <div className="max-h-[50vh] space-y-5 overflow-auto pr-1">
                {groupedDestinationSlots.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No future time slots in the destination poll.
                  </p>
                )}
                {groupedDestinationSlots.map((group) => {
                  const firstStart = group.slots[0]?.start ? new Date(group.slots[0].start) : null;
                  const dayLabel = firstStart
                    ? formatZonedDateTimeRange({
                        start: firstStart,
                        end: null,
                        timeZone: effectiveDisplayTimeZone,
                        startPattern: "EEE, MMM d, yyyy",
                        showTimeZone: false,
                      })
                    : group.key;
                  return (
                    <div key={group.key} className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {dayLabel}
                      </div>
                      {group.slots.map((slot) => {
                        const vote = draftVotes[slot.id] || null;
                        const match = matchInfoBySlotId[slot.id] || { type: "none" };
                        const isCopied = match.type === "copied" || match.type === "copied-extends";
                        const isWarn = match.type === "copied-extends";
                        const isReview = match.type === "overlap-review";
                        const border = isWarn
                          ? "border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/10"
                          : isReview
                            ? "border-sky-300 bg-sky-50/60 dark:border-sky-700 dark:bg-sky-900/10"
                            : "border-slate-200/70 dark:border-slate-700";

                        return (
                          <div key={slot.id} className={`grid gap-2 rounded-2xl border px-4 py-3 ${border}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {formatZonedDateTimeRange({
                                  start: new Date(slot.start),
                                  end: new Date(slot.end),
                                  timeZone: effectiveDisplayTimeZone,
                                  startPattern: "h:mm a",
                                  endPattern: "h:mm a",
                                  showTimeZone,
                                })}
                              </p>
                              {isCopied && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  <Check className="h-3.5 w-3.5" />
                                  Copied
                                </span>
                              )}
                              {isReview && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-600/10 px-3 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                                  <TriangleAlert className="h-3.5 w-3.5" />
                                  Review
                                </span>
                              )}
                            </div>

                            {match.type === "copied-extends" && (
                              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                                Copied, but this slot extends {match.overageLabel} past your source slot end.
                              </p>
                            )}
                            {match.type === "overlap-review" && (
                              <p className="text-xs text-slate-600 dark:text-slate-300">
                                Overlaps with your source vote ({match.sourceVote}). Not copied because this slot starts earlier.
                              </p>
                            )}
                            {match.type === "none" && (
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                No match in your source poll.
                              </p>
                            )}

                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                              <span>Feasible</span>
                              <VoteToggle
                                checked={vote === VOTE_VALUES.FEASIBLE || vote === VOTE_VALUES.PREFERRED}
                                disabled={draftNoTimesWork || vote === VOTE_VALUES.PREFERRED}
                                label={`Feasible ${slot.id}`}
                                onChange={(checked) => setVote(slot.id, checked ? VOTE_VALUES.FEASIBLE : null)}
                              />
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                              <span>Preferred</span>
                              <VoteToggle
                                checked={vote === VOTE_VALUES.PREFERRED}
                                disabled={draftNoTimesWork}
                                label={`Preferred ${slot.id}`}
                                onChange={(checked) => setVote(slot.id, checked ? VOTE_VALUES.PREFERRED : null)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
            disabled={saving || !selectedSchedulerId}
          >
            {saving ? "Submitting..." : "Confirm & go to poll"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
