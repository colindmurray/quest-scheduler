module.exports = (event) => {
  const groupName = event?.payload?.groupName || event?.resource?.title || "Questing Group";
  const inviterName = event?.actor?.displayName || event?.actor?.email || "Someone";

  return {
    title: "Group Invitation",
    body: `${inviterName} invited you to join "${groupName}"`,
    actionUrl: "/friends?tab=groups",
  };
};
