import { useEffect, useState } from "react";
import {
  subscribeToBasicPollVotes,
  subscribeToEmbeddedBasicPolls,
} from "../../../lib/data/basicPolls";
import { hasSubmittedVoteForPoll } from "../../../lib/basic-polls/vote-submission";

export function useSchedulerEditorEmbeddedPolls({ isEditing, schedulerId }) {
  const [embeddedPolls, setEmbeddedPolls] = useState([]);
  const [embeddedPollsLoading, setEmbeddedPollsLoading] = useState(false);
  const [embeddedPollVoteCounts, setEmbeddedPollVoteCounts] = useState({});

  useEffect(() => {
    if (!isEditing || !schedulerId) {
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
  }, [isEditing, schedulerId]);

  useEffect(() => {
    setEmbeddedPollVoteCounts({});
    if (!isEditing || !schedulerId || embeddedPolls.length === 0) return () => {};

    const unsubscribers = embeddedPolls.map((poll) =>
      subscribeToBasicPollVotes(
        "scheduler",
        schedulerId,
        poll.id,
        (voteDocs) => {
          const count = (voteDocs || []).filter((voteDoc) =>
            hasSubmittedVoteForPoll(poll, voteDoc)
          ).length;
          setEmbeddedPollVoteCounts((previous) => {
            if (previous[poll.id] === count) return previous;
            return { ...previous, [poll.id]: count };
          });
        },
        () => {
          setEmbeddedPollVoteCounts((previous) => ({ ...previous, [poll.id]: 0 }));
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") unsubscribe();
      });
    };
  }, [embeddedPolls, isEditing, schedulerId]);

  return {
    embeddedPolls,
    setEmbeddedPolls,
    embeddedPollsLoading,
    embeddedPollVoteCounts,
  };
}
