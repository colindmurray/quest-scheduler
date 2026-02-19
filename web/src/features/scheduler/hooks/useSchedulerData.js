import { useMemo } from "react";
import { useFirestoreCollection } from "../../../hooks/useFirestoreCollection";
import { useFirestoreDoc } from "../../../hooks/useFirestoreDoc";
import {
  schedulerRef,
  schedulerSlotsRef,
  schedulerVoteDocRef,
  schedulerVotesRef,
} from "../../../lib/data/schedulers";
import { userRef } from "../../../lib/data/users";
import { questingGroupRef } from "../../../lib/data/questingGroups";
import { hasSubmittedSchedulerVote } from "../../../lib/vote-utils";
import { canViewOtherVotesForUser, resolveVoteVisibility } from "../../../lib/vote-visibility";

export function useSchedulerData({ schedulerId, user }) {
  const schedulerDocRef = useMemo(
    () => (schedulerId ? schedulerRef(schedulerId) : null),
    [schedulerId]
  );
  const scheduler = useFirestoreDoc(schedulerDocRef);

  const creatorDocRef = useMemo(
    () => userRef(scheduler.data?.creatorId || null),
    [scheduler.data?.creatorId]
  );
  const creator = useFirestoreDoc(creatorDocRef);

  const questingGroupDocRef = useMemo(
    () =>
      scheduler.data?.questingGroupId ? questingGroupRef(scheduler.data.questingGroupId) : null,
    [scheduler.data?.questingGroupId]
  );
  const questingGroup = useFirestoreDoc(questingGroupDocRef);

  const slotsRef = useMemo(
    () => (schedulerId ? schedulerSlotsRef(schedulerId) : null),
    [schedulerId]
  );
  const userVoteRef = useMemo(
    () => (schedulerId && user ? schedulerVoteDocRef(schedulerId, user.uid) : null),
    [schedulerId, user]
  );

  const slots = useFirestoreCollection(slotsRef);
  const userVote = useFirestoreDoc(userVoteRef);
  const canReadAllVotes = useMemo(() => {
    const schedulerData = scheduler.data || null;
    if (!schedulerId || !user || !schedulerData) return false;
    return canViewOtherVotesForUser({
      voteVisibility: resolveVoteVisibility(schedulerData.voteVisibility),
      isCreator: schedulerData.creatorId === user.uid,
      hasVoted: hasSubmittedSchedulerVote(userVote.data),
      allParticipantsVoted: schedulerData.votesAllSubmitted === true,
      isFinalized: schedulerData.status === "FINALIZED",
    });
  }, [scheduler.data, schedulerId, user, userVote.data]);
  const votesRef = useMemo(
    () => (schedulerId && canReadAllVotes ? schedulerVotesRef(schedulerId) : null),
    [canReadAllVotes, schedulerId]
  );
  const allVotes = useFirestoreCollection(votesRef);

  return {
    scheduler,
    schedulerDocRef,
    creator,
    questingGroup,
    slots,
    allVotes,
    canReadAllVotes,
    userVote,
    userVoteRef,
  };
}
