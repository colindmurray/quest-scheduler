module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const pollId = event?.resource?.id || "";

  return {
    title: "All Votes Are In",
    body: `"${pollTitle}" has all votes in.`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
