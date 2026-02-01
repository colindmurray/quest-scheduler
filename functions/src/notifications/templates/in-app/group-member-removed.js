module.exports = (event) => {
  const groupName = event?.payload?.groupName || event?.resource?.title || "Questing Group";
  const actorName = event?.actor?.displayName || event?.actor?.email || "Someone";

  return {
    title: "Removed from Group",
    body: `${actorName} removed you from "${groupName}"`,
    actionUrl: "/settings?tab=groups",
  };
};
