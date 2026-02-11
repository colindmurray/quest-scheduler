---
created: 2026-01-29
lastUpdated: 2026-01-31
summary: "Repository code health audit listing structural risks, refactor opportunities, and prioritized remediation tasks."
category: REFERENCE
status: STALE
note: "Audit reflects point-in-time findings and should be re-audited before using as a current backlog source."
changelog:
  - "2026-01-31: Improve invite flows, notifications, and tests"
  - "2026-01-29: Chore: consolidate audit/docs and recent updates"
---

> [!WARNING]
> This document is marked **stale**. Verify against current code and newer docs before relying on it.

# Code Health Audit

Date: 2026-01-29

## Scope
- Focused scan of `web/src` (features, hooks, lib) and `functions/src` (legacy + discord + triggers), plus runtime scripts.
- Emphasis on dead code, duplicated inline logic, refactor risks, and serious code smells.

## Findings / Tasks

## Core Business Logic Audit Task List (Pass 2)

### Web
- [x] `web/src/lib/auth.js`
- [x] `web/src/lib/identifiers.js`
- [x] `web/src/lib/identity.js`
- [x] `web/src/lib/emailTemplates.js`
- [x] `web/src/lib/utils.js`
- [x] `web/src/lib/data/blocks.js`
- [x] `web/src/lib/data/discord.js`
- [x] `web/src/lib/data/friends.js`
- [x] `web/src/lib/data/notifications.js`
- [x] `web/src/lib/data/pollInvites.js`
- [x] `web/src/lib/data/questingGroups.js`
- [x] `web/src/lib/data/schedulers.js`
- [x] `web/src/lib/data/usernames.js`
- [x] `web/src/lib/data/users.js`
- [x] `web/src/hooks/useFirestoreDoc.js`
- [x] `web/src/hooks/useFirestoreCollection.js`
- [x] `web/src/hooks/useUserProfiles.js`
- [x] `web/src/hooks/useUserSettings.js`
- [x] `web/src/hooks/useQuestingGroups.js`
- [x] `web/src/hooks/useFriends.js`
- [x] `web/src/hooks/usePollInvites.js`
- [x] `web/src/hooks/useBlockedUsers.js`
- [x] `web/src/hooks/useNotifications.js`
- [x] `web/src/hooks/useNotificationSync.js`
- [x] `web/src/app/AuthProvider.jsx`
- [x] `web/src/features/scheduler/CreateSchedulerPage.jsx`
- [x] `web/src/features/scheduler/SchedulerPage.jsx`
- [x] `web/src/features/dashboard/lib/attendance.js`
- [x] `web/src/features/settings/SettingsPage.jsx`

### Functions
- [x] `functions/src/index.js`
- [x] `functions/src/auth.js`
- [x] `functions/src/legacy.js`
- [x] `functions/src/triggers/scheduler.js`
- [x] `functions/src/discord/config.js`
- [x] `functions/src/discord/discord-client.js`
- [x] `functions/src/discord/error-messages.js`
- [x] `functions/src/discord/ingress.js`
- [x] `functions/src/discord/link-codes.js`
- [x] `functions/src/discord/link-utils.js`
- [x] `functions/src/discord/nudge.js`
- [x] `functions/src/discord/oauth.js`
- [x] `functions/src/discord/poll-card.js`
- [x] `functions/src/discord/roles.js`
- [x] `functions/src/discord/unlink.js`
- [x] `functions/src/discord/worker.js`

### P0 (Must Fix)
- None found during this pass.

### P1 (High)
- [P1][done] Fix incorrect `HttpsError` reference in `functions/src/discord/nudge.js`. The code threw `functions.https.functions.https.HttpsError` (double namespace typo), which caused a runtime `TypeError` instead of a proper Firebase error.
  - Evidence: `functions/src/discord/nudge.js:53,58` (early guard clauses). Updated to use `functions.https.HttpsError` consistently.

- [P1][done] Centralize Firestore reads/writes per repo conventions. Direct Firestore usage was scattered across UI and hooks. Added data modules and hooks for schedulers, settings, bans, users, and mail queueing; components now consume these helpers.
  - Evidence: `web/src/lib/data/schedulers.js`, `web/src/lib/data/settings.js`, `web/src/lib/data/bans.js`, `web/src/lib/data/mail.js`, `web/src/hooks/useSchedulers.js`, `web/src/features/scheduler/hooks/*`, `web/src/features/dashboard/hooks/useSchedulerAttendance.js`.

- [P1][done] Split the scheduler pages into smaller, testable modules/hooks. Data-fetching and business logic now live in reusable hooks, with shared invite validation extracted.
  - Evidence: `web/src/features/scheduler/hooks/useSchedulerData.js`, `web/src/features/scheduler/hooks/useSchedulerEditorData.js`, `web/src/features/scheduler/utils/invite-utils.js`.
  - Note: UI component extraction is still a future improvement, but data logic is now testable in isolation.

- [P1][done] Centralize email normalization with null safety. Shared helpers are used across client and server and inline implementations were removed in key flows.
  - Evidence: `web/src/lib/utils.js` (`normalizeEmail`), `functions/src/utils/email.js`, updated usage in auth/scheduler/mail flows.

