# Architecture Decisions

## Email Notifications
- Approach: Firebase Extension (Trigger Email) using SMTP.
- Current implementation: extensions manifest (`firebase.json`) + params in `extensions/firestore-send-email.env` and secrets in `extensions/firestore-send-email.secret.local`.
- Trigger condition: only when votes change and creator has `settings.emailNotifications = true`.
