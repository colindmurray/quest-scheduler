import { useCallback, useState } from "react";
import {
  deleteBasicPoll,
  deleteEmbeddedBasicPoll,
  finalizeBasicPollForParent,
  reopenBasicPollForParent,
} from "../../../lib/data/basicPolls";

export function useDashboardBasicPollActions({
  archivePoll,
  unarchivePoll,
  refreshBasicPolls,
}) {
  const [basicPollArchiveBusy, setBasicPollArchiveBusy] = useState({});
  const [basicPollActionBusy, setBasicPollActionBusy] = useState({});
  const [deletePollRequest, setDeletePollRequest] = useState(null);

  const handleToggleBasicPollArchive = useCallback(
    async (poll) => {
      if (!poll?.archiveKey) return;
      setBasicPollArchiveBusy((current) => ({ ...current, [poll.archiveKey]: true }));
      try {
        if (poll.isArchived) {
          await unarchivePoll(poll.archiveKey);
        } else {
          await archivePoll(poll.archiveKey);
        }
      } catch (error) {
        console.error("Failed to update basic poll archive state:", error);
      } finally {
        setBasicPollArchiveBusy((current) => ({ ...current, [poll.archiveKey]: false }));
      }
    },
    [archivePoll, unarchivePoll]
  );

  const withBasicPollActionBusy = useCallback(async (poll, actionKey, actionFn) => {
    if (!poll?.archiveKey || !actionKey || typeof actionFn !== "function") return;
    const busyKey = `${poll.archiveKey}:${actionKey}`;
    setBasicPollActionBusy((current) => ({ ...current, [busyKey]: true }));
    try {
      await actionFn();
    } finally {
      setBasicPollActionBusy((current) => ({ ...current, [busyKey]: false }));
    }
  }, []);

  const handleFinalizeBasicPoll = useCallback(
    async (poll) => {
      if (!poll?.parentType || !poll?.parentId || !poll?.pollId) return;
      await withBasicPollActionBusy(poll, "finalize", async () => {
        await finalizeBasicPollForParent(poll.parentType, poll.parentId, poll.pollId);
        refreshBasicPolls();
      });
    },
    [refreshBasicPolls, withBasicPollActionBusy]
  );

  const handleReopenBasicPoll = useCallback(
    async (poll) => {
      if (!poll?.parentType || !poll?.parentId || !poll?.pollId) return;
      await withBasicPollActionBusy(poll, "reopen", async () => {
        await reopenBasicPollForParent(poll.parentType, poll.parentId, poll.pollId);
        refreshBasicPolls();
      });
    },
    [refreshBasicPolls, withBasicPollActionBusy]
  );

  const handleDeleteBasicPoll = useCallback((poll) => {
    if (!poll?.parentType || !poll?.parentId || !poll?.pollId) return;
    setDeletePollRequest(poll);
  }, []);

  const confirmDeleteBasicPoll = useCallback(async () => {
    const poll = deletePollRequest;
    if (!poll?.parentType || !poll?.parentId || !poll?.pollId) return;
    setDeletePollRequest(null);
    await withBasicPollActionBusy(poll, "delete", async () => {
      if (poll.parentType === "group") {
        await deleteBasicPoll(poll.parentId, poll.pollId, { useServer: true });
      } else {
        await deleteEmbeddedBasicPoll(poll.parentId, poll.pollId, { useServer: true });
      }
      refreshBasicPolls();
    });
  }, [deletePollRequest, refreshBasicPolls, withBasicPollActionBusy]);

  const clearDeletePollRequest = useCallback(() => {
    setDeletePollRequest(null);
  }, []);

  return {
    basicPollArchiveBusy,
    basicPollActionBusy,
    deletePollRequest,
    handleToggleBasicPollArchive,
    handleFinalizeBasicPoll,
    handleReopenBasicPoll,
    handleDeleteBasicPoll,
    confirmDeleteBasicPoll,
    clearDeletePollRequest,
  };
}
