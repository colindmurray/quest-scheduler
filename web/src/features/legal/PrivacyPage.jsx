import LegalLayout from "./LegalLayout";

const EFFECTIVE_DATE = "January 28, 2026";
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
          <strong>Account information.</strong> When you create an account or sign in, we
          receive your email address, display name, profile photo, provider identifiers (such
          as Google or Discord IDs), and an internal user ID. Authentication credentials are
          handled by Firebase Authentication.
        </li>
        <li>
          <strong>Profile identifiers.</strong> We store your display name and any identifiers
          you choose to use, such as a Quest Scheduler username, a Discord username, or your
          email. We also store normalized (lowercase) versions to support lookups for invites
          and blocking.
        </li>
        <li>
          <strong>Profile photos and avatars.</strong> We store provider profile photos (such
          as Google) and Discord avatar metadata if Discord is linked. If you upload a custom
          avatar, we store the image in Firebase Storage and store a public URL in your
          profile. Avatars are public so other users can see them.
        </li>
        <li>
          <strong>Discord account and server information.</strong> If you sign in with or link
          Discord, we receive your Discord user ID, username, display name, avatar metadata,
          and (for Discord login) a verified email address. If you connect a server/channel,
          we receive the IDs/names for the linked guild, channel, and any configured notify
          role.
        </li>
        <li>
          <strong>Calendar access.</strong> If you connect Google Calendar, we request access to
          list your calendars and create events you approve. We do not read your event details
          at any time.
        </li>
        <li>
          <strong>OAuth tokens and state.</strong> When you connect Google Calendar, we store an
          encrypted refresh token so we can create or update events you request. For Discord
          login/linking, we store short-lived OAuth state and only the Discord identifiers
          needed for linking; we do not store Discord OAuth access tokens.
        </li>
        <li>
          <strong>User content.</strong> We store the scheduling data you create or submit,
          including session polls, time slots, votes, invites, questing groups, friend
          requests, blocked users, and notifications.
        </li>
        <li>
          <strong>Discord interactions.</strong> We record commands, button/select interactions,
          and timestamps to process votes, prevent abuse, and keep poll state in sync. We do
          not read message content from your server.
        </li>
        <li>
          <strong>Usage data.</strong> Our infrastructure providers may log basic usage data
          such as IP address, browser type, and timestamps for security and reliability.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>Provide the service, including scheduling, voting, and notifications.</li>
        <li>Authenticate users, link sign-in providers, and prevent account lockout.</li>
        <li>Create calendar events you request.</li>
        <li>Link your Discord account, post poll updates, and record votes from Discord.</li>
        <li>Resolve invites by email, Discord username, or Quest Scheduler username.</li>
        <li>Display public identifiers and avatars to other users for coordination and safety.</li>
        <li>Send transactional emails related to invites and updates.</li>
        <li>Maintain security, prevent abuse, and improve reliability.</li>
      </ul>

      <h2>Public profile and identifiers</h2>
      <p>
        Quest Scheduler shows a display name and a unique public identifier with your profile
        in contexts like invites, polls, and friend requests. You can choose which identifier
        is public (email, Discord username, or Quest Scheduler username) in Settings. Other
        users may use this identifier to invite or block you.
      </p>

      <h2>How we share information</h2>
      <ul>
        <li>
          <strong>Service providers.</strong> We use third‑party providers such as Firebase and
          Google APIs to host data, authenticate users, and deliver notifications.
        </li>
        <li>
          <strong>Discord.</strong> If you link Discord, we send poll updates, vote confirmations,
          and related metadata to Discord so the bot can display them in your server/channel.
        </li>
        <li>
          <strong>Email delivery.</strong> We use an email delivery provider to send invite and
          notification emails.
        </li>
        <li>
          <strong>With other users.</strong> Your name, chosen public identifier, avatar, and
          responses may be visible to other participants in a session or group you join. If you
          use email invites or choose email as your public identifier, your email address may be
          visible to those users. If you choose a Discord or Quest Scheduler username, that
          identifier will be visible instead.
        </li>
        <li>
          <strong>Legal requirements.</strong> We may disclose information if required by law or
          to protect our rights and users.
        </li>
      </ul>

      <h2>Third-party policies</h2>
      <ul>
        <li>
          Google Privacy Policy:{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            policies.google.com/privacy
          </a>
        </li>
        <li>
          Google Terms of Service:{" "}
          <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
            policies.google.com/terms
          </a>
        </li>
        <li>
          Discord Privacy Policy:{" "}
          <a href="https://discord.com/privacy" target="_blank" rel="noreferrer">
            discord.com/privacy
          </a>
        </li>
        <li>
          Discord Terms of Service:{" "}
          <a href="https://discord.com/terms" target="_blank" rel="noreferrer">
            discord.com/terms
          </a>
        </li>
      </ul>

      <h2>Google API Services User Data Policy</h2>
      <p>
        Quest Scheduler's use and transfer of information received from Google APIs adheres to
        the Google API Services User Data Policy, including the Limited Use requirements. We
        only use Google user data to provide the features you request, and we do not use it for
        advertising or sell it to third parties. We do not allow human access to Google user
        data except to provide user-requested support, for security reasons, or to comply with
        law.
      </p>
      <p>
        You can review the policy here:{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        .
      </p>

      <h2>Data retention</h2>
      <p>
        We retain your data for as long as your account is active or as needed to provide the
        service. You can delete your account in the app, which triggers deletion of your
        account data, including polls you created, votes you submitted, identifiers, and
        profile details. If you unlink Discord or revoke Google access, we stop using the
        connection and remove the stored link from your account. Residual backups may persist
        for a limited time before permanent removal.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>You can access and update your profile information in your Google Account.</li>
        <li>You can revoke Google Calendar access from your Google account settings.</li>
        <li>You can link or unlink Discord in Settings, or remove the bot from your server.</li>
        <li>You can set a display name, choose your public identifier, or create a Quest Scheduler username.</li>
        <li>You can upload a custom avatar or choose which avatar source to use.</li>
        <li>You can delete your account in Settings to erase your account data.</li>
      </ul>

      <h2>Access, deletion, and portability</h2>
      <p>
        You may request access to or deletion of your data by contacting us. If you delete your
        account in the app, we remove your profile and scheduling data and disassociate linked
        integrations from your profile. You can also revoke access directly with the provider.
      </p>

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
