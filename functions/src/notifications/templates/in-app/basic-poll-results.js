const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  const resultsSummary = event?.payload?.resultsSummary || "View the final results.";
  return {
    title: "Basic Poll Results",
    body: `Results are in for "${pollTitle}". ${resultsSummary}`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
