module.exports = (event) => {
  const pollTitle = event?.payload?.pollTitle || event?.resource?.title || "Session Poll";

  return {
    title: "Session Deleted",
    body: `"${pollTitle}" has been deleted.`,
    actionUrl: "/dashboard",
  };
};
