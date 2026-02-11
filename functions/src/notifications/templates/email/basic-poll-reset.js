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
    subject: `Votes reset: ${pollTitle}`,
    text: `Hi ${recipientName},\n\nVotes were reset for "${pollTitle}".\nPlease vote again: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p>Votes were reset for "${pollTitle}".</p><p><a href="${pollUrl}">Please vote again</a></p><p>Thanks!</p>`,
  };
};
