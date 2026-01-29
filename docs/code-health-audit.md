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
- [P1] Fix incorrect `HttpsError` reference in `functions/src/discord/nudge.js`. The code throws `functions.https.functions.https.HttpsError` (double namespace typo), which will throw a runtime `TypeError` instead of a proper Firebase error for unauthenticated/missing input cases.
  - Evidence: `functions/src/discord/nudge.js:53,58` (early guard clauses). The correct pattern `functions.https.HttpsError` is used later in the same file (lines 68, 75, 84, 97), confirming this is a typo.

- [P1] Centralize Firestore reads/writes per repo conventions. Direct Firestore usage is scattered across UI and hooks, making behavior hard to test and refactor and violating `src/lib/data` guidance. Move Firestore access to `web/src/lib/data/*` and consume via hooks.
  - Evidence: `web/src/features/dashboard/DashboardPage.jsx:130-163` (constructs `onSnapshot` listeners directly in component with chunking logic), `web/src/features/scheduler/CreateSchedulerPage.jsx:393-431` (inline `setDoc` to mail collection), `web/src/features/scheduler/SchedulerPage.jsx`, `web/src/features/settings/SettingsPage.jsx`, `web/src/app/AuthProvider.jsx`, `web/src/hooks/useUserProfiles.js`, `web/src/hooks/useUserSettings.js`, `web/src/hooks/useQuestingGroups.js`.
  - Suggested work: Create data modules (ex: `lib/data/schedulers`, `lib/data/settings`, `lib/data/dashboard`) and migrate queries/mutations.

- [P1] Split the scheduler pages into smaller, testable modules/hooks. Both scheduler pages are monolithic (thousands of lines) with UI, data access, and business rules interleaved. This increases regression risk and makes unit testing difficult.
  - Evidence: `web/src/features/scheduler/SchedulerPage.jsx` (~2839 LOC), `web/src/features/scheduler/CreateSchedulerPage.jsx` (~1451 LOC).
  - Suggested work: Extract hooks like `useSchedulerData`, `useSchedulerInvites`, `useSchedulerVotes`, `useSchedulerCalendar`, and split UI into components (slots list, invite manager, calendar panel, finalize modal, clone modal, etc.).

- [P1] Fix and centralize email normalization. There are many `normalizeEmail` implementations with inconsistent null safety. `CreateSchedulerPage.jsx:60-62` uses `value.trim().toLowerCase()` which will crash on null/undefined values.
  - Evidence: `web/src/features/scheduler/SchedulerPage.jsx`, `web/src/features/scheduler/CreateSchedulerPage.jsx:60-62`, `web/src/features/auth/AuthPage.jsx` (local `normalizeEmail`); contrast with safer variants in `web/src/lib/auth.js`, `web/src/lib/data/users.js:15-17`, `web/src/lib/identifiers.js:12-14`, `functions/src/legacy.js:43-45`, `functions/src/discord/worker.js:323-325`.
  - Suggested work: Add a shared `normalizeEmail` helper (client: `web/src/lib/utils.js`, server: `functions/src/utils/email.js`) and replace inline implementations.

- [P1] Missing null check in `acceptPollInvite`. `web/src/lib/data/pollInvites.js:59` uses `userEmail.toLowerCase()` directly without null safety, which will crash if `userEmail` is undefined.
  - Suggested work: Use the centralized `normalizeEmail` pattern once created.

### P2 (Medium)
- [P2] Consolidate identifier parsing/validation rules between client and server. There are multiple sources of truth (`web/src/lib/identifiers.js`, `functions/src/legacy.js`, and inline helpers in Discord worker) that can drift and cause inconsistent behavior.
  - Evidence: `web/src/lib/identifiers.js:4-6` and `functions/src/legacy.js:17-20` both define identical regex constants (`DISCORD_USERNAME_REGEX`, `LEGACY_DISCORD_TAG_REGEX`, `DISCORD_ID_REGEX`). `functions/src/discord/worker.js:323-325` has a simpler `normalizeEmail` only.
  - Suggested work: Define shared test vectors + documentation in `docs/decisions.md`, or extract shared helpers where feasible.

- [P2] Extract a shared mail-queue helper. Multiple features enqueue emails by calling `setDoc(doc(collection(db, "mail")))` with ad-hoc try/catch blocks. This should be centralized to reduce duplication and ensure consistent error handling.
  - Evidence: `web/src/lib/data/friends.js`, `web/src/hooks/useQuestingGroups.js`, `web/src/features/scheduler/CreateSchedulerPage.jsx`, `web/src/features/scheduler/SchedulerPage.jsx`.
  - Suggested work: Add `web/src/lib/data/mail.js` with `queueMail({ to, message })`, use everywhere.

- [P2] Consolidate invite + participant resolution logic duplicated across scheduler flows. Both scheduler pages rebuild email/ID resolution, pending invite diffing, and recommended invite logic.
  - Evidence: `web/src/features/scheduler/CreateSchedulerPage.jsx`, `web/src/features/scheduler/SchedulerPage.jsx`.
  - Suggested work: Create a shared hook/util (`useInviteResolution`, `buildParticipantMaps`) used by both pages.

- [P2] Split `SettingsPage` and `DashboardPage` into smaller components and move data handlers into hooks. These files mix UI with networking/storage/auth workflows, which makes them brittle and hard to test.
  - Evidence: `web/src/features/settings/SettingsPage.jsx` (large multi-domain component), `web/src/features/dashboard/DashboardPage.jsx` (mixes UI, polling, Firestore subscriptions, and derived state).

- [P2] Break up monolithic Cloud Function modules. `functions/src/legacy.js` and `functions/src/discord/worker.js` are large, catch-all modules with mixed responsibilities.
  - Evidence: `functions/src/legacy.js` (~2261 LOC) mixes Google Calendar OAuth, Friend Requests, Poll Invites, Blocking, and Username Registration. `functions/src/discord/worker.js` (~1150 LOC) handles all interaction types.
  - Suggested work: Split by domain (friend requests, poll invites, calendar sync, discord voting) and co-locate helpers with their callables/triggers.

- [P2] Duplicate `DISCORD_NOTIFICATION_DEFAULTS` constant. The same object is defined identically in two places.
  - Evidence: `functions/src/discord/worker.js:29-33` and `functions/src/triggers/scheduler.js:95-99`.
  - Suggested work: Move to `functions/src/discord/config.js` and import from both locations.

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
