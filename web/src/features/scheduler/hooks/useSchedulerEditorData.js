import { useMemo } from "react";
import { useFirestoreCollection } from "../../../hooks/useFirestoreCollection";
import { useFirestoreDoc } from "../../../hooks/useFirestoreDoc";
import { schedulerRef, schedulerSlotsRef, schedulerVotesRef } from "../../../lib/data/schedulers";

export function useSchedulerEditorData({ schedulerId, isEditing }) {
  const schedulerDocRef = useMemo(
    () => (isEditing && schedulerId ? schedulerRef(schedulerId) : null),
    [isEditing, schedulerId]
  );
  const scheduler = useFirestoreDoc(schedulerDocRef);

  const slotsRef = useMemo(
    () => (isEditing && schedulerId ? schedulerSlotsRef(schedulerId) : null),
    [isEditing, schedulerId]
  );
  const votesRef = useMemo(
    () => (isEditing && schedulerId ? schedulerVotesRef(schedulerId) : null),
    [isEditing, schedulerId]
  );

  const slotsSnapshot = useFirestoreCollection(slotsRef);
  const votesSnapshot = useFirestoreCollection(votesRef);

  return {
    schedulerDocRef,
    scheduler,
    slotsSnapshot,
    votesSnapshot,
  };
}
