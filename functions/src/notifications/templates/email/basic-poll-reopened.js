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
    subject: `Basic poll reopened: ${pollTitle}`,
    text: `Hi ${recipientName},\n\nVoting reopened for "${pollTitle}".\nCast your vote: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p>Voting reopened for "${pollTitle}".</p><p><a href="${pollUrl}">Cast your vote</a></p><p>Thanks!</p>`,
  };
};
