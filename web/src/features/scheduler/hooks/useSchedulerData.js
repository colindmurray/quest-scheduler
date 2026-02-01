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
  const votesRef = useMemo(
    () => (schedulerId ? schedulerVotesRef(schedulerId) : null),
    [schedulerId]
  );
  const userVoteRef = useMemo(
    () => (schedulerId && user ? schedulerVoteDocRef(schedulerId, user.uid) : null),
    [schedulerId, user]
  );

  const slots = useFirestoreCollection(slotsRef);
  const allVotes = useFirestoreCollection(votesRef);
  const userVote = useFirestoreDoc(userVoteRef);

  return {
    scheduler,
    schedulerDocRef,
    creator,
    questingGroup,
    slots,
    allVotes,
    userVote,
    userVoteRef,
  };
}
