const groupsUrl = "https://quest-scheduler.app/friends?tab=groups";

module.exports = (event, recipient) => {
  const groupName = event?.payload?.groupName || event?.resource?.title || "Questing Group";
  const memberName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const recipientName = recipient?.displayName || recipient?.email || "there";

  const subject = `Group invite declined: ${groupName}`;
  const text = `Hi ${recipientName},\n\n${memberName} declined your invite to "${groupName}".\nView your groups: ${groupsUrl}`;
  const html = `<p>Hi ${recipientName},</p><p><strong>${memberName}</strong> declined your invite to "${groupName}".</p><p><a href="${groupsUrl}">View your groups</a></p>`;

  return { subject, text, html };
};
