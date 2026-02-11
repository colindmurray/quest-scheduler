const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  const resultSummary = event?.payload?.resultSummary || "Final results are available.";
  return {
    title: "Basic Poll Finalized",
    body: `"${pollTitle}" has been finalized. ${resultSummary}`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
