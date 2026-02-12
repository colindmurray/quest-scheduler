import { useEffect, useState } from "react";
import {
  fetchDashboardEmbeddedBasicPolls,
  fetchDashboardGroupBasicPolls,
} from "../../../lib/data/basicPolls";

export function useDashboardBasicPollSource({
  userId,
  groupIdsKey,
  dashboardSchedulerIdsKey,
  isReady,
  refreshNonce = 0,
}) {
  const [basicPollSourceItems, setBasicPollSourceItems] = useState([]);
  const [basicPollLoading, setBasicPollLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBasicPolls() {
      if (!userId) {
        setBasicPollSourceItems([]);
        return;
      }

      const groupIdsForFetch = groupIdsKey ? groupIdsKey.split("|") : [];
      const schedulerIdsForFetch = dashboardSchedulerIdsKey
        ? dashboardSchedulerIdsKey.split("|")
        : [];

      setBasicPollLoading(true);
      try {
        const [groupPolls, embeddedPolls] = await Promise.all([
          fetchDashboardGroupBasicPolls(groupIdsForFetch, userId),
          fetchDashboardEmbeddedBasicPolls(schedulerIdsForFetch, userId),
        ]);

        if (!cancelled) {
          setBasicPollSourceItems([...(groupPolls || []), ...(embeddedPolls || [])]);
        }
      } catch (error) {
        console.error("Failed to load dashboard basic polls:", error);
        if (!cancelled) setBasicPollSourceItems([]);
      } finally {
        if (!cancelled) setBasicPollLoading(false);
      }
    }

    if (isReady) {
      loadBasicPolls();
    }

    return () => {
      cancelled = true;
    };
  }, [dashboardSchedulerIdsKey, groupIdsKey, isReady, refreshNonce, userId]);

  return { basicPollSourceItems, basicPollLoading };
}
