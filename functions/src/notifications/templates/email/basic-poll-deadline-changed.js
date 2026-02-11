const {
  resolveBasicPollTitle,
  resolveBasicPollWebUrl,
  resolveRecipientName,
} = require("../basic-polls-shared");

module.exports = (event, recipient) => {
  const pollTitle = resolveBasicPollTitle(event);
  const deadlineLabel = event?.payload?.deadlineLabel || "The deadline was updated.";
  const pollUrl = resolveBasicPollWebUrl(event);
  const recipientName = resolveRecipientName(recipient);

  return {
    subject: `Deadline updated: ${pollTitle}`,
    text: `Hi ${recipientName},\n\n"${pollTitle}" deadline changed.\n${deadlineLabel}\nView poll: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p>"${pollTitle}" deadline changed.</p><p>${deadlineLabel}</p><p><a href="${pollUrl}">View poll</a></p><p>Thanks!</p>`,
  };
};
