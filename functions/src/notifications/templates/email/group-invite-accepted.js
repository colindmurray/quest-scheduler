const groupsUrl = "https://quest-scheduler.app/friends?tab=groups";

module.exports = (event, recipient) => {
  const groupName = event?.payload?.groupName || event?.resource?.title || "Questing Group";
  const memberName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = `Group invite accepted: ${groupName}`;
  const text = `Hi ${recipientName},\n\n${memberName} accepted your invite to "${groupName}".\nView the group: ${groupsUrl}`;
  const html = `<p>Hi ${recipientName},</p><p><strong>${memberName}</strong> accepted your invite to "${groupName}".</p><p><a href="${groupsUrl}">View the group</a></p>`;

  return { subject, text, html };
};
