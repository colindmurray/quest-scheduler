import { useEffect, useMemo, useState } from "react";
import { useFirestoreCollection } from "./useFirestoreCollection";
import {
  schedulersByParticipantQuery,
  schedulersByCreatorQuery,
  subscribeSchedulersByGroupIds,
} from "../lib/data/schedulers";

export function useSchedulersByParticipant(userId) {
  const queryRef = useMemo(() => schedulersByParticipantQuery(userId), [userId]);
  return useFirestoreCollection(queryRef);
}

export function useSchedulersByCreator(userId) {
  const queryRef = useMemo(() => schedulersByCreatorQuery(userId), [userId]);
  return useFirestoreCollection(queryRef);
}

export function useSchedulersByGroupIds(groupIds) {
  const idsKey = useMemo(() => (groupIds || []).slice().sort().join("|"), [groupIds]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(Boolean(groupIds?.length));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!groupIds || groupIds.length === 0) {
      setData([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribe = subscribeSchedulersByGroupIds(
      groupIds,
      (schedulers, isLoaded) => {
        setData(schedulers);
        if (isLoaded) {
          setLoading(false);
        }
      },
      (err) => {
        setError(err);
      }
    );

    return () => unsubscribe();
  }, [idsKey]);

  return { data, loading, error };
}
