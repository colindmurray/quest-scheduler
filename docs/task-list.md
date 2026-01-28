# Quest Scheduler — Task List

## Test Plan Execution Checkpoint
- Last Completed: 2026-01-28 — Ran `npm run test:rules` successfully after JDK 21 install; addressed npm audit advisories (web + functions).
- Next Step: Awaiting user action for system-level Playwright deps or any further tasks.
- Open Issues: Playwright system deps still require sudo (`npx playwright install-deps`). Functions tests emit firebase secret warnings; roles mapping test skipped (needs bot token/REST stubbing). Worker tests log expected warnings on missing secrets. `firebase-tools` emits `punycode` deprecation warnings during emulator runs.
- Last Updated (YYYY-MM-DD): 2026-01-28

## Automated Testing Overhaul (Unit / Integration / E2E)
### P0 — Foundations + Critical Coverage
- [x] 2026-01-28: Add `web/vitest.config.js` with jsdom, setup file, and coverage reporting.
- [x] 2026-01-28: Create `web/src/__tests__/setup.js` for RTL cleanup + Firebase module mocks.
- [x] 2026-01-28: Install web test deps: `@testing-library/react`, `@testing-library/jest-dom`, `msw`, `@playwright/test`.
- [x] 2026-01-28: Add Firebase Emulator config in `firebase.json` (auth, firestore, storage, functions) + npm scripts.
- [x] 2026-01-28: Add Firestore + Storage rules tests with `@firebase/rules-unit-testing` (test run blocked: firebase-tools requires JDK 21+).
- [x] 2026-01-28: Add unit tests for `web/src/lib/identifiers.js` and `web/src/lib/identity.js`.
- [x] 2026-01-28: Add unit tests for `web/src/lib/auth.js` (Google + Discord token flows).
- [x] 2026-01-28: Add unit tests for new data modules (`pollInvites`, `blocks`, `discord`, `usernames`).
- [x] 2026-01-28: Add Playwright E2E scaffold + critical flows (Discord + UID-only polling) (6 skipped: OAuth + UID poll need emulator/test creds).

### P1 — Functions + Hooks
- [x] 2026-01-28: Add `vitest` + `firebase-functions-test` to `functions/package.json` with `functions/vitest.config.js`.
- [x] 2026-01-28: Add Cloud Functions unit tests for Discord modules (oauth, worker, link-codes, nudge, roles) (1 skipped: roles mapping needs bot token/REST stub).
- [x] 2026-01-28: Add tests for legacy callables in `functions/src/legacy.js`.
- [x] 2026-01-28: Add hook tests in `web/src/hooks/` (useUserSettings, useQuestingGroups, usePollInvites, useBlockedUsers).

### P2 — UI Components
- [x] 2026-01-28: Add RTL component tests for Settings + Auth UI surfaces (`AuthPage`, `SettingsPage`).
