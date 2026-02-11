const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  const missingCount = Number.isFinite(event?.payload?.missingCount)
    ? event.payload.missingCount
    : null;
  return {
    title: "Finalized With Missing Required Votes",
    body:
      missingCount == null
        ? `"${pollTitle}" was finalized before all required votes were submitted.`
        : `"${pollTitle}" was finalized with ${missingCount} required vote${missingCount === 1 ? "" : "s"} missing.`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
