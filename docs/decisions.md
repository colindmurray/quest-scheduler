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
