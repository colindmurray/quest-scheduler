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
    subject: `Reminder: vote on ${pollTitle}`,
    text: `Hi ${recipientName},\n\nYou still have votes to cast for "${pollTitle}".\nVote now: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p>You still have votes to cast for "${pollTitle}".</p><p><a href="${pollUrl}">Vote now</a></p><p>Thanks!</p>`,
  };
};
