# Quest Scheduler — Task List

## Test Plan Execution Checkpoint
- Last Completed: 2026-01-28 — Added Firestore + Storage rules tests/config; `npm run test:rules` blocked by Firebase CLI JDK 21 requirement.
- Next Step: Add unit tests for `web/src/lib/identifiers.js` and `web/src/lib/identity.js`.
- Open Issues: `npm run test:rules` failed — firebase-tools requires JDK 21+. `npm install` reported 4 vulnerabilities (3 moderate, 1 high) — run audit once test plan allows.
- Last Updated (YYYY-MM-DD): 2026-01-28

## Automated Testing Overhaul (Unit / Integration / E2E)
### P0 — Foundations + Critical Coverage
- [x] 2026-01-28: Add `web/vitest.config.js` with jsdom, setup file, and coverage reporting.
- [x] 2026-01-28: Create `web/src/__tests__/setup.js` for RTL cleanup + Firebase module mocks.
- [x] 2026-01-28: Install web test deps: `@testing-library/react`, `@testing-library/jest-dom`, `msw`, `@playwright/test`.
- [x] 2026-01-28: Add Firebase Emulator config in `firebase.json` (auth, firestore, storage, functions) + npm scripts.
- [x] 2026-01-28: Add Firestore + Storage rules tests with `@firebase/rules-unit-testing` (test run blocked: firebase-tools requires JDK 21+).
- [ ] Add unit tests for `web/src/lib/identifiers.js` and `web/src/lib/identity.js`.
- [ ] Add unit tests for `web/src/lib/auth.js` (Google + Discord token flows).
- [ ] Add unit tests for new data modules (`pollInvites`, `blocks`, `discord`, `usernames`).
- [ ] Add Playwright E2E scaffold + critical flows (Discord + UID-only polling).

### P1 — Functions + Hooks
- [ ] Add `vitest` + `firebase-functions-test` to `functions/package.json` with `functions/vitest.config.js`.
- [ ] Add Cloud Functions unit tests for Discord modules (oauth, worker, link-codes, nudge, roles).
- [ ] Add tests for legacy callables in `functions/src/legacy.js`.
- [ ] Add hook tests in `web/src/hooks/` (useUserSettings, useQuestingGroups, usePollInvites, useBlockedUsers, etc.).

### P2 — UI Components
- [ ] Add RTL component tests for Settings + Auth UI surfaces.
