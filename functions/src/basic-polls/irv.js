function normalizeBallot(rankings, validOptionIds) {
  if (!Array.isArray(rankings)) return [];
  const seen = new Set();
  const cleaned = [];
  rankings.forEach((optionId) => {
    if (typeof optionId !== "string" || !optionId.trim()) return;
    if (!validOptionIds.has(optionId) || seen.has(optionId)) return;
    seen.add(optionId);
    cleaned.push(optionId);
  });
  return cleaned;
}

function firstActiveChoice(ballot, activeSet) {
  for (const optionId of ballot) {
    if (activeSet.has(optionId)) return optionId;
  }
  return null;
}

function countRound(activeIds, ballots) {
  const activeSet = new Set(activeIds);
  const counts = Object.fromEntries(activeIds.map((optionId) => [optionId, 0]));
  let exhausted = 0;

  ballots.forEach((ballot) => {
    const choice = firstActiveChoice(ballot, activeSet);
    if (!choice) {
      exhausted += 1;
      return;
    }
    counts[choice] += 1;
  });

  return {
    counts,
    exhausted,
    nonExhausted: ballots.length - exhausted,
  };
}

function narrowByPreviousRounds(lowestIds, priorRounds) {
  let tied = lowestIds.slice();
  for (let index = priorRounds.length - 1; index >= 0 && tied.length > 1; index -= 1) {
    const previousCounts = (priorRounds[index] && priorRounds[index].counts) || {};
    const minPrevious = Math.min.apply(
      null,
      tied.map((optionId) => (previousCounts[optionId] == null ? 0 : previousCounts[optionId]))
    );
    const narrowed = tied.filter(
      (optionId) => (previousCounts[optionId] == null ? 0 : previousCounts[optionId]) === minPrevious
    );
    if (narrowed.length < tied.length) {
      tied = narrowed;
    }
  }
  return tied;
}

function chooseEliminatedIds(params) {
  const { activeIds, counts, lowestIds, priorRounds } = params;
  if (lowestIds.length <= 1) return lowestIds.slice();

  const narrowed = narrowByPreviousRounds(lowestIds, priorRounds);
  if (narrowed.length === 1) return narrowed;

  const lowestCount = counts[lowestIds[0]];
  let nextLowest = Infinity;
  activeIds.forEach((optionId) => {
    if (lowestIds.includes(optionId)) return;
    const value = counts[optionId];
    if (value > lowestCount && value < nextLowest) {
      nextLowest = value;
    }
  });

  const combinedLowestTotal = lowestCount * lowestIds.length;
  if (Number.isFinite(nextLowest) && combinedLowestTotal < nextLowest) {
    return lowestIds.slice();
  }

  const fallback = activeIds.find((optionId) => narrowed.includes(optionId)) || narrowed[0];
  return [fallback];
}

function computeInstantRunoffResults(input) {
  const params = input || {};
  const optionIds = params.optionIds || [];
  const votes = params.votes || [];
  const normalizedOptionIds = Array.from(
    new Set(optionIds.filter((optionId) => typeof optionId === "string" && optionId.trim()))
  );
  const validOptionSet = new Set(normalizedOptionIds);
  const ballots = votes.map((voteDoc) => normalizeBallot(voteDoc && voteDoc.rankings, validOptionSet));

  if (normalizedOptionIds.length === 0) {
    return {
      rounds: [],
      winnerIds: [],
      tiedIds: [],
      totalBallots: ballots.length,
    };
  }

  let activeIds = normalizedOptionIds.slice();
  const rounds = [];

  for (let roundIndex = 1; roundIndex <= 100; roundIndex += 1) {
    const round = countRound(activeIds, ballots);
    const winnerIds = activeIds.filter((optionId) => round.counts[optionId] * 2 > round.nonExhausted);
    if (winnerIds.length > 0) {
      rounds.push({
        round: roundIndex,
        counts: round.counts,
        exhausted: round.exhausted,
        nonExhausted: round.nonExhausted,
        eliminatedIds: [],
      });
      return {
        rounds,
        winnerIds,
        tiedIds: [],
        totalBallots: ballots.length,
      };
    }

    const lowestCount = Math.min.apply(
      null,
      activeIds.map((optionId) => round.counts[optionId])
    );
    const lowestIds = activeIds.filter((optionId) => round.counts[optionId] === lowestCount);
    const allTied = lowestIds.length === activeIds.length;
    if (allTied) {
      rounds.push({
        round: roundIndex,
        counts: round.counts,
        exhausted: round.exhausted,
        nonExhausted: round.nonExhausted,
        eliminatedIds: lowestIds.slice(),
      });
      return {
        rounds,
        winnerIds: [],
        tiedIds: activeIds.slice(),
        totalBallots: ballots.length,
      };
    }

    const eliminatedIds = chooseEliminatedIds({
      activeIds,
      counts: round.counts,
      lowestIds,
      priorRounds: rounds,
    });

    rounds.push({
      round: roundIndex,
      counts: round.counts,
      exhausted: round.exhausted,
      nonExhausted: round.nonExhausted,
      eliminatedIds: eliminatedIds.slice(),
    });

    activeIds = activeIds.filter((optionId) => !eliminatedIds.includes(optionId));
    if (activeIds.length === 1) {
      return {
        rounds,
        winnerIds: activeIds.slice(),
        tiedIds: [],
        totalBallots: ballots.length,
      };
    }
    if (activeIds.length === 0) {
      return {
        rounds,
        winnerIds: [],
        tiedIds: [],
        totalBallots: ballots.length,
      };
    }
  }

  return {
    rounds,
    winnerIds: [],
    tiedIds: activeIds.slice(),
    totalBallots: ballots.length,
  };
}

module.exports = {
  computeInstantRunoffResults,
};
