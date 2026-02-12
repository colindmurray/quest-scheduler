import { useCallback, useEffect, useState } from "react";

function buildEditingPollState(poll) {
  if (!poll?.parentId || !poll?.pollId) return null;
  return {
    groupId: poll.parentId,
    pollId: poll.pollId,
    poll: {
      ...poll,
      parentType: "group",
      parentId: poll.parentId,
      pollId: poll.pollId,
    },
  };
}

export function useDashboardGeneralPollModals({
  initialGroupPollModal,
  safeNavigate,
  refreshBasicPolls,
}) {
  const [activeGroupPollModal, setActiveGroupPollModal] = useState(initialGroupPollModal);
  const [editingGeneralPoll, setEditingGeneralPoll] = useState(null);
  const [createGeneralPollOpen, setCreateGeneralPollOpen] = useState(false);

  useEffect(() => {
    if (!initialGroupPollModal?.groupId || !initialGroupPollModal?.pollId) return;
    setActiveGroupPollModal((current) => {
      if (
        current?.groupId === initialGroupPollModal.groupId &&
        current?.pollId === initialGroupPollModal.pollId
      ) {
        return current;
      }
      return initialGroupPollModal;
    });
  }, [initialGroupPollModal]);

  const handleEditBasicPoll = useCallback(
    (poll) => {
      if (poll?.parentType === "group" && poll?.parentId && poll?.pollId) {
        setActiveGroupPollModal(null);
        setCreateGeneralPollOpen(false);
        setEditingGeneralPoll(buildEditingPollState(poll));
        return;
      }
      if (!poll?.voteLink) return;
      safeNavigate(poll.voteLink, { compareMode: "pathname+search" });
    },
    [safeNavigate]
  );

  const handleOpenBasicPoll = useCallback(
    (poll) => {
      if (!poll?.voteLink) return;
      if (poll.parentType === "group") {
        setActiveGroupPollModal({
          groupId: poll.parentId,
          pollId: poll.pollId,
        });
        return;
      }
      safeNavigate(poll.voteLink, { compareMode: "pathname+search" });
    },
    [safeNavigate]
  );

  const handleCreatedGeneralPoll = useCallback(
    (pollId, groupId) => {
      refreshBasicPolls();
      if (!pollId || !groupId) return;
      setActiveGroupPollModal({ groupId, pollId });
    },
    [refreshBasicPolls]
  );

  const handleEditedGeneralPoll = useCallback(
    (pollId, groupId) => {
      setEditingGeneralPoll(null);
      refreshBasicPolls();
      if (!pollId || !groupId) return;
      setActiveGroupPollModal({ groupId, pollId });
    },
    [refreshBasicPolls]
  );

  const openCreateGeneralPoll = useCallback(() => {
    setCreateGeneralPollOpen(true);
  }, []);

  const closeEditingGeneralPoll = useCallback(() => {
    setEditingGeneralPoll(null);
  }, []);

  const closeActiveGroupPollModal = useCallback(() => {
    setActiveGroupPollModal(null);
  }, []);

  const handleGroupModalEditPoll = useCallback((pollDetails) => {
    if (!pollDetails?.groupId || !pollDetails?.pollId) return;
    setActiveGroupPollModal(null);
    setEditingGeneralPoll({
      groupId: pollDetails.groupId,
      pollId: pollDetails.pollId,
      poll: {
        ...(pollDetails.poll || {}),
        parentType: "group",
        parentId: pollDetails.groupId,
        pollId: pollDetails.pollId,
      },
    });
  }, []);

  return {
    activeGroupPollModal,
    editingGeneralPoll,
    createGeneralPollOpen,
    setCreateGeneralPollOpen,
    handleEditBasicPoll,
    handleOpenBasicPoll,
    handleCreatedGeneralPoll,
    handleEditedGeneralPoll,
    openCreateGeneralPoll,
    closeEditingGeneralPoll,
    closeActiveGroupPollModal,
    handleGroupModalEditPoll,
  };
}
