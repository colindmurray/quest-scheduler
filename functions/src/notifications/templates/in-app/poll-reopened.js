module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const pollId = event?.resource?.id || "";

  return {
    title: "Poll Reopened",
    body: `Voting reopened for "${pollTitle}"`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
