const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  const voterName = event?.actor?.displayName || event?.actor?.email || "Someone";
  return {
    title: "Basic Poll Vote Submitted",
    body: `${voterName} submitted a vote for "${pollTitle}".`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
