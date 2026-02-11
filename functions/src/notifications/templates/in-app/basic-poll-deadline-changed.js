const {
  resolveBasicPollActionUrl,
  resolveBasicPollTitle,
} = require("../basic-polls-shared");

module.exports = (event) => {
  const pollTitle = resolveBasicPollTitle(event);
  const deadlineLabel = event?.payload?.deadlineLabel || "The deadline was updated.";
  return {
    title: "Basic Poll Deadline Updated",
    body: `"${pollTitle}" deadline changed. ${deadlineLabel}`,
    actionUrl: resolveBasicPollActionUrl(event),
  };
};
