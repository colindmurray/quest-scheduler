function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

import { APP_LOGO_URL, APP_NAME, APP_URL, SUPPORT_EMAIL } from "./config";

export function createEmailMessage({
  subject,
  title,
  intro,
  ctaLabel,
  ctaUrl,
  extraLines = [],
  footer = APP_NAME,
}) {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeLabel = escapeHtml(ctaLabel);
  const safeUrl = escapeHtml(ctaUrl);
  const safeFooter = escapeHtml(footer);
  const safeSupportEmail = escapeHtml(SUPPORT_EMAIL);
  const safeAppUrl = escapeHtml(APP_URL);
  const safeLogoUrl = escapeHtml(APP_LOGO_URL);
  const safeExtra = extraLines.map((line) => escapeHtml(line));

  const textLines = [
    title,
    "",
    intro,
    "",
    ...extraLines,
    "",
    `${ctaLabel}: ${ctaUrl}`,
    `Contact us: ${SUPPORT_EMAIL}`,
    "",
    footer,
  ];

  const extraHtml =
    safeExtra.length > 0
      ? `<ul style="margin:16px 0 0;padding:0 0 0 18px;color:#cbd5f5;font-size:14px;line-height:20px;">
${safeExtra.map((line) => `<li style="margin-bottom:6px;">${line}</li>`).join("")}
</ul>`
      : "";

  const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;background:#0b1220;color:#e2e8f0;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b1220;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#111827;border:1px solid #1f2937;border-radius:18px;padding:28px;">
            <tr>
              <td style="padding:0 0 10px 0;">
                <a href="${safeAppUrl}" style="display:inline-block;text-decoration:none;">
                  <img src="${safeLogoUrl}" alt="Quest Scheduler" width="40" height="40" style="display:block;border-radius:12px;border:1px solid #1f2937;background:#0b1220;" />
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 8px 0;">
                <p style="margin:0;font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#94a3b8;">Quest Scheduler</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 12px 0;">
                <h1 style="margin:0;font-size:22px;color:#f8fafc;">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:22px;color:#e2e8f0;">
                ${safeIntro}
              </td>
            </tr>
            <tr>
              <td>
                ${extraHtml}
              </td>
            </tr>
            <tr>
              <td style="padding-top:22px;">
                <a href="${safeUrl}" style="display:inline-block;background:#22c55e;color:#0b1220;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:999px;">
                  ${safeLabel}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding-top:18px;font-size:12px;color:#94a3b8;">
                If the button doesn’t work, open this link: <span style="color:#38bdf8;">${safeUrl}</span>
              </td>
            </tr>
            <tr>
              <td style="padding-top:12px;font-size:12px;color:#94a3b8;">
                Need help? <a href="mailto:${safeSupportEmail}" style="color:#38bdf8;text-decoration:none;">Contact us</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:11px;color:#64748b;">${safeFooter}</p>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  return {
    subject,
    text: textLines.join("\n"),
    html,
  };
}
