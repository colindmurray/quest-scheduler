const {
  resolveBasicPollTitle,
  resolveBasicPollWebUrl,
  resolveRecipientName,
} = require("../basic-polls-shared");

module.exports = (event, recipient) => {
  const pollTitle = resolveBasicPollTitle(event);
  const resultsSummary = event?.payload?.resultsSummary || "Final results are available.";
  const pollUrl = resolveBasicPollWebUrl(event);
  const recipientName = resolveRecipientName(recipient);

  return {
    subject: `Results: ${pollTitle}`,
    text: `Hi ${recipientName},\n\nResults are in for "${pollTitle}".\n${resultsSummary}\nView results: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p>Results are in for "${pollTitle}".</p><p>${resultsSummary}</p><p><a href="${pollUrl}">View results</a></p><p>Thanks!</p>`,
  };
};
