const {
  resolveBasicPollTitle,
  resolveBasicPollWebUrl,
  resolveRecipientName,
} = require("../basic-polls-shared");

module.exports = (event, recipient) => {
  const pollTitle = resolveBasicPollTitle(event);
  const resultSummary = event?.payload?.resultSummary || "Final results are available.";
  const pollUrl = resolveBasicPollWebUrl(event);
  const recipientName = resolveRecipientName(recipient);

  return {
    subject: `Basic poll finalized: ${pollTitle}`,
    text: `Hi ${recipientName},\n\n"${pollTitle}" has been finalized.\n${resultSummary}\nView results: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p>"${pollTitle}" has been finalized.</p><p>${resultSummary}</p><p><a href="${pollUrl}">View results</a></p><p>Thanks!</p>`,
  };
};
