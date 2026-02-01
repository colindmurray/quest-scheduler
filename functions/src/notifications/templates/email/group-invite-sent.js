const groupInviteUrl = "https://quest-scheduler.app/friends?tab=groups";

module.exports = (event, recipient) => {
  const groupName = event?.payload?.groupName || event?.resource?.title || "Questing Group";
  const inviterName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = `You've been invited to join "${groupName}"`;
  const text = `Hi ${recipientName},\n\n${inviterName} invited you to join the questing group "${groupName}".\nView the invite: ${groupInviteUrl}\n\nLog in to accept or decline this invitation.`;
  const html = `<p>Hi ${recipientName},</p><p><strong>${inviterName}</strong> invited you to join the questing group "${groupName}".</p><p><a href="${groupInviteUrl}">View invite</a></p><p>Log in to accept or decline this invitation.</p>`;

  return { subject, text, html };
};
