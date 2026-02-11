const {
  resolveBasicPollTitle,
  resolveBasicPollWebUrl,
  resolveRecipientName,
} = require("../basic-polls-shared");

module.exports = (event, recipient) => {
  const pollTitle = resolveBasicPollTitle(event);
  const missingCount = Number.isFinite(event?.payload?.missingCount)
    ? event.payload.missingCount
    : null;
  const pollUrl = resolveBasicPollWebUrl(event);
  const recipientName = resolveRecipientName(recipient);

  const missingLine =
    missingCount == null
      ? "Some required votes were missing at finalization."
      : `${missingCount} required vote${missingCount === 1 ? "" : "s"} were missing at finalization.`;

  return {
    subject: `Finalized with missing votes: ${pollTitle}`,
    text: `Hi ${recipientName},\n\n"${pollTitle}" was finalized before all required votes were submitted.\n${missingLine}\nView details: ${pollUrl}\n\nThanks!`,
    html: `<p>Hi ${recipientName},</p><p>"${pollTitle}" was finalized before all required votes were submitted.</p><p>${missingLine}</p><p><a href="${pollUrl}">View details</a></p><p>Thanks!</p>`,
  };
};
