module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const pollId = event?.resource?.id || "";

  return {
    title: "Session Restored",
    body: `"${pollTitle}" has been restored.`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
