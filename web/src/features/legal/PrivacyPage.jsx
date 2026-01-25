import LegalLayout from "./LegalLayout";

const EFFECTIVE_DATE = "January 23, 2026";
const CONTACT_EMAIL = "support@questscheduler.cc";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        Effective date: <strong>{EFFECTIVE_DATE}</strong>
      </p>

      <p>
        Quest Scheduler (“we”, “us”, “our”) provides tools for scheduling tabletop sessions,
        collecting votes, and creating calendar events. This Privacy Policy explains what
        information we collect, how we use it, and your choices.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> When you sign in with Google, we receive your
          name, email address, profile photo, and Google account identifier.
        </li>
        <li>
          <strong>Calendar access.</strong> If you connect Google Calendar, we request access to
          list your calendars and create events you approve. We do not read your event details
          unless needed for the specific actions you initiate.
        </li>
        <li>
          <strong>User content.</strong> We store the scheduling data you create or submit,
          including session polls, time slots, votes, invites, questing groups, friends, and
          notifications.
        </li>
        <li>
          <strong>Usage data.</strong> Our infrastructure providers may log basic usage data
          such as IP address, browser type, and timestamps for security and reliability.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>Provide the service, including scheduling, voting, and notifications.</li>
        <li>Create calendar events you request.</li>
        <li>Send transactional emails related to invites and updates.</li>
        <li>Maintain security, prevent abuse, and improve reliability.</li>
      </ul>

      <h2>How we share information</h2>
      <ul>
        <li>
          <strong>Service providers.</strong> We use third‑party providers such as Firebase and
          Google APIs to host data, authenticate users, and deliver notifications.
        </li>
        <li>
          <strong>Email delivery.</strong> We use an email delivery provider to send invite and
          notification emails.
        </li>
        <li>
          <strong>With other users.</strong> Your name, email, and responses may be visible to
          other participants in a session or group you join.
        </li>
        <li>
          <strong>Legal requirements.</strong> We may disclose information if required by law or
          to protect our rights and users.
        </li>
      </ul>

      <h2>Data retention</h2>
      <p>
        We retain your data for as long as your account is active or as needed to provide the
        service. You can delete your account in the app, which triggers deletion of your
        account data, including polls you created, votes you submitted, and related metadata.
        Residual backups may persist for a limited time before permanent removal.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>You can access and update your profile information in your Google Account.</li>
        <li>You can revoke Google Calendar access from your Google account settings.</li>
        <li>You can delete your account in Settings to erase your account data.</li>
      </ul>

      <h2>Security</h2>
      <p>
        We use reasonable technical measures to protect information. No system is completely
        secure, and we cannot guarantee absolute security.
      </p>

      <h2>Children’s privacy</h2>
      <p>
        Quest Scheduler is not intended for children under 13. If you believe a child has
        provided personal information, please contact us.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will update the effective date
        above and, if changes are material, provide a notice in the app.
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about this Privacy Policy, contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalLayout>
  );
}
