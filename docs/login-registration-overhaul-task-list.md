# Login & Registration Overhaul — Task List

> Status legend: [ ] not started, [~] in progress, [x] done

## P0 — Firebase Configuration (Prerequisites)
- [ ] **Verify Firebase settings**: confirm "One account per email address" is ENABLED in Firebase Console → Authentication → Settings.
- [ ] **Enable Email/Password provider**: confirm Email/Password sign-in provider is enabled in Firebase Console.
- [x] **Review Firestore rules**: check if any rule updates are needed for new fields.

## P0 — Foundations (Blocking)
- [x] **Design doc alignment**: reconciled Phase 4 to use Admin Auth email check (not `usersPublic`) and clarified soft‑block vs server‑side enforcement.
- [x] **Auth helpers**: add email/password register + login, send verification, Google linking, and reset password helper (`web/src/lib/auth.js`).
- [x] **User profile bootstrap**: implement `ensureUserProfile(user)` to create/merge `users` and `usersPublic` (`web/src/lib/data/users.js`).
- [x] **Auth provider integration**: call `ensureUserProfile` on auth state change; track profile existence in context (`web/src/app/AuthProvider.jsx`).
- [x] **Protected route guard**: require auth + profile; surface verification banner for unverified password users (`web/src/app/ProtectedRoute.jsx`).
- [x] **Firestore rules**: add `email_verified` checks for sensitive actions if enforcing server‑side (poll creation, invitations). Document final choice.

## P0 — Auth UI
- [x] **Create `/auth` route**: add route in `web/src/App.jsx` and make it a public route.
- [x] **Auth page**: build `web/src/features/auth/AuthPage.jsx` with tabs (Log in / Create account), Google CTA, email form, and Terms/Privacy checkbox for registration.
- [x] **Landing CTA update**: route to `/auth` from `web/src/features/landing/LandingPage.jsx`.
- [x] **Verification banner**: add `web/src/components/VerificationBanner.jsx` and surface in ProtectedRoute/Settings.

## P1 — Password Reset + Email Verification UX
- [x] **Forgot password UI**: add “Forgot password?” flow on login tab (modal/inline).
- [x] **Hybrid reset flow**: client attempts `sendPasswordResetEmail` and falls back to callable for Google‑only accounts.
- [x] **Callable function**: add `functions/src/auth.js` with `sendPasswordResetInfo` (SendGrid mail write). Wire into `functions/src/index.js`.
- [x] **Email verification UX**: add resend + refresh actions in banner and Settings.

## P1 — Calendar Linking Update
- [x] **OAuth callback change**: remove strict email match and add Admin Auth email conflict check (`functions/src/legacy.js`).
- [x] **Store linked calendar email**: persist to `users/{uid}.settings.linkedCalendarEmail`.
- [x] **Settings UI**: display linked calendar email + mismatch warning in `web/src/features/settings/SettingsPage.jsx`.

## P1 — Account Linking
- [x] **Settings link button**: add “Link Google account” action for password users.
- [x] **Provider state UI**: show linked providers (from `user.providerData`) and mismatch info.
- [x] **Error handling**: map Firebase linking errors to user‑facing messages.

## P2 — Resilience & Backfill
- [x] **Auth trigger**: add `auth.user().onCreate` to create `users` + `usersPublic` server‑side backup (`functions/src/index.js`).
- [x] **Legacy backfill**: on login, if `usersPublic` missing but `users` exists, create `usersPublic`.

## P2 — QA / Validation
- [ ] **Manual test matrix**: verify each scenario in the design doc (email/password signup, Google signup, linking, reset, calendar linking, verification banner).
- [ ] **Rules check**: validate Firestore rules with emulator or rules unit tests (if available).
- [ ] **Smoke test**: confirm Discord linking and existing calendar linking still work.

## P3 — Documentation
- [x] **Update task list**: mark progress with notes as each phase completes.
- [x] **Docs**: update `docs/decisions.md` with any decisions (soft‑block vs server‑side enforcement).
- [x] **Runbook**: add notes for new auth flows and callable function in `docs/runbook.md`.
