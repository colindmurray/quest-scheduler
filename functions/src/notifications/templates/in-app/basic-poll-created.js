const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  return {
    title: "Basic Poll Created",
    body: `"${pollTitle}" is ready for votes.`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
