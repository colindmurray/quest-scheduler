module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";
  const pollId = event?.resource?.id || "";
  const changeSummary = event?.payload?.changeSummary;

  return {
    title: "Slots Updated",
    body: changeSummary
      ? `${changeSummary} for "${pollTitle}"`
      : `Time slots were updated for "${pollTitle}"`,
    actionUrl: pollId ? `/scheduler/${pollId}` : "/dashboard",
  };
};
