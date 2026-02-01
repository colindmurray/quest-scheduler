import { useEffect, useState } from "react";
import { fetchSchedulerSlots, fetchSchedulerVotes } from "../../../lib/data/schedulers";

export function useSchedulerAttendance(participatingSchedulers) {
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

            const voteDocs = await fetchSchedulerVotes(scheduler.id);
            votesMap[scheduler.id] = voteDocs;
            votersMap[scheduler.id] = voteDocs
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
  }, [participatingSchedulers]);

  return { slotsByScheduler, votesByScheduler, votersByScheduler };
}
