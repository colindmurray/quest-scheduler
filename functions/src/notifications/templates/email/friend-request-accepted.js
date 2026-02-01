module.exports = (event, recipient) => {
  const friendName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = "Friend request accepted";
  const text = `Hi ${recipientName},\n\n${friendName} accepted your friend request.\nVisit your friends list: https://quest-scheduler.app/friends`;
  const html = `<p>Hi ${recipientName},</p><p><strong>${friendName}</strong> accepted your friend request.</p><p><a href="https://quest-scheduler.app/friends">View your friends</a></p>`;

  return { subject, text, html };
};
