const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  const required = event?.payload?.required === true;
  return {
    title: "Basic Poll Requirement Changed",
    body: `"${pollTitle}" is now ${required ? "required" : "optional"}.`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
