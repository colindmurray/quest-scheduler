const { NOTIFICATION_EVENTS } = require("./constants");

const AUTO_CLEAR_RULES = Object.freeze({
  [NOTIFICATION_EVENTS.POLL_FINALIZED]: {
    resource: "poll",
    scope: "recipients",
    types: [
      NOTIFICATION_EVENTS.POLL_INVITE_SENT,
      NOTIFICATION_EVENTS.VOTE_REMINDER,
      NOTIFICATION_EVENTS.SLOT_CHANGED,
      NOTIFICATION_EVENTS.POLL_REOPENED,
      NOTIFICATION_EVENTS.POLL_READY_TO_FINALIZE,
    ],
  },
  [NOTIFICATION_EVENTS.POLL_REOPENED]: {
    resource: "poll",
    scope: "recipients",
    types: [NOTIFICATION_EVENTS.POLL_FINALIZED],
  },
  [NOTIFICATION_EVENTS.POLL_CANCELLED]: {
    resource: "poll",
    scope: "recipients",
    types: [
      NOTIFICATION_EVENTS.POLL_INVITE_SENT,
      NOTIFICATION_EVENTS.VOTE_REMINDER,
      NOTIFICATION_EVENTS.SLOT_CHANGED,
      NOTIFICATION_EVENTS.POLL_FINALIZED,
      NOTIFICATION_EVENTS.POLL_REOPENED,
      NOTIFICATION_EVENTS.POLL_READY_TO_FINALIZE,
    ],
  },
  [NOTIFICATION_EVENTS.VOTE_SUBMITTED]: {
    resource: "poll",
    scope: "actor",
    types: [NOTIFICATION_EVENTS.VOTE_REMINDER],
  },
  [NOTIFICATION_EVENTS.POLL_INVITE_ACCEPTED]: {
    resource: "poll",
    scope: "actor",
    types: [NOTIFICATION_EVENTS.POLL_INVITE_SENT],
  },
  [NOTIFICATION_EVENTS.POLL_INVITE_DECLINED]: {
    resource: "poll",
    scope: "actor",
    types: [NOTIFICATION_EVENTS.POLL_INVITE_SENT],
  },
  [NOTIFICATION_EVENTS.POLL_INVITE_REVOKED]: {
    resource: "poll",
    scope: "recipients",
    types: [NOTIFICATION_EVENTS.POLL_INVITE_SENT],
  },
  [NOTIFICATION_EVENTS.FRIEND_REQUEST_ACCEPTED]: {
    resource: "friend",
    scope: "actor",
    types: [NOTIFICATION_EVENTS.FRIEND_REQUEST_SENT],
  },
  [NOTIFICATION_EVENTS.FRIEND_REQUEST_DECLINED]: {
    resource: "friend",
    scope: "actor",
    types: [NOTIFICATION_EVENTS.FRIEND_REQUEST_SENT],
  },
  [NOTIFICATION_EVENTS.GROUP_INVITE_ACCEPTED]: {
    resource: "group",
    scope: "actor",
    types: [NOTIFICATION_EVENTS.GROUP_INVITE_SENT],
  },
  [NOTIFICATION_EVENTS.GROUP_INVITE_DECLINED]: {
    resource: "group",
    scope: "actor",
    types: [NOTIFICATION_EVENTS.GROUP_INVITE_SENT],
  },
  [NOTIFICATION_EVENTS.GROUP_DELETED]: {
    resource: "group",
    scope: "recipients",
    types: [NOTIFICATION_EVENTS.GROUP_INVITE_SENT, NOTIFICATION_EVENTS.GROUP_INVITE_ACCEPTED],
  },
});

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const resolveTargetUserIds = (rule, event, recipients) => {
  if (rule.scope === "actor") {
    return event.actor?.uid ? [event.actor.uid] : [];
  }
  return recipients.userIds || [];
};

const applyAutoClear = async ({ db, eventType, event, recipients }) => {
  const rule = AUTO_CLEAR_RULES[eventType];
  if (!rule) return;
  if (!event.resource?.id) return;

  const targetUserIds = resolveTargetUserIds(rule, event, recipients);
  if (!targetUserIds.length) return;

  for (const userId of targetUserIds) {
    const query = db
      .collection("users")
      .doc(userId)
      .collection("notifications")
      .where("resource.id", "==", event.resource.id);

    const snapshot = await query.get();
    const refs = snapshot.docs
      .filter((doc) => rule.types.includes(doc.data()?.type))
      .map((doc) => doc.ref);
    const batches = chunk(refs, 500);

    for (const batchRefs of batches) {
      const batch = db.batch();
      batchRefs.forEach((ref) => {
        batch.update(ref, { dismissed: true, autoCleared: true });
      });
      await batch.commit();
    }
  }
};

module.exports = {
  AUTO_CLEAR_RULES,
  applyAutoClear,
};
