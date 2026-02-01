const buildPollUrl = (pollId) => (pollId ? `https://quest-scheduler.app/scheduler/${pollId}` : "https://quest-scheduler.app");

module.exports = (event, recipient) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const changeSummary = event?.payload?.changeSummary || "Time slots were updated";
  const pollId = event?.resource?.id || "";
  const pollUrl = buildPollUrl(pollId);
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = `Poll slots updated: ${pollTitle}`;
  const text = `Hi ${recipientName},\n\n${changeSummary} for "${pollTitle}".\nReview the poll: ${pollUrl}\n\nThanks!`;
  const html = `<p>Hi ${recipientName},</p><p>${changeSummary} for "${pollTitle}".</p><p><a href="${pollUrl}">Review the poll</a></p><p>Thanks!</p>`;

  return { subject, text, html };
};
