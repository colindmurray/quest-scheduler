module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const inviteeName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const pollId = event?.resource?.id || event?.payload?.pollId || "";

  return {
    title: "Poll Invite Accepted",
    body: `${inviteeName} accepted your invite to "${pollTitle}"`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
