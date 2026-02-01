module.exports = (event) => {
  const senderName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const requestId = event?.payload?.requestId || event?.resource?.id || "";

  return {
    title: "Friend Request",
    body: `${senderName} sent you a friend request`,
    actionUrl: requestId ? `/friends?request=${requestId}` : "/friends",
  };
};
