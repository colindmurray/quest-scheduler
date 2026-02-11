const {
  resolveBasicPollTitle,
  resolveBasicPollWebUrl,
  resolveRecipientName,
} = require("../basic-polls-shared");

module.exports = (event, recipient) => {
  const pollTitle = resolveBasicPollTitle(event);
  const voterName = event?.actor?.displayName || event?.actor?.email || "Someone";
  const pollUrl = resolveBasicPollWebUrl(event);
  const recipientName = resolveRecipientName(recipient);

  return {
    subject: `New vote on basic poll: ${pollTitle}`,
    text: `Hi ${recipientName},\n\n${voterName} submitted a vote for "${pollTitle}".\nView poll: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p><strong>${voterName}</strong> submitted a vote for "${pollTitle}".</p><p><a href="${pollUrl}">View poll</a></p><p>Thanks!</p>`,
  };
};
