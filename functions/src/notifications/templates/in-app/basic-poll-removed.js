const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  return {
    title: "Basic Poll Removed",
    body: `"${pollTitle}" was removed.`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
