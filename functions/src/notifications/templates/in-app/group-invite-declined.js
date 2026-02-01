module.exports = (event) => {
  const groupName = event?.payload?.groupName || event?.resource?.title || "Questing Group";
  const memberName = event?.actor?.displayName || event?.actor?.email || "Someone";

  return {
    title: "Group Invite Declined",
    body: `${memberName} declined your invite to "${groupName}"`,
    actionUrl: "/friends?tab=groups",
  };
};
