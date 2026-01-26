import LegalLayout from "./LegalLayout";

const EFFECTIVE_DATE = "January 26, 2026";
const CONTACT_EMAIL = "support@questscheduler.cc";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        Effective date: <strong>{EFFECTIVE_DATE}</strong>
      </p>

      <p>
        By accessing or using Quest Scheduler (the “Service”), you agree to these Terms of
        Service (“Terms”). If you do not agree, do not use the Service.
      </p>
      <p>
        Your use of the Service is also governed by our Privacy Policy, which explains how we
        collect and use information.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be at least 13 years old to use the Service. If you are using the Service on
        behalf of an organization, you represent that you have authority to bind that
        organization.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You are responsible for maintaining the security of your account.</li>
        <li>You must provide accurate information and keep it up to date.</li>
        <li>You are responsible for activity that occurs under your account.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not misuse the Service or attempt to access it in an unauthorized way.</li>
        <li>Do not send spam, abusive content, or illegal content.</li>
        <li>Do not interfere with or disrupt the Service or its infrastructure.</li>
        <li>Do not attempt to circumvent rate limits, security controls, or access checks.</li>
      </ul>

      <h2>Calendar integration</h2>
      <p>
        The Service can create calendar events on your behalf when you request it. You can
        revoke calendar access at any time through your Google account settings.
      </p>

      <h2>Discord integration</h2>
      <p>
        If you choose to link Discord, you authorize us to connect your Discord account to your
        Quest Scheduler account and to perform actions on your behalf, such as posting poll
        updates and recording votes in linked channels. You are responsible for ensuring you
        have the rights and permissions to link a server/channel and to install the bot.
      </p>
      <p>
        You can unlink Discord at any time in Settings or remove the bot from your server. We
        may disable Discord features if required by Discord policies or if misuse is detected.
      </p>

      <h2>User content</h2>
      <p>
        You retain ownership of content you submit. By submitting content, you grant us a
        non‑exclusive, worldwide, royalty‑free license to host, store, and display that content
        to provide the Service.
      </p>

      <h2>Third-party services</h2>
      <p>
        The Service integrates with third-party services such as Google and Discord. Your use
        of those services is subject to their terms and policies. We are not responsible for
        third-party services or their availability.
      </p>
      <ul>
        <li>
          Google Terms:{" "}
          <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
            policies.google.com/terms
          </a>
        </li>
        <li>
          Google Privacy:{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            policies.google.com/privacy
          </a>
        </li>
        <li>
          Discord Terms:{" "}
          <a href="https://discord.com/terms" target="_blank" rel="noreferrer">
            discord.com/terms
          </a>
        </li>
        <li>
          Discord Privacy:{" "}
          <a href="https://discord.com/privacy" target="_blank" rel="noreferrer">
            discord.com/privacy
          </a>
        </li>
      </ul>

      <h2>Service availability</h2>
      <p>
        We may modify, suspend, or discontinue the Service at any time. We are not liable for
        any interruption or loss of data.
      </p>

      <h2>Termination</h2>
      <p>
        We may suspend or terminate your access if you violate these Terms or if required by
        law. You may stop using the Service at any time and can delete your account in the
        app, which permanently removes your access and associated data, subject to limited
        backup retention.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The Service is provided “as is” and “as available.” We disclaim all warranties of any
        kind, express or implied, including merchantability, fitness for a particular purpose,
        and non‑infringement.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Quest Scheduler will not be liable for any
        indirect, incidental, special, consequential, or punitive damages, or any loss of data
        or profits.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. We will update the effective date above
        and, if changes are material, provide a notice in the app.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalLayout>
  );
}
