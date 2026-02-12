const {
  onDocumentUpdated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { queueNotificationEvent } = require("../notifications/write-event");
const {
  hasSubmittedVoteForPoll,
  hasVotePayloadChanged,
} = require("../basic-polls/vote-submission");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function snapshotExists(snapshot) {
  if (!snapshot) return false;
  if (typeof snapshot.exists === "function") return snapshot.exists();
  return snapshot.exists === true;
}

function asMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? null : date.getTime();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function extractDeadlineMillis(pollData) {
  const settingsDeadline = pollData?.settings?.deadlineAt;
  const fallbackDeadline = pollData?.deadlineAt;
  return asMillis(settingsDeadline || fallbackDeadline);
}

function toUserIdList(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => (value === null || value === undefined ? "" : String(value).trim()))
        .filter(Boolean)
    )
  );
}

async function resolveRecipientsForGroup(groupId) {
  const groupSnap = await db.collection("questingGroups").doc(groupId).get();
  if (!groupSnap.exists) return [];
  const groupData = groupSnap.data() || {};
  return toUserIdList([...(groupData.memberIds || []), groupData.creatorId]);
}

async function resolveRecipientsForScheduler(schedulerId) {
  const schedulerSnap = await db.collection("schedulers").doc(schedulerId).get();
  if (!schedulerSnap.exists) return [];

  const schedulerData = schedulerSnap.data() || {};
  const recipientIds = new Set(
    toUserIdList([...(schedulerData.participantIds || []), schedulerData.creatorId])
  );

  if (schedulerData.questingGroupId) {
    const groupSnap = await db.collection("questingGroups").doc(String(schedulerData.questingGroupId)).get();
    if (groupSnap.exists) {
      const groupData = groupSnap.data() || {};
      toUserIdList([...(groupData.memberIds || []), groupData.creatorId]).forEach((uid) => {
        recipientIds.add(uid);
      });
    }
  }

  return Array.from(recipientIds);
}

function buildDeadlineLabel(deadlineMillis) {
  if (!deadlineMillis) {
    return "The deadline was removed.";
  }
  return `The deadline is now ${new Date(deadlineMillis).toISOString()}.`;
}

async function emitVoteSubmittedEvent({ parentType, parentId, pollId, voterId, voteData }) {
  const pollRef = db
    .collection(parentType === "group" ? "questingGroups" : "schedulers")
    .doc(parentId)
    .collection("basicPolls")
    .doc(pollId);

  const pollSnap = await pollRef.get();
  if (!pollSnap.exists) return;

  const pollData = pollSnap.data() || {};
  const recipients =
    parentType === "group"
      ? await resolveRecipientsForGroup(parentId)
      : await resolveRecipientsForScheduler(parentId);

  await queueNotificationEvent({
    db,
    eventType: "BASIC_POLL_VOTE_SUBMITTED",
    resource: {
      type: "basicPoll",
      id: pollId,
      title: pollData.title || "Basic poll",
    },
    actor: {
      uid: voterId,
      displayName: "Someone",
    },
    payload: {
      parentType,
      parentId,
      basicPollId: pollId,
      basicPollTitle: pollData.title || "Basic poll",
      source: voteData?.source || "web",
    },
    recipients: {
      userIds: recipients,
    },
    source: voteData?.source || "web",
    createdBy: voterId || "system",
  });
}

async function emitDeadlineChangedEvent({ parentType, parentId, pollId, pollData, deadlineMillis }) {
  const recipients =
    parentType === "group"
      ? await resolveRecipientsForGroup(parentId)
      : await resolveRecipientsForScheduler(parentId);

  await queueNotificationEvent({
    db,
    eventType: "BASIC_POLL_DEADLINE_CHANGED",
    resource: {
      type: "basicPoll",
      id: pollId,
      title: pollData.title || "Basic poll",
    },
    actor: {
      uid: pollData?.updatedBy || pollData?.creatorId || "system",
      displayName: "Scheduler",
    },
    payload: {
      parentType,
      parentId,
      basicPollId: pollId,
      basicPollTitle: pollData.title || "Basic poll",
      deadlineLabel: buildDeadlineLabel(deadlineMillis),
      deadlineAt: deadlineMillis ? new Date(deadlineMillis).toISOString() : null,
    },
    recipients: {
      userIds: recipients,
    },
    source: "server",
    createdBy: pollData?.updatedBy || pollData?.creatorId || "system",
  });
}

