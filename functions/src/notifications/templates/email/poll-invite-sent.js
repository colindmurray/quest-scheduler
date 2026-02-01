const buildPollUrl = (pollId) => (pollId ? `https://quest-scheduler.app/scheduler/${pollId}` : "https://quest-scheduler.app");

module.exports = (event, recipient) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const inviterName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const pollId = event?.resource?.id || event?.payload?.pollId || "";
  const pollUrl = buildPollUrl(pollId);
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = `You're invited to vote on "${pollTitle}"`;
  const text = `Hi ${recipientName},\n\n${inviterName} invited you to join "${pollTitle}".\nVote here: ${pollUrl}\n\nIf you don't want to participate, you can ignore this email.`;
  const html = `<p>Hi ${recipientName},</p><p><strong>${inviterName}</strong> invited you to join "${pollTitle}".</p><p><a href="${pollUrl}">Vote on the poll</a></p><p>If you don't want to participate, you can ignore this email.</p>`;

  return { subject, text, html };
};
