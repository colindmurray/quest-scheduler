module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const voterName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const pollId = event?.resource?.id || "";

  return {
    title: "New Vote Submitted",
    body: `${voterName} updated votes for "${pollTitle}"`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
