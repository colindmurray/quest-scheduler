import { useEffect, useState } from "react";
import {
  fetchSchedulerSlots,
  fetchSchedulerVotes,
  fetchUserSchedulerVote,
} from "../../../lib/data/schedulers";
import { hasSubmittedSchedulerVote } from "../../../lib/vote-utils";
import { canViewOtherVotesForUser, resolveVoteVisibility } from "../../../lib/vote-visibility";

export function useSchedulerAttendance(participatingSchedulers, currentUserId = null) {
  const [slotsByScheduler, setSlotsByScheduler] = useState({});
  const [votesByScheduler, setVotesByScheduler] = useState({});
  const [votersByScheduler, setVotersByScheduler] = useState({});

  useEffect(() => {
    if (!participatingSchedulers.length) {
      setSlotsByScheduler({});
      setVotesByScheduler({});
      setVotersByScheduler({});
      return;
    }

    const fetchSlotsAndVotes = async () => {
      const slotsMap = {};
      const votesMap = {};
      const votersMap = {};

      await Promise.all(
        participatingSchedulers.map(async (scheduler) => {
          try {
            const slots = await fetchSchedulerSlots(scheduler.id);
            slotsMap[scheduler.id] = slots;

            const voteVisibility = resolveVoteVisibility(scheduler?.voteVisibility);
            const isCreator =
              currentUserId &&
              String(scheduler?.creatorId || "").trim() === String(currentUserId).trim();
            let ownVoteDoc = null;
            let hasVoted = false;

            let canReadOtherVotes = canViewOtherVotesForUser({
              voteVisibility,
              isCreator,
              hasVoted: false,
              allParticipantsVoted: scheduler?.votesAllSubmitted === true,
              isFinalized: String(scheduler?.status || "").toUpperCase() === "FINALIZED",
            });

            if (!canReadOtherVotes && currentUserId) {
              ownVoteDoc = await fetchUserSchedulerVote(scheduler.id, currentUserId);
              hasVoted = hasSubmittedSchedulerVote(ownVoteDoc);
              canReadOtherVotes = canViewOtherVotesForUser({
                voteVisibility,
                isCreator,
                hasVoted,
                allParticipantsVoted: scheduler?.votesAllSubmitted === true,
                isFinalized: String(scheduler?.status || "").toUpperCase() === "FINALIZED",
              });
            }

            if (!canReadOtherVotes) {
              const ownSubmittedVotes = hasVoted && ownVoteDoc ? [ownVoteDoc] : [];
              votesMap[scheduler.id] = ownSubmittedVotes;
              votersMap[scheduler.id] = ownSubmittedVotes
                .map((voteDoc) => ({
                  id: voteDoc.id,
                  email: voteDoc.userEmail,
                  avatar: voteDoc.userAvatar,
                }))
                .filter((voter) => voter.id || voter.email);
              return;
            }

            const voteDocs = await fetchSchedulerVotes(scheduler.id);
            const submittedVoteDocs = (voteDocs || []).filter((voteDoc) =>
              hasSubmittedSchedulerVote(voteDoc)
            );
            votesMap[scheduler.id] = submittedVoteDocs;
            votersMap[scheduler.id] = submittedVoteDocs
              .map((voteDoc) => ({
                id: voteDoc.id,
                email: voteDoc.userEmail,
                avatar: voteDoc.userAvatar,
              }))
              .filter((voter) => voter.id || voter.email);
          } catch (err) {
            console.error(`Failed to fetch data for scheduler ${scheduler.id}:`, err);
          }
        })
      );

      setSlotsByScheduler(slotsMap);
      setVotesByScheduler(votesMap);
      setVotersByScheduler(votersMap);
    };

    fetchSlotsAndVotes();
  }, [currentUserId, participatingSchedulers]);

  return { slotsByScheduler, votesByScheduler, votersByScheduler };
}
