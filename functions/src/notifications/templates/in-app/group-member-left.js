module.exports = (event) => {
  const groupName = event?.payload?.groupName || event?.resource?.title || "Questing Group";
  const memberName = event?.actor?.displayName || event?.actor?.email || "Someone";

  return {
    title: "Group Member Left",
    body: `${memberName} left "${groupName}"`,
    actionUrl: "/settings?tab=groups",
  };
};
