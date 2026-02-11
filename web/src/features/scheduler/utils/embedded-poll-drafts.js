function getOrderValue(poll) {
  return Number.isFinite(poll?.order) ? poll.order : 0;
}

function normalizeDraftOrders(polls = []) {
  return polls.map((poll, index) => ({
    ...poll,
    order: index,
  }));
}

function moveItem(items = [], fromIndex, toIndex) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function upsertEmbeddedPollDraft(drafts = [], pollPayload = {}, options = {}) {
  const { pollId = null, creatorId = null, generateId = () => crypto.randomUUID() } = options;
  const source = Array.isArray(drafts) ? drafts : [];

  if (pollId) {
    return source.map((poll) => {
      if (poll.id !== pollId) return poll;
      return {
        ...poll,
        ...pollPayload,
        id: pollId,
        order: getOrderValue(poll),
        creatorId: poll.creatorId ?? creatorId ?? null,
      };
    });
  }

  const currentMaxOrder = source.reduce((maxOrder, poll) => Math.max(maxOrder, getOrderValue(poll)), -1);
  return [
    ...source,
    {
      ...pollPayload,
      id: generateId(),
      order: currentMaxOrder + 1,
      creatorId: creatorId ?? null,
    },
  ];
}

export function removeEmbeddedPollDraft(drafts = [], pollId) {
  if (!pollId) return Array.isArray(drafts) ? drafts : [];
  const remaining = (Array.isArray(drafts) ? drafts : []).filter((poll) => poll.id !== pollId);
  return normalizeDraftOrders(remaining);
}

export function reorderEmbeddedPollDrafts(drafts = [], activeId, overId) {
  const source = Array.isArray(drafts) ? drafts : [];
  if (!activeId || !overId || activeId === overId) return source;
  const oldIndex = source.findIndex((poll) => poll.id === activeId);
  const newIndex = source.findIndex((poll) => poll.id === overId);
  if (oldIndex < 0 || newIndex < 0) return source;
  return normalizeDraftOrders(moveItem(source, oldIndex, newIndex));
}

export function toEmbeddedPollCreatePayloads(drafts = [], creatorId = null) {
  const source = Array.isArray(drafts) ? drafts : [];
  return source
    .slice()
    .sort((left, right) => getOrderValue(left) - getOrderValue(right))
    .map((poll, index) => {
      const { id: _draftId, ...rest } = poll;
      return {
        ...rest,
        order: index,
        creatorId: creatorId ?? poll.creatorId ?? null,
      };
    });
}
