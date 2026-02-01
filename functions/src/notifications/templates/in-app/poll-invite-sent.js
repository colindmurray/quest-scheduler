module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const inviterName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const pollId = event?.resource?.id || event?.payload?.pollId || "";

  return {
    title: "Session Poll Invite",
    body: `${inviterName} invited you to join "${pollTitle}"`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
