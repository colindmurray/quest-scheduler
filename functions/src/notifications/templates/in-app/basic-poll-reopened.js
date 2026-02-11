const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  return {
    title: "Basic Poll Reopened",
    body: `Voting reopened for "${pollTitle}".`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
