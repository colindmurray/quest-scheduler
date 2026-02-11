const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  return {
    title: "Basic Poll Reminder",
    body: `You still have votes to cast for "${pollTitle}".`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
