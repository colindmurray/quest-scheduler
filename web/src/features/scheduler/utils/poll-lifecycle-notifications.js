const FINALIZATION_EVENT_TYPES = new Set([
  "POLL_FINALIZED",
  "POLL_REOPENED",
  "POLL_CANCELLED",
  "POLL_DELETED",
]);

function resolveFinalizationEnabled(questingGroupDiscord) {
  // Backend defaults to enabled when unset (see functions/src/discord/config.js).
  const value = questingGroupDiscord?.notifications?.finalizationEvents;
  return value === undefined ? true : Boolean(value);
}

export function shouldEmitPollLifecycleEvent({
  eventType,
  recipients,
  questingGroupDiscord,
}) {
  const hasRecipients = Boolean(
    (recipients?.userIds && recipients.userIds.length) ||
      (recipients?.emails && recipients.emails.length) ||
      (recipients?.pendingEmails && recipients.pendingEmails.length)
  );

  if (hasRecipients) return true;

  // Discord lifecycle notifications should still fire even when there are no app recipients,
  // because Discord is a group broadcast not tied to userIds/emails.
  const isDiscordLinked = Boolean(
    questingGroupDiscord?.channelId && questingGroupDiscord?.guildId
  );
  if (!isDiscordLinked) return false;

  if (!FINALIZATION_EVENT_TYPES.has(eventType)) return false;

  return resolveFinalizationEnabled(questingGroupDiscord);
}

