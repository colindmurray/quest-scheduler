module.exports = (event) => {
  const friendName = event?.actor?.displayName || event?.actor?.email || "Someone";

  return {
    title: "Friend Request Declined",
    body: `${friendName} declined your friend request`,
    actionUrl: "/friends",
  };
};
