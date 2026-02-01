module.exports = (event, recipient) => {
  const friendName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = "Friend request declined";
  const text = `Hi ${recipientName},\n\n${friendName} declined your friend request.`;
  const html = `<p>Hi ${recipientName},</p><p><strong>${friendName}</strong> declined your friend request.</p>`;

  return { subject, text, html };
};
