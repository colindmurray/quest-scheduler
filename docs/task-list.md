# Quest Scheduler — Task List

## Test Plan Execution Checkpoint
- Last Completed: 2026-01-29 — Expanded functions coverage with Discord worker branch tests, error-message coverage, and legacy deleteUserAccount failure paths. Re-ran `npm --prefix functions run test -- --coverage` (overall 80.14%; worker 82.13; legacy 72.94; triggers 80.3).
- Next Step: Continue lifting legacy.js and oauth.js coverage (still below 80%) and consider un-skipping the worker integration test by running the emulator suite.
- Open Issues: Vitest run still emits `punycode` deprecation warnings; one worker integration test remains skipped.
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
- 2026-01-29: Added `docs/typescript_migraiton_plan.md` with a phased, file-by-file TypeScript migration plan.
- 2026-01-29: Allow poll creators to update vote docs for slot removals by permitting limited creator vote updates in Firestore rules.
- 2026-01-29: Add poll descriptions and use them to prefill calendar event details; remove default calendar title/description settings.
- 2026-01-29: Ran `npm --prefix web run test` and `npm --prefix functions run test`; deploy of `functions:cloneSchedulerPoll` blocked with "operation in progress" error.
- 2026-01-29: Move session poll list/calendar view toggle below participants so it sits above the list/calendar block.
- 2026-01-29: Fix finalized dashboard attendance summary to normalize vote values and prevent feasible-only votes from being miscounted as unavailable.
- 2026-01-29: Add questing group Discord alert settings (finalization/reschedule + vote submissions) and wire function-side notification gates.
- 2026-01-29: Include confirmed attendance count in Discord finalization messages; tests run via `npm --prefix functions run test` (warnings: `punycode` deprecation, one integration test skipped).
- 2026-01-29: Add Discord slot-change notifications (default on) with added/removed summaries; tests run via `npm --prefix functions run test` (warnings: `punycode` deprecation, one integration test skipped).
- 2026-01-29: Add attendance summary unit tests and rerun web test suite (40 files, 166 tests).
- 2026-01-29: Built and deployed hosting for attendance summary fix.
- 2026-01-29: Add attendance summary edge-case tests (missing winner/participant map) and rerun web test suite (40 files, 168 tests).
- 2026-01-29: Added `docs/code-health-audit.md` with prioritized code health findings.
- 2026-01-29: Expanded `docs/code-health-audit.md` with a pass-2 core business logic checklist and added findings.
- 2026-01-29: Expanded functions test coverage (Discord worker branches, error messages, legacy deleteUserAccount errors) and re-ran `npm --prefix functions run test -- --coverage` (overall 80.14%).