- [P1][done] Add null safety in poll invite acceptance/decline paths.
  - Evidence: `web/src/lib/data/pollInvites.js` now uses `normalizeEmail` and guards for missing emails.

### P2 (Medium)
- [P2][done] Consolidate identifier parsing/validation rules between client and server by extracting shared helpers on the functions side and documenting test vectors.
  - Evidence: `functions/src/utils/identifiers.js` + `docs/decisions.md` “Identifier Parsing Test Vectors”.

- [P2][done] Extract a shared mail-queue helper.
  - Evidence: `web/src/lib/data/mail.js` used by friends, questing groups, and scheduler flows.

- [P2][done] Consolidate invite validation logic across scheduler flows.
  - Evidence: `web/src/features/scheduler/utils/invite-utils.js` shared by `CreateSchedulerPage.jsx` and `SchedulerPage.jsx`.

- [P2][done] Split data handlers out of `SettingsPage` and `DashboardPage` into hooks/modules to improve testability.
  - Evidence: `web/src/lib/data/settings.js`, `web/src/features/dashboard/hooks/useSchedulerAttendance.js`, `web/src/hooks/useSchedulers.js`, updated page components.

- [P2][done] Begin breaking up monolithic Cloud Function modules by extracting shared helpers (identifiers + Discord worker utilities).
  - Evidence: `functions/src/utils/identifiers.js`, `functions/src/discord/worker-utils.js`.

- [P2][done] Deduplicate `DISCORD_NOTIFICATION_DEFAULTS` by moving to `functions/src/discord/config.js`.

### P3 (Low)
- [P3] Add cancellation / staleness guards in async hooks to avoid setting state after unmount or applying stale results when inputs change quickly.
  - Evidence: `web/src/hooks/useUserProfiles.js:27-67` (async `fetchProfiles` with no cleanup), `web/src/hooks/useUserProfilesByIds:122-163` (same issue), `web/src/app/AuthProvider.jsx` (async `onAuthStateChanged` flow), `web/src/features/settings/SettingsPage.jsx` (`getDoc` flow).
  - Suggested work: Track `active` flag or use `AbortController`, and bail out before setting state.

- [P3] DRY up chunking logic for Firestore `in` queries (30-item limit). The same chunking loop appears in multiple places.
  - Evidence: `web/src/hooks/useUserProfiles.js:31-34`, `web/src/lib/data/users.js:44-48`, `web/src/features/dashboard/DashboardPage.jsx:60-66` (has local `chunkArray` helper that should be extracted), `functions/src/legacy.js:146-149`.
  - Suggested work: Create a helper such as `chunkArray` or `chunkInQuery` in `web/src/lib/utils.js` and reuse. Note: `DashboardPage.jsx` already has a `chunkArray` helper at lines 60-66 that can be moved.

- [P3] Inconsistent Firestore `in` query chunk sizes. Some places use `30` (correct limit), others use `10`.
  - Evidence: `functions/src/discord/nudge.js:156` uses `10`, `functions/src/legacy.js:411` uses `10`, `web/src/lib/data/users.js:46` uses `30`, `web/src/hooks/useUserProfiles.js:32` uses `30`.
  - Suggested work: Define a constant `FIRESTORE_IN_QUERY_LIMIT = 30` and use consistently. The smaller chunk sizes may be intentional for rate limiting, but should be documented.

- [P3] Reset `error` on query changes in `useFirestoreDoc` / `useFirestoreCollection` to avoid stale errors leaking across refs.
  - Evidence: `web/src/hooks/useFirestoreDoc.js:7,21-23` and `web/src/hooks/useFirestoreCollection.js:7,21-23` - `error` is set on snapshot failure but never cleared when `docRef`/`queryRef` changes. The effect should reset `setError(null)` at the start.

### P4 (Nitpicks)
- [P4] Minor formatting / readability cleanup: `web/src/App.jsx` route indentation is inconsistent, making diffs noisier for future edits.

- [P4] Unused variable assignments in `worker.js`. `userEmail` is assigned but unused in some handler paths.
  - Evidence: `functions/src/discord/worker.js:525,787,912` - assigns `userEmail` from `linkedUser.email` but doesn't always use it.
  - Note: May be intentional for future use or logging; verify before removing.

## Potential Dead Code Candidates (Needs Verification)
- Migration/one-off scripts in `functions/scripts/` (ex: `migrate-allow-link-sharing.js`, `migrate-uuid-identifiers.js`). If these have been executed and are no longer needed, consider archiving them under `docs/` or removing to reduce repo noise.
- "Legacy" Cloud Functions in `functions/src/legacy.js` are still exported from `functions/src/index.js`, so they are not dead but may include deprecated endpoints. Audit actual usage before removing.

## Notes
- No definitive dead runtime code was identified; most files are referenced by routes/tests or exported by the functions index.
- The highest-impact improvements are structural (centralized data access + splitting monoliths) and will improve testability and correctness.
- `SchedulerPage.jsx` is extremely large (file exceeds 25k tokens, estimated ~2800+ lines based on 30+ useState hooks in first 150 lines alone).
- The `nudge.js` HttpsError bug (P1) is a single-line fix with high impact - recommend fixing immediately.
- Similar slot sorting/filtering logic exists in both `scheduler.js` triggers (lines 136-157) and `worker.js` (lines 536-539); could be extracted to shared helper if refactoring worker.js.
