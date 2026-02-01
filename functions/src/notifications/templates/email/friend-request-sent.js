const buildRequestUrl = (requestId) =>
  requestId
    ? `https://quest-scheduler.app/friends?request=${requestId}`
    : "https://quest-scheduler.app/friends";

module.exports = (event, recipient) => {
  const senderName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const requestId = event?.payload?.requestId || event?.resource?.id || "";
  const requestUrl = buildRequestUrl(requestId);
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = `${senderName} sent you a friend request`;
  const text = `Hi ${recipientName},\n\n${senderName} wants to add you as a friend on Quest Scheduler.\nReview the request: ${requestUrl}\n\nIf you don't have an account yet, you'll be prompted to create one first.`;
  const html = `<p>Hi ${recipientName},</p><p><strong>${senderName}</strong> wants to add you as a friend on Quest Scheduler.</p><p><a href="${requestUrl}">Review the request</a></p><p>If you don't have an account yet, you'll be prompted to create one first.</p>`;

  return { subject, text, html };
};
