const APP_BASE_URL = "https://quest-scheduler.app";

const normalizeActionPath = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const resolveBasicPollTitle = (event) =>
  event?.payload?.basicPollTitle ||
  event?.payload?.pollTitle ||
  event?.resource?.title ||
  "Basic Poll";

const resolveBasicPollActionUrl = (event) => {
  const payload = event?.payload || {};
  const explicitActionUrl = normalizeActionPath(payload.actionUrl);
  if (explicitActionUrl) return explicitActionUrl;

  const pollId = event?.resource?.id || payload.basicPollId || "";
  const parentType = payload.parentType || "";
  const parentId = payload.parentId || "";

  if (parentType === "group" && parentId && pollId) {
    return `/groups/${parentId}/polls/${pollId}`;
  }
  if (parentType === "scheduler" && parentId && pollId) {
    return `/scheduler/${parentId}?poll=${pollId}`;
  }
  if (payload.schedulerId && pollId) {
    return `/scheduler/${payload.schedulerId}?poll=${pollId}`;
  }
  if (payload.groupId && pollId) {
    return `/groups/${payload.groupId}/polls/${pollId}`;
  }
  return "/dashboard";
};

const resolveBasicPollWebUrl = (event) => {
  const actionUrl = resolveBasicPollActionUrl(event);
  if (actionUrl.startsWith("http://") || actionUrl.startsWith("https://")) {
    return actionUrl;
  }
  return `${APP_BASE_URL}${actionUrl}`;
};

const resolveRecipientName = (recipient) =>
  recipient?.displayName || recipient?.email || "there";

module.exports = {
  resolveBasicPollTitle,
  resolveBasicPollActionUrl,
  resolveBasicPollWebUrl,
  resolveRecipientName,
};
