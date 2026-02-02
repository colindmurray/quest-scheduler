module.exports = (event) => {
  const friendName = event?.actor?.displayName || event?.actor?.email || "Someone";

  return {
    title: "Friend Removed",
    body: `${friendName} is no longer on your friends list.`,
    actionUrl: "/friends",
  };
};
