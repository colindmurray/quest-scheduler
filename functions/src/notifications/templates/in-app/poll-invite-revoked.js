module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const inviterName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const pollId = event?.resource?.id || event?.payload?.pollId || "";

  return {
    title: "Poll Invite Revoked",
    body: `${inviterName} revoked your invite to "${pollTitle}"`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
