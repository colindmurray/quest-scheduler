# Quest Scheduler — Task List

## Test Plan Execution Checkpoint
- Last Completed: 2026-01-29 — Expanded functions coverage (Discord worker handlers/votes, legacy callables/helpers, scheduler triggers). Added functions coverage config to focus on `functions/src` and re-ran `npm --prefix functions run test -- --coverage` (overall 60.85%; legacy 51.05; triggers 74.3).
- Next Step: Continue raising legacy coverage (block/unblock, poll invites edge cases, google calendar flows) and improve OAuth/discord-client coverage toward 70%+.
- Open Issues: Vitest run still emits `punycode` deprecation warnings and firebase-functions update warning; one worker integration test remains skipped.
- Last Updated (YYYY-MM-DD): 2026-01-29

## Automated Testing Overhaul (Unit / Integration / E2E)
### P0 — Foundations + Critical Coverage
- [x] 2026-01-28: Add `web/vitest.config.js` with jsdom, setup file, and coverage reporting.
- [x] 2026-01-28: Create `web/src/__tests__/setup.js` for RTL cleanup + Firebase module mocks.
- [x] 2026-01-28: Install web test deps: `@testing-library/react`, `@testing-library/jest-dom`, `msw`, `@playwright/test`.
- [x] 2026-01-28: Add Firebase Emulator config in `firebase.json` (auth, firestore, storage, functions) + npm scripts.
- [x] 2026-01-28: Add Firestore + Storage rules tests with `@firebase/rules-unit-testing` (tests run with JDK 21).
- [x] 2026-01-28: Add unit tests for `web/src/lib/identifiers.js` and `web/src/lib/identity.js`.
- [x] 2026-01-28: Add unit tests for `web/src/lib/auth.js` (Google + Discord token flows).
- [x] 2026-01-28: Add unit tests for new data modules (`pollInvites`, `blocks`, `discord`, `usernames`).
- [x] 2026-01-28: Add Playwright E2E scaffold + critical flows (Discord + UID-only polling) (12/12 passing with emulator + seed).

### P1 — Functions + Hooks
- [x] 2026-01-28: Add `vitest` + `firebase-functions-test` to `functions/package.json` with `functions/vitest.config.js`.
- [x] 2026-01-28: Add Cloud Functions unit tests for Discord modules (oauth, worker, link-codes, nudge, roles) (1 skipped: roles mapping needs bot token/REST stub).
- [x] 2026-01-28: Add tests for legacy callables in `functions/src/legacy.js`.
- [x] 2026-01-28: Add hook tests in `web/src/hooks/` (useUserSettings, useQuestingGroups, usePollInvites, useBlockedUsers).

### P2 — UI Components
- [x] 2026-01-28: Add RTL component tests for Settings + Auth UI surfaces (`AuthPage`, `SettingsPage`).

## Progress Notes
- 2026-01-29: Allow poll creators to update vote docs for slot removals by permitting limited creator vote updates in Firestore rules.
