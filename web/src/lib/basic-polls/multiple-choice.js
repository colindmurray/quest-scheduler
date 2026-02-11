function normalizeOptionIds(voteDoc, validOptionIds = new Set()) {
  if (!Array.isArray(voteDoc?.optionIds)) return [];
  return voteDoc.optionIds.filter(
    (optionId) => typeof optionId === "string" && optionId.trim() && validOptionIds.has(optionId)
  );
}

export function computeMultipleChoiceTallies({
  options = [],
  votes = [],
  allowWriteIn = false,
} = {}) {
  const normalizedOptions = (options || []).map((option, index) => ({
    id: option?.id || `option-${index}`,
    label: option?.label || `Option ${index + 1}`,
    order: Number.isFinite(option?.order) ? option.order : index,
  }));
  const optionIdSet = new Set(normalizedOptions.map((option) => option.id));

  const rowsByKey = new Map(
    normalizedOptions.map((option) => [
      option.id,
      {
        key: option.id,
        label: option.label,
        order: option.order,
        count: 0,
        voterIds: [],
      },
    ])
  );

  (votes || []).forEach((voteDoc, voteIndex) => {
    const voterId = voteDoc?.id || `vote-${voteIndex}`;
    const optionIds = normalizeOptionIds(voteDoc, optionIdSet);
    optionIds.forEach((optionId) => {
      const row = rowsByKey.get(optionId);
      if (!row) return;
      row.count += 1;
      row.voterIds.push(voterId);
    });

    if (!allowWriteIn) return;
    const trimmed = String(voteDoc?.otherText || "").trim();
    if (!trimmed) return;
    const normalizedKey = `write-in:${trimmed.toLowerCase()}`;
    if (!rowsByKey.has(normalizedKey)) {
      rowsByKey.set(normalizedKey, {
        key: normalizedKey,
        label: trimmed,
        order: Number.MAX_SAFE_INTEGER + rowsByKey.size,
        count: 0,
        voterIds: [],
      });
    }
    const row = rowsByKey.get(normalizedKey);
    row.count += 1;
    row.voterIds.push(voterId);
  });

  const totalVoters = (votes || []).length;
  const rows = Array.from(rowsByKey.values()).map((row) => ({
    ...row,
    percentage: totalVoters > 0 ? Math.round((row.count / totalVoters) * 100) : 0,
  }));

  rows.sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    if (left.order !== right.order) return left.order - right.order;
    return left.label.localeCompare(right.label);
  });

  return {
    rows,
    totalVoters,
  };
}
