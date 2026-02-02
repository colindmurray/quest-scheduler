module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const pollId = event?.resource?.id || "";

  return {
    title: "Session Poll Created",
    body: `"${pollTitle}" is ready for votes.`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
