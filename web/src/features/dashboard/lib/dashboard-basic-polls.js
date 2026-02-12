import { resolveBasicPollStatus, BASIC_POLL_STATUSES } from "../../../lib/basic-polls/constants";
import { coerceDate } from "../../../lib/time";

function lookupValue(lookup, key) {
  if (!lookup || !key) return null;
  if (lookup instanceof Map) return lookup.get(key) || null;
  return lookup[key] || null;
}

export function resolvePollDeadline(poll = {}) {
  return coerceDate(poll?.settings?.deadlineAt || poll?.deadlineAt || null);
}

export function buildBasicPollArchiveKey(poll) {
  if (!poll?.parentType || !poll?.parentId || !poll?.pollId) return null;
  return `basic:${poll.parentType}:${poll.parentId}:${poll.pollId}`;
}

export function toCardUser(profile = {}, userId) {
  return {
    id: userId,
    email: profile?.email || `user:${userId}`,
    avatar: profile?.photoURL || null,
    displayName: profile?.displayName || userId,
  };
}

export function buildUsersFromIds(userIds = [], participantProfilesById = {}) {
  return (userIds || []).map((userId) => toCardUser(participantProfilesById[userId] || {}, userId));
}

export function canManageGroupPoll(group, userId) {
  if (!group || !userId) return false;
  return (
    group.creatorId === userId ||
    (group.memberManaged === true &&
      Array.isArray(group.memberIds) &&
      group.memberIds.includes(userId)) ||
    (group.memberPermissionsEnabled === true &&
      group.memberPermissions?.[userId]?.isManager === true)
  );
}

export function deriveDashboardBasicPollItems({
  basicPollSourceItems = [],
  selectedGroupFilterId = null,
  archivedPolls = [],
  schedulerMetaById = new Map(),
  groupsById = {},
  groupNameById = new Map(),
  getGroupColor = () => null,
  userId = null,
  nowMs = Date.now(),
}) {
  return (basicPollSourceItems || [])
    .map((poll) => {
      const schedulerMeta =
        poll.parentType === "scheduler" ? lookupValue(schedulerMetaById, poll.parentId) : null;
      const group = poll.parentType === "group" ? lookupValue(groupsById, poll.parentId) : null;
      if (selectedGroupFilterId) {
        if (poll.parentType === "group" && poll.parentId !== selectedGroupFilterId) return null;
        if (
          poll.parentType === "scheduler" &&
          schedulerMeta?.questingGroupId !== selectedGroupFilterId
        ) {
          return null;
        }
      }

      const archiveKey = buildBasicPollArchiveKey(poll);
      const deadlineAt = resolvePollDeadline(poll);
      const isDeadlineOpen = !deadlineAt || deadlineAt.getTime() > nowMs;
      const pollStatus = resolveBasicPollStatus(poll?.status);
      const isOpen =
        pollStatus === BASIC_POLL_STATUSES.OPEN &&
        isDeadlineOpen &&
        (poll.parentType !== "scheduler" || schedulerMeta?.status !== "CANCELLED");
      const isArchived = Boolean(archiveKey && archivedPolls.includes(archiveKey));
      const state = isArchived
        ? "ARCHIVED"
        : isOpen
          ? poll.hasVoted
            ? "OPEN_VOTED"
            : "NEEDS_VOTE"
          : "CLOSED";
      const eligibleIds =
        poll.parentType === "group"
          ? (group?.memberIds || []).filter(Boolean)
          : (schedulerMeta?.participantIds || []).filter(Boolean);
      const voterIds = Array.from(
        new Set((Array.isArray(poll.voterIds) ? poll.voterIds : []).filter(Boolean))
      );
      const votedIdSet = new Set(voterIds);
      const pendingIds = eligibleIds.filter((id) => !votedIdSet.has(id));
      const canManage =
        poll.parentType === "group"
          ? canManageGroupPoll(group, userId)
          : Boolean(schedulerMeta?.creatorId && userId && schedulerMeta.creatorId === userId);

      return {
        ...poll,
        archiveKey,
        isArchived,
        state,
        isOpen,
        deadlineAt,
        pollStatus,
        contextLabel:
          poll.parentType === "group"
            ? `in ${lookupValue(groupNameById, poll.parentId) || "Questing group"}`
            : `in ${schedulerMeta?.title || "Session poll"}`,
        accentColor:
          poll.parentType === "group"
            ? getGroupColor(poll.parentId)
            : schedulerMeta?.questingGroupId
              ? getGroupColor(schedulerMeta.questingGroupId)
              : null,
        voteLink:
          poll.parentType === "group"
            ? `/groups/${poll.parentId}/polls/${poll.pollId}`
            : `/scheduler/${poll.parentId}?poll=${poll.pollId}`,
        eligibleIds,
        voterIds,
        pendingIds,
        eligibleCount: eligibleIds.length,
        votedCount: voterIds.length,
        canManage,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const stateOrder = {
        NEEDS_VOTE: 0,
        OPEN_VOTED: 1,
        CLOSED: 2,
        ARCHIVED: 3,
      };
      const leftState = stateOrder[left.state] ?? 99;
      const rightState = stateOrder[right.state] ?? 99;
      if (leftState !== rightState) return leftState - rightState;

      const leftDeadline = left.deadlineAt ? left.deadlineAt.getTime() : Number.MAX_SAFE_INTEGER;
      const rightDeadline = right.deadlineAt ? right.deadlineAt.getTime() : Number.MAX_SAFE_INTEGER;
      if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;

      return String(left.title || "").localeCompare(String(right.title || ""));
    });
}

export function bucketDashboardBasicPolls(items = []) {
  return {
    "needs-vote": items.filter((poll) => poll.state === "NEEDS_VOTE"),
    "open-voted": items.filter((poll) => poll.state === "OPEN_VOTED"),
    closed: items.filter((poll) => poll.state === "CLOSED"),
    archived: items.filter((poll) => poll.state === "ARCHIVED"),
  };
}
