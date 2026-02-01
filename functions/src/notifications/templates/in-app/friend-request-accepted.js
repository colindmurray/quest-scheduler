module.exports = (event) => {
  const friendName = event?.actor?.displayName || event?.actor?.email || "Someone";

  return {
    title: "Friend Request Accepted",
    body: `${friendName} accepted your friend request`,
    actionUrl: "/friends",
  };
};
