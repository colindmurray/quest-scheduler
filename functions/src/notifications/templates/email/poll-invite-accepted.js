const buildPollUrl = (pollId) => (pollId ? `https://quest-scheduler.app/scheduler/${pollId}` : "https://quest-scheduler.app");

module.exports = (event, recipient) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const inviteeName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const pollId = event?.resource?.id || event?.payload?.pollId || "";
  const pollUrl = buildPollUrl(pollId);
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = `Invite accepted for "${pollTitle}"`;
  const text = `Hi ${recipientName},\n\n${inviteeName} accepted your invite to join "${pollTitle}".\nView the poll: ${pollUrl}\n\nThanks!`;
  const html = `<p>Hi ${recipientName},</p><p><strong>${inviteeName}</strong> accepted your invite to join "${pollTitle}".</p><p><a href="${pollUrl}">View the poll</a></p><p>Thanks!</p>`;

  return { subject, text, html };
};
