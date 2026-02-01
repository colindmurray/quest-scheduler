module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const winningDate = event?.payload?.winningDate || "a winning time";
  const pollId = event?.resource?.id || "";

  return {
    title: "Session Finalized",
    body: `"${pollTitle}" has been finalized for ${winningDate}`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
