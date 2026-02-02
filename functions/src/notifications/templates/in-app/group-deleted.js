module.exports = (event) => {
  const groupName = event?.payload?.groupName || event?.resource?.title || "Questing Group";
  const actorName = event?.actor?.displayName || event?.actor?.email || "Someone";

  return {
    title: "Group Deleted",
    body: `${actorName} deleted "${groupName}".`,
    actionUrl: "/friends?tab=groups",
  };
};
