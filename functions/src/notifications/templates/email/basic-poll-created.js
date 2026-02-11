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
    subject: `Basic poll created: ${pollTitle}`,
    text: `Hi ${recipientName},\n\n"${pollTitle}" is ready for votes.\nVote now: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p>"${pollTitle}" is ready for votes.</p><p><a href="${pollUrl}">Vote now</a></p><p>Thanks!</p>`,
  };
};
