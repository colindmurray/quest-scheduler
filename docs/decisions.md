# Architecture Decisions

## Email Notifications
- Approach: Firebase Extension (Trigger Email) using SMTP.
- Current implementation: extensions manifest (`firebase.json`) + params in `extensions/firestore-send-email.env` and secrets in `extensions/firestore-send-email.secret.local`.
- Trigger condition: only when votes change and creator has `settings.emailNotifications = true`.

## Email Verification Enforcement
- Decision: enforce verification at the Firestore rules layer for sensitive creates (scheduler + questing group creation).
- Rationale: prevents unverified email/password accounts from creating polls while still allowing login + read access.
- Implementation: check `request.auth.token.email_verified == true` or Google sign-in provider.

## Calendar Event Defaults
- Decision: remove per-user default calendar title/description in settings.
- Rationale: calendar event details should mirror the session poll title/description (with questing group context).
- Implementation: store poll `description` on scheduler documents; prefill calendar event title/description from poll data.

## TypeScript Migration (Incremental)
- Decision: migrate JS → TS in small chunks while keeping JS/TS mixed via `allowJs: true` and `checkJs: false`.
- Decision: start with non-strict TypeScript settings and tighten over time as coverage improves.
- Decision: keep functions compiled to `lib/` when TS is introduced; update `functions/package.json` `main` accordingly.

## Identifier Parsing Test Vectors
- Decision: keep a shared set of test vectors for identifier parsing (email, Discord username, legacy tag, Discord ID, QS username) and update both client/server helpers together.
- Rationale: regex drift between `web/src/lib/identifiers.js` and `functions/src/utils/identifiers.js` would create inconsistent validation across the app.
- Implementation: when changing identifier rules, update both helper modules and validate against the vectors below.
- Vectors:
  - Email: `user@example.com`, `USER+alias@example.co`
  - Discord username: `user.name`, `user_name`, `user-name`
  - Legacy Discord tag: `user#1234`
  - Discord ID: `123456789012345678`
  - QS username: `questmaster`, `dm-kris`

## Notification Retention
- Decision: delete dismissed in-app notifications after 20 days (scheduled cleanup or Firestore TTL).
- Rationale: keep notification collections lean while preserving recent history for UX context.

## Unified Notification Overhaul: Event Emission
- Decision: `notificationEvents` writes are server-only via a callable `emitNotificationEvent`. Clients do not write events directly.
- Rationale: avoids spoofing and simplifies validation; reduces Firestore rule complexity.

## Unified Notification Overhaul: Coalescing
- Decision: initial coalescing uses `dedupeKey` with immediate processing; no Cloud Tasks or delayed batching in v1.
- Rationale: lower ops cost and complexity for small scale.

## Unified Notification Overhaul: Event Retention
- Decision: set `expiresAt` on `notificationEvents` and use Firestore TTL (default 90 days) for cleanup.
- Rationale: prevent unbounded growth while retaining enough history for debugging.

## Unified Notification Overhaul: Channel Skips
- Decision: treat missing in-app or email recipients as a successful no-op in the router (skip without error).
- Rationale: events may intentionally target only one channel; status should not be `partial` when a channel has no recipients.

## Unified Notification Overhaul: Preference Resolution
- Decision: resolve in-app/email delivery per recipient inside the router using user settings (`notificationMode`, `notificationPreferences`, `emailNotifications`).
- Rationale: keep preference logic centralized and consistent across web + functions; avoid client-side filtering drift.

## Unified Notification Overhaul: Email Eligibility
- Decision: only event types with email templates are eligible for email delivery; if a preference resolves to `inApp+Email` for a non-eligible event, it is downgraded to `inApp`.
- Rationale: avoid router failures on missing templates and keep low-importance events in-app only by default.

## Unified Notification Overhaul: Group Invite Revocation
- Decision: use `GROUP_INVITE_DECLINED` events (actor = invitee) to auto-clear revoked group invites, without sending new notifications to inviters.
- Rationale: reuse existing auto-clear rules without introducing a new event type.
