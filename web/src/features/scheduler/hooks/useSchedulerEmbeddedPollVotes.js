import { useEffect, useState } from "react";
import {
  subscribeToBasicPollVotes,
  subscribeToEmbeddedBasicPolls,
  subscribeToMyBasicPollVote,
} from "../../../lib/data/basicPolls";
import {
  hasSubmittedVoteForPoll,
  normalizeVoteOptionIds,
  normalizeVoteRankings,
} from "../../../lib/basic-polls/vote-submission";
import { BASIC_POLL_STATUSES, BASIC_POLL_VOTE_TYPES } from "../../../lib/basic-polls/constants";
import {
  canViewOtherVotesForUser,
  canViewVoterIdentities,
  resolveVoteVisibility,
} from "../../../lib/vote-visibility";

export function useSchedulerEmbeddedPollVotes({ schedulerId, userId, isCreator = false }) {
  const [embeddedPolls, setEmbeddedPolls] = useState([]);
  const [embeddedPollsLoading, setEmbeddedPollsLoading] = useState(true);
  const [embeddedPollVoteCounts, setEmbeddedPollVoteCounts] = useState({});
  const [embeddedVotesByPoll, setEmbeddedVotesByPoll] = useState({});
  const [embeddedMyVotes, setEmbeddedMyVotes] = useState({});
  const [embeddedVoteDrafts, setEmbeddedVoteDrafts] = useState({});

  useEffect(() => {
    if (!schedulerId) {
      setEmbeddedPolls([]);
      setEmbeddedPollsLoading(false);
      return;
    }
    setEmbeddedPollsLoading(true);
    const unsubscribe = subscribeToEmbeddedBasicPolls(
      schedulerId,
      (polls) => {
        setEmbeddedPolls(polls || []);
        setEmbeddedPollsLoading(false);
      },
      () => {
        setEmbeddedPolls([]);
        setEmbeddedPollsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [schedulerId]);

  useEffect(() => {
    setEmbeddedPollVoteCounts({});
    setEmbeddedVotesByPoll({});
    if (!schedulerId || embeddedPolls.length === 0) return () => {};
    const unsubscribers = embeddedPolls.map((poll) =>
      {
        const myVote = embeddedMyVotes[poll.id] || null;
        const hasVoted = hasSubmittedVoteForPoll(poll, myVote);
        const canReadVoteDetails = canViewOtherVotesForUser({
          voteVisibility: resolveVoteVisibility(poll?.voteVisibility),
          isCreator,
          hasVoted,
          allParticipantsVoted: poll?.votesAllSubmitted === true,
          isFinalized:
            String(poll?.status || BASIC_POLL_STATUSES.OPEN).toUpperCase() ===
            BASIC_POLL_STATUSES.FINALIZED,
        });
        const canReadVoterIdentities = canViewVoterIdentities({
          isCreator,
          hideVoterIdentities: poll?.hideVoterIdentities,
        });
        const canReadVoteProgress = canReadVoteDetails || canReadVoterIdentities;

        if (!canReadVoteProgress) {
          const ownVotes = hasVoted && myVote ? [{ id: userId, ...myVote }] : [];
          setEmbeddedVotesByPoll((previous) => ({ ...previous, [poll.id]: ownVotes }));
          setEmbeddedPollVoteCounts((previous) => ({ ...previous, [poll.id]: ownVotes.length }));
          return () => {};
        }

        return subscribeToBasicPollVotes(
          "scheduler",
          schedulerId,
          poll.id,
          (voteDocs) => {
            const normalizedVotes = voteDocs || [];
            const count = normalizedVotes.filter((voteDoc) =>
              hasSubmittedVoteForPoll(poll, voteDoc)
            ).length;
            setEmbeddedVotesByPoll((previous) => ({ ...previous, [poll.id]: normalizedVotes }));
            setEmbeddedPollVoteCounts((previous) => {
              if (previous[poll.id] === count) return previous;
              return { ...previous, [poll.id]: count };
            });
          },
          () => {
            setEmbeddedVotesByPoll((previous) => ({ ...previous, [poll.id]: [] }));
            setEmbeddedPollVoteCounts((previous) => ({ ...previous, [poll.id]: 0 }));
          }
        );
      }
    );
    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") unsubscribe();
      });
    };
  }, [embeddedMyVotes, embeddedPolls, isCreator, schedulerId, userId]);

  useEffect(() => {
    setEmbeddedMyVotes({});
    if (!schedulerId || !userId || embeddedPolls.length === 0) return () => {};
    const unsubscribers = embeddedPolls.map((poll) =>
      subscribeToMyBasicPollVote(
        "scheduler",
        schedulerId,
        poll.id,
        userId,
        (voteDoc) => {
          setEmbeddedMyVotes((previous) => ({ ...previous, [poll.id]: voteDoc || null }));
        },
        () => {
          setEmbeddedMyVotes((previous) => ({ ...previous, [poll.id]: null }));
        }
      )
    );
    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") unsubscribe();
      });
    };
  }, [embeddedPolls, schedulerId, userId]);

  useEffect(() => {
    if (embeddedPolls.length === 0) {
      setEmbeddedVoteDrafts({});
      return;
    }
    setEmbeddedVoteDrafts((previous) => {
      const next = { ...previous };
      embeddedPolls.forEach((poll) => {
        const myVote = embeddedMyVotes[poll.id] || null;
        const voteType = poll?.settings?.voteType || BASIC_POLL_VOTE_TYPES.MULTIPLE_CHOICE;
        if (voteType === BASIC_POLL_VOTE_TYPES.RANKED_CHOICE) {
          next[poll.id] = { rankings: normalizeVoteRankings(myVote) };
          return;
        }
        next[poll.id] = {
          optionIds: normalizeVoteOptionIds(myVote),
          otherText: String(myVote?.otherText || ""),
        };
      });
      return next;
    });
  }, [embeddedMyVotes, embeddedPolls]);

  return {
    embeddedPolls,
    embeddedPollsLoading,
    embeddedPollVoteCounts,
    embeddedVotesByPoll,
    embeddedMyVotes,
    embeddedVoteDrafts,
    setEmbeddedVoteDrafts,
  };
}
