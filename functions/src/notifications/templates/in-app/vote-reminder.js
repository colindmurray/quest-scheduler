module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const pollId = event?.resource?.id || "";

  return {
    title: "Vote Reminder",
    body: `You still have votes to cast for "${pollTitle}".`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
