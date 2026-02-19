const RANKED_TIE_BREAK_METHODS = Object.freeze({
  BORDA: "BORDA",
  RANDOM: "RANDOM",
});

function normalizeTieBreakMethod(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === RANKED_TIE_BREAK_METHODS.BORDA) return RANKED_TIE_BREAK_METHODS.BORDA;
  if (normalized === RANKED_TIE_BREAK_METHODS.RANDOM) return RANKED_TIE_BREAK_METHODS.RANDOM;
  return null;
}

function normalizeOptionIds(optionIds = []) {
  return Array.from(
    new Set(
      (optionIds || [])
        .map((optionId) => String(optionId || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeBallot(rankings = [], validOptionIds = new Set()) {
  if (!Array.isArray(rankings)) return [];
  const seen = new Set();
  const cleaned = [];
  rankings.forEach((optionId) => {
    const normalized = String(optionId || "").trim();
    if (!normalized || !validOptionIds.has(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    cleaned.push(normalized);
  });
  return cleaned;
}

function listRankedTieBreakerRounds(finalResults = {}) {
  const rounds = Array.isArray(finalResults?.tieBreakerRounds) ? finalResults.tieBreakerRounds : [];
  return rounds
    .map((round, index) => {
      const type = normalizeTieBreakMethod(round?.type || round?.method);
      if (!type) return null;
      const counts = {};
      Object.entries(round?.counts || {}).forEach(([optionId, value]) => {
        const normalizedOptionId = String(optionId || "").trim();
        if (!normalizedOptionId) return;
        counts[normalizedOptionId] = Number.isFinite(value) ? value : 0;
      });
      return {
        round: Number.isFinite(round?.round) ? Number(round.round) : index + 1,
        type,
        counts,
        exhausted: Number.isFinite(round?.exhausted) ? Number(round.exhausted) : 0,
        nonExhausted: Number.isFinite(round?.nonExhausted) ? Number(round.nonExhausted) : 0,
        sourceTiedIds: normalizeOptionIds(round?.sourceTiedIds || round?.randomPoolIds || []),
        winnerIds: normalizeOptionIds(round?.winnerIds || []),
        tiedIds: normalizeOptionIds(round?.tiedIds || []),
      };
    })
    .filter(Boolean);
}

function resolveRankedFinalRound(finalResults = {}) {
  const tieBreakerRounds = listRankedTieBreakerRounds(finalResults);
  if (tieBreakerRounds.length > 0) {
    return {
      source: "TIE_BREAK",
      round: tieBreakerRounds[tieBreakerRounds.length - 1],
    };
  }
  const rounds = Array.isArray(finalResults?.rounds) ? finalResults.rounds : [];
  if (rounds.length > 0) {
    return {
      source: "IRV",
      round: rounds[rounds.length - 1],
    };
  }
  return null;
}

function resolveRankedPriorTieBreakerRounds(finalResults = {}) {
  const tieBreakerRounds = listRankedTieBreakerRounds(finalResults);
  if (tieBreakerRounds.length <= 1) return [];
  return tieBreakerRounds.slice(0, -1).reverse();
}

function resolveUnresolvedTieIds(finalResults = {}) {
  const winnerIds = normalizeOptionIds(finalResults?.winnerIds || []);
  const tiedIds = normalizeOptionIds(finalResults?.tiedIds || []);
  if (winnerIds.length > 0) return [];
  return tiedIds.length > 1 ? tiedIds : [];
}

function computeBordaCounts({ optionIds = [], votes = [] } = {}) {
  const normalizedOptionIds = normalizeOptionIds(optionIds);
  const optionSet = new Set(normalizedOptionIds);
  const counts = Object.fromEntries(normalizedOptionIds.map((optionId) => [optionId, 0]));

  let nonExhausted = 0;
  let exhausted = 0;
  (votes || []).forEach((voteDoc) => {
    const ballot = normalizeBallot(voteDoc?.rankings || [], optionSet);
    if (ballot.length === 0) {
      exhausted += 1;
      return;
    }
    nonExhausted += 1;
    ballot.forEach((optionId, index) => {
      counts[optionId] += Math.max(normalizedOptionIds.length - index - 1, 0);
    });
  });

  return {
    counts,
    nonExhausted,
    exhausted,
  };
}

function resolveNextRoundNumber(finalResults = {}) {
  const irvRounds = Array.isArray(finalResults?.rounds) ? finalResults.rounds : [];
  const tieBreakerRounds = listRankedTieBreakerRounds(finalResults);
  const maxKnownRound = Math.max(
    0,
    ...irvRounds
      .map((round) => (Number.isFinite(round?.round) ? Number(round.round) : 0))
      .filter((value) => Number.isFinite(value)),
    ...tieBreakerRounds
      .map((round) => (Number.isFinite(round?.round) ? Number(round.round) : 0))
      .filter((value) => Number.isFinite(value))
  );
  return maxKnownRound + 1;
}

function resolveRandomIndex(randomInt, max) {
  if (!Number.isFinite(max) || max <= 1) return 0;
  if (typeof randomInt !== "function") {
    return Math.floor(Math.random() * max);
  }
  const candidate = Number(randomInt(max));
  if (!Number.isFinite(candidate)) return 0;
  if (candidate < 0) return 0;
  if (candidate >= max) return max - 1;
  return Math.floor(candidate);
}

function applyRankedChoiceTieBreaker({
  finalResults = {},
  optionIds = [],
  votes = [],
  method,
  randomInt,
} = {}) {
  const normalizedMethod = normalizeTieBreakMethod(method);
  if (!normalizedMethod) {
    throw new Error("Tie-break method must be BORDA or RANDOM.");
  }

  const unresolvedTieIds = resolveUnresolvedTieIds(finalResults);
  if (unresolvedTieIds.length < 2) {
    throw new Error("No unresolved tie available for tie-break.");
  }

  const tieBreakerRounds = listRankedTieBreakerRounds(finalResults);
  const lastTieRound = tieBreakerRounds[tieBreakerRounds.length - 1] || null;
  if (normalizedMethod === RANKED_TIE_BREAK_METHODS.BORDA && lastTieRound?.type === RANKED_TIE_BREAK_METHODS.BORDA) {
    throw new Error("Borda tie-break already applied. Select random winner.");
  }

  const nextRound = resolveNextRoundNumber(finalResults);
  if (normalizedMethod === RANKED_TIE_BREAK_METHODS.BORDA) {
    const borda = computeBordaCounts({ optionIds, votes });
    const scoreValues = Object.values(borda.counts);
    const winningScore = scoreValues.length > 0 ? Math.max(...scoreValues) : 0;
    const topIds = Object.keys(borda.counts).filter((optionId) => borda.counts[optionId] === winningScore);
    const winnerIds = topIds.length === 1 ? topIds : [];
    const tiedIds = topIds.length > 1 ? topIds : [];
    const round = {
      round: nextRound,
      type: RANKED_TIE_BREAK_METHODS.BORDA,
      counts: borda.counts,
      exhausted: borda.exhausted,
      nonExhausted: borda.nonExhausted,
      sourceTiedIds: unresolvedTieIds,
      winnerIds,
      tiedIds,
    };

    return {
      ...finalResults,
      voteType: "RANKED_CHOICE",
      tieBreakerRounds: [...tieBreakerRounds, round],
      winnerIds,
      tiedIds,
    };
  }

  const randomPoolIds = [...unresolvedTieIds];
  const winningIndex = resolveRandomIndex(randomInt, randomPoolIds.length);
  const winnerId = randomPoolIds[winningIndex];
  if (!winnerId) {
    throw new Error("Unable to choose a random winner.");
  }

  const counts = Object.fromEntries(
    randomPoolIds.map((optionId) => [optionId, optionId === winnerId ? 1 : 0])
  );
  const round = {
    round: nextRound,
    type: RANKED_TIE_BREAK_METHODS.RANDOM,
    counts,
    exhausted: 0,
    nonExhausted: 1,
    sourceTiedIds: randomPoolIds,
    winnerIds: [winnerId],
    tiedIds: [],
  };

  return {
    ...finalResults,
    voteType: "RANKED_CHOICE",
    tieBreakerRounds: [...tieBreakerRounds, round],
    winnerIds: [winnerId],
    tiedIds: [],
  };
}

module.exports = {
  RANKED_TIE_BREAK_METHODS,
  normalizeTieBreakMethod,
  listRankedTieBreakerRounds,
  resolveRankedFinalRound,
  resolveRankedPriorTieBreakerRounds,
  applyRankedChoiceTieBreaker,
};
