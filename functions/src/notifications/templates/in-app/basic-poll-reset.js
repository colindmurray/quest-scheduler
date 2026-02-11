const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  return {
    title: "Basic Poll Reset",
    body: `Votes were reset for "${pollTitle}". Please vote again.`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
