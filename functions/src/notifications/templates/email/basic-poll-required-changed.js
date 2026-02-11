const {
  resolveBasicPollTitle,
  resolveBasicPollWebUrl,
  resolveRecipientName,
} = require("../basic-polls-shared");

module.exports = (event, recipient) => {
  const pollTitle = resolveBasicPollTitle(event);
  const required = event?.payload?.required === true;
  const pollUrl = resolveBasicPollWebUrl(event);
  const recipientName = resolveRecipientName(recipient);

  return {
    subject: `Requirement changed: ${pollTitle}`,
    text: `Hi ${recipientName},\n\n"${pollTitle}" is now ${required ? "required" : "optional"}.\nView poll: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p>"${pollTitle}" is now <strong>${required ? "required" : "optional"}</strong>.</p><p><a href="${pollUrl}">View poll</a></p><p>Thanks!</p>`,
  };
};
