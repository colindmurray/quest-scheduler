const buildPollUrl = (pollId) => (pollId ? `https://quest-scheduler.app/scheduler/${pollId}` : "https://quest-scheduler.app");

module.exports = (event, recipient) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const winningDate = event?.payload?.winningDate || "a winning time";
  const pollId = event?.resource?.id || "";
  const pollUrl = buildPollUrl(pollId);
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = `Session poll finalized: ${pollTitle}`;
  const text = `Hi ${recipientName},\n\n"${pollTitle}" has been finalized for ${winningDate}.\nView the poll: ${pollUrl}\n\nThanks!`;
  const html = `<p>Hi ${recipientName},</p><p>"${pollTitle}" has been finalized for <strong>${winningDate}</strong>.</p><p><a href="${pollUrl}">View the poll</a></p><p>Thanks!</p>`;

  return { subject, text, html };
};
