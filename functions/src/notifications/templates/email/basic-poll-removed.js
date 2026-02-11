const {
  resolveBasicPollTitle,
  resolveBasicPollWebUrl,
  resolveRecipientName,
} = require("../basic-polls-shared");

module.exports = (event, recipient) => {
  const pollTitle = resolveBasicPollTitle(event);
  const pollUrl = resolveBasicPollWebUrl(event);
  const recipientName = resolveRecipientName(recipient);

  return {
    subject: `Basic poll removed: ${pollTitle}`,
    text: `Hi ${recipientName},\n\n"${pollTitle}" was removed.\nDetails: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p>"${pollTitle}" was removed.</p><p><a href="${pollUrl}">View details</a></p><p>Thanks!</p>`,
  };
};