exports.onGroupBasicPollVoteWritten = onDocumentWritten(
  "questingGroups/{groupId}/basicPolls/{pollId}/votes/{userId}",
  async (event) => {
    const after = event.data?.after;
    if (!snapshotExists(after)) return;

    const before = event.data?.before;
    const afterData = after.data() || {};
    const beforeData = snapshotExists(before) ? before.data() || {} : null;

    const pollRef = db
      .collection("questingGroups")
      .doc(event.params.groupId)
      .collection("basicPolls")
      .doc(event.params.pollId);
    const pollSnap = await pollRef.get();
    if (!pollSnap.exists) return;
    const pollData = pollSnap.data() || {};

    if (!hasSubmittedVoteForPoll(pollData, afterData)) return;
    if (
      beforeData &&
      hasSubmittedVoteForPoll(pollData, beforeData) &&
      !hasVotePayloadChanged(beforeData, afterData)
    ) {
      return;
    }

    try {
      await emitVoteSubmittedEvent({
        parentType: "group",
        parentId: event.params.groupId,
        pollId: event.params.pollId,
        voterId: event.params.userId,
        voteData: afterData,
      });
    } catch (error) {
      logger.error("Failed to emit group basic poll vote notification", {
        groupId: event.params.groupId,
        pollId: event.params.pollId,
        userId: event.params.userId,
        error: error?.message,
      });
    }
  }
);

exports.onSchedulerBasicPollVoteWritten = onDocumentWritten(
  "schedulers/{schedulerId}/basicPolls/{pollId}/votes/{userId}",
  async (event) => {
    const after = event.data?.after;
    if (!snapshotExists(after)) return;

    const before = event.data?.before;
    const afterData = after.data() || {};
    const beforeData = snapshotExists(before) ? before.data() || {} : null;

    const pollRef = db
      .collection("schedulers")
      .doc(event.params.schedulerId)
      .collection("basicPolls")
      .doc(event.params.pollId);
    const pollSnap = await pollRef.get();
    if (!pollSnap.exists) return;
    const pollData = pollSnap.data() || {};

    if (!hasSubmittedVoteForPoll(pollData, afterData)) return;
    if (
      beforeData &&
      hasSubmittedVoteForPoll(pollData, beforeData) &&
      !hasVotePayloadChanged(beforeData, afterData)
    ) {
      return;
    }

    try {
      await emitVoteSubmittedEvent({
        parentType: "scheduler",
        parentId: event.params.schedulerId,
        pollId: event.params.pollId,
        voterId: event.params.userId,
        voteData: afterData,
      });
    } catch (error) {
      logger.error("Failed to emit scheduler basic poll vote notification", {
        schedulerId: event.params.schedulerId,
        pollId: event.params.pollId,
        userId: event.params.userId,
        error: error?.message,
      });
    }
  }
);

exports.onGroupBasicPollDeadlineUpdated = onDocumentUpdated(
  "questingGroups/{groupId}/basicPolls/{pollId}",
  async (event) => {
    const beforeData = event.data?.before?.data() || {};
    const afterData = event.data?.after?.data() || {};

    const beforeDeadline = extractDeadlineMillis(beforeData);
    const afterDeadline = extractDeadlineMillis(afterData);

    if (beforeDeadline === afterDeadline) return;

    try {
      await emitDeadlineChangedEvent({
        parentType: "group",
        parentId: event.params.groupId,
        pollId: event.params.pollId,
        pollData: afterData,
        deadlineMillis: afterDeadline,
      });
    } catch (error) {
      logger.error("Failed to emit group basic poll deadline change notification", {
        groupId: event.params.groupId,
        pollId: event.params.pollId,
        error: error?.message,
      });
    }
  }
);

exports.onSchedulerBasicPollDeadlineUpdated = onDocumentUpdated(
  "schedulers/{schedulerId}/basicPolls/{pollId}",
  async (event) => {
    const beforeData = event.data?.before?.data() || {};
    const afterData = event.data?.after?.data() || {};

    const beforeDeadline = extractDeadlineMillis(beforeData);
    const afterDeadline = extractDeadlineMillis(afterData);

    if (beforeDeadline === afterDeadline) return;

    try {
      await emitDeadlineChangedEvent({
        parentType: "scheduler",
        parentId: event.params.schedulerId,
        pollId: event.params.pollId,
        pollData: afterData,
        deadlineMillis: afterDeadline,
      });
    } catch (error) {
      logger.error("Failed to emit scheduler basic poll deadline change notification", {
        schedulerId: event.params.schedulerId,
        pollId: event.params.pollId,
        error: error?.message,
      });
    }
  }
);

exports.__test__ = {
  extractDeadlineMillis,
  hasSubmittedVote: hasSubmittedVoteForPoll,
  hasVotePayloadChanged,
  buildDeadlineLabel,
};
