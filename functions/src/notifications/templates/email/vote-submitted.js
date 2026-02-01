const buildPollUrl = (pollId) => (pollId ? `https://quest-scheduler.app/scheduler/${pollId}` : "https://quest-scheduler.app");

module.exports = (event, recipient) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const voterName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const pollId = event?.resource?.id || "";
  const pollUrl = buildPollUrl(pollId);
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = `New vote submitted: ${pollTitle}`;
  const text = `Hi ${recipientName},\n\n${voterName} updated votes for "${pollTitle}".\nView the poll: ${pollUrl}\n\nThanks!`;
  const html = `<p>Hi ${recipientName},</p><p><strong>${voterName}</strong> updated votes for "${pollTitle}".</p><p><a href="${pollUrl}">View the poll</a></p><p>Thanks!</p>`;

  return { subject, text, html };
};
