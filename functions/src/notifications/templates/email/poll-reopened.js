const buildPollUrl = (pollId) => (pollId ? `https://quest-scheduler.app/scheduler/${pollId}` : "https://quest-scheduler.app");

module.exports = (event, recipient) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const pollId = event?.resource?.id || "";
  const pollUrl = buildPollUrl(pollId);
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = `Poll reopened: ${pollTitle}`;
  const text = `Hi ${recipientName},\n\nVoting reopened for "${pollTitle}".\nSubmit your availability here: ${pollUrl}\n\nThanks!`;
  const html = `<p>Hi ${recipientName},</p><p>Voting reopened for "${pollTitle}".</p><p><a href="${pollUrl}">Submit your availability</a></p><p>Thanks!</p>`;

  return { subject, text, html };
};
