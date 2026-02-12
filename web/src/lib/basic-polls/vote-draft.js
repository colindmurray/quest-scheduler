function normalizeIdList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function resolveSelectionLimit(maxSelections) {
  if (!Number.isFinite(maxSelections)) return null;
  return Math.max(1, Number(maxSelections));
}

export function setMultipleChoiceOptionOnVoteDraft(draft = {}, optionId, options = {}) {
  if (!optionId) return { draft, limitReached: false };

  const allowMultiple = options.allowMultiple === true;
  const selectionLimit = resolveSelectionLimit(options.maxSelections);
  const selected = normalizeIdList(draft?.optionIds);
  const alreadySelected = selected.includes(optionId);

  if (!allowMultiple) {
    const optionIds = alreadySelected ? [] : [optionId];
    if (optionIds.length === selected.length && optionIds.every((id, index) => id === selected[index])) {
      return { draft, limitReached: false };
    }
    return {
      draft: {
        ...draft,
        optionIds,
      },
      limitReached: false,
    };
  }

  if (alreadySelected) {
    return {
      draft: {
        ...draft,
        optionIds: selected.filter((entry) => entry !== optionId),
      },
      limitReached: false,
    };
  }

  if (selectionLimit && selected.length >= selectionLimit) {
    return { draft, limitReached: true };
  }

  return {
    draft: {
      ...draft,
      optionIds: [...selected, optionId],
    },
    limitReached: false,
  };
}

export function setOtherTextOnVoteDraft(draft = {}, otherText) {
  if ((draft?.otherText || "") === otherText) return draft;
  return {
    ...draft,
    otherText,
  };
}

export function addRankedOptionToVoteDraft(draft = {}, optionId) {
  if (!optionId) return draft;
  const rankings = normalizeIdList(draft?.rankings);
  if (rankings.includes(optionId)) return draft;
  return {
    ...draft,
    rankings: [...rankings, optionId],
  };
}

export function moveRankedOptionInVoteDraft(draft = {}, optionId, direction) {
  if (!optionId) return draft;
  const rankings = normalizeIdList(draft?.rankings);
  const index = rankings.indexOf(optionId);
  if (index < 0) return draft;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= rankings.length) return draft;
  const nextRankings = [...rankings];
  const [moved] = nextRankings.splice(index, 1);
  nextRankings.splice(nextIndex, 0, moved);
  return {
    ...draft,
    rankings: nextRankings,
  };
}

export function removeRankedOptionFromVoteDraft(draft = {}, optionId) {
  if (!optionId) return draft;
  const rankings = normalizeIdList(draft?.rankings);
  if (!rankings.includes(optionId)) return draft;
  return {
    ...draft,
    rankings: rankings.filter((entry) => entry !== optionId),
  };
}
