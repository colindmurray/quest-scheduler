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
- 2026-01-30: Replaced Radix dropdown menus in the app header (account + notifications) with simple popovers to address post-modal navigation freezes.
- 2026-01-30: Stabilized user profile hooks + questing group invite email memoization to prevent continuous re-render loops on groups tab.
- 2026-01-30: Kept Discord interaction ingress warm with `minInstances: 1` to prevent first-click “interaction failed” on vote button.
- 2026-01-30: Added scheduled warmup ping for Discord interactions (`discordWarmup`) and warmup query support to avoid cold-start failures without minInstances.
- 2026-01-30: Added shared calendar navigation + auto-scroll helpers for dashboard and scheduler calendars (jump controls, event highlighting, and smart scroll-to-time).
- 2026-01-30: Enabled auto-scroll re-mount on week/day navigation + jump controls by wiring `enableAutoScroll` and keyed calendars.
- 2026-01-29: Added TS migration protocol to `AGENTS.md`, created `docs/typescript-migration-state.md`, and added `ts-migration-chunk` skill.
- 2026-01-29: Added `docs/typescript_migraiton_plan.md` with a phased, file-by-file TypeScript migration plan.
- 2026-01-29: Allow poll creators to update vote docs for slot removals by permitting limited creator vote updates in Firestore rules.
- 2026-01-29: Add poll descriptions and use them to prefill calendar event details; remove default calendar title/description settings.
- 2026-01-29: Ran `npm --prefix web run test` and `npm --prefix functions run test`; deploy of `functions:cloneSchedulerPoll` blocked with "operation in progress" error.
- 2026-01-29: Move session poll list/calendar view toggle below participants so it sits above the list/calendar block.
- 2026-01-29: Fix finalized dashboard attendance summary to normalize vote values and prevent feasible-only votes from being miscounted as unavailable.
- 2026-01-29: Add questing group Discord alert settings (finalization/reschedule + vote submissions) and wire function-side notification gates.
- 2026-01-29: Include confirmed attendance count in Discord finalization messages; tests run via `npm --prefix functions run test` (warnings: `punycode` deprecation, one integration test skipped).
- 2026-01-29: Add Discord slot-change notifications (default on) with added/removed summaries; tests run via `npm --prefix functions run test` (warnings: `punycode` deprecation, one integration test skipped).
- 2026-01-29: Replace Discord alert toggles with simple switches to avoid settings modal crash on the groups tab.
- 2026-01-29: Replace questing group member-managed toggle with simple switch to avoid settings modal crash.
- 2026-01-29: Replace create-group member-managed toggle with simple switch to avoid settings modal crash.
- 2026-01-29: Swap questing group modals to SimpleModal to avoid React ref loop crashes.
- 2026-01-29: Add attendance summary unit tests and rerun web test suite (40 files, 166 tests).
- 2026-01-29: Built and deployed hosting for attendance summary fix.
- 2026-01-29: Add attendance summary edge-case tests (missing winner/participant map) and rerun web test suite (40 files, 168 tests).
- 2026-01-29: Added `docs/code-health-audit.md` with prioritized code health findings.
- 2026-01-29: Expanded `docs/code-health-audit.md` with a pass-2 core business logic checklist and added findings.
- 2026-01-29: Addressed P1/P2 audit items (centralized Firestore access into data modules, added scheduler data/attendance hooks, extracted Discord worker utils and identifier helpers, added mail queue helper, normalized email utilities) and updated tests; ran `npm --prefix web run test` and `npm --prefix functions run test`.
- 2026-01-29: Expanded functions test coverage (Discord worker branches, error messages, legacy deleteUserAccount errors) and re-ran `npm --prefix functions run test -- --coverage` (overall 80.14%).
- 2026-01-29: Added shared invite validation helper for scheduler flows, normalized poll invite email handling, deduped Discord notification defaults, and documented identifier test vectors; updated `docs/code-health-audit.md`.
- 2026-01-29: Re-ran `npm --prefix web run test` (40 files, 168 tests) and `npm --prefix functions run test` (23 files, 159 tests, 1 skipped); functions tests emitted existing stderr logs and `punycode` deprecation warnings.
- 2026-01-29: Extracted shared scheduler invite panel UI, normalized remaining email lowercasing to `normalizeEmail`, updated server email normalization, and re-ran web/functions tests (all passing; 1 integration test still skipped, deprecation warnings persist).
- 2026-01-29: Split scheduler/dashboard views into smaller components (group select, form header, pending votes/finalize/clone dialogs, pending invite dialog, past sessions section) and normalized remaining email handling; re-ran web/functions tests (all passing; 1 integration test still skipped, deprecation warnings persist).
- 2026-01-29: Extracted remaining scheduler modals into dedicated components (vote, reopen, delete, invite prompt, leave, remove participant, revoke invite) and wired clone dialog to shared invite panel + group select; re-ran web tests (40/168 passing).
- 2026-01-29: Unified dashboard poll cards (pending range + finalized date), added status chips (pending/all votes in/finalized/cancelled/rescheduled/archived), and shared poll-card utils tests. Ran `npm --prefix web run test -- --run web/src/features/dashboard/lib/poll-card-utils.test.js` (no test files found); reran `npm --prefix web run test -- --run src/features/dashboard/lib/poll-card-utils.test.js` (1 file, 6 tests passing).
- 2026-01-29: Fixed dashboard normalizedEmail crash and guarded questingGroupRef in scheduler hook; added `useSchedulerData` hook tests. Ran `npm --prefix web run test -- --run src/features/scheduler/hooks/useSchedulerData.test.js` (1 file, 2 tests passing).
- 2026-01-29: Redeployed hosting after dashboard/scheduler fixes. Ran `npm --prefix web run build` and `firebase deploy --only hosting --project studio-473406021-87ead` (predeploy `npm --prefix web run build:dev`).
- 2026-01-29: Added shared VoteToggle component for scheduler list + dialog, fixed missing import, and added test coverage. Ran `npm --prefix web run test -- --run src/features/scheduler/components/vote-toggle.test.jsx` (1 file, 1 test passing); initial JSX parse error in `.test.js` resolved by renaming to `.test.jsx`.
- 2026-01-29: Redeployed hosting after VoteToggle fix. Ran `npm --prefix web run build` and `firebase deploy --only hosting --project studio-473406021-87ead` (predeploy `npm --prefix web run build:dev`).
- 2026-01-29: Added `VotingAvatarStack` (default max 10) and used it for dashboard pending voters + scheduler list-view vote stacks; updated avatar stack tests. Ran `npm --prefix web run test -- --run src/components/ui/voter-avatars.test.jsx` (1 file, 4 tests passing).
- 2026-01-29: Redeployed hosting after voting avatar stack changes. Ran `npm --prefix web run build` and `firebase deploy --only hosting --project studio-473406021-87ead` (predeploy `npm --prefix web run build:dev`).
- 2026-01-29: Expanded dashboard attendance avatar stacks (confirmed/unavailable/unresponded) to use `VotingAvatarStack` (max 10). Ran `npm --prefix web run test -- --run src/components/ui/voter-avatars.test.jsx` (1 file, 4 tests passing).
- 2026-01-29: Redeployed hosting after dashboard attendance avatar stack update. Ran `npm --prefix web run build` and `firebase deploy --only hosting --project studio-473406021-87ead` (predeploy `npm --prefix web run build:dev`).
- 2026-01-29: Added cancel session flow and dashboard cancelled tab; ran `npm --prefix web run test` (43 files, 178 tests passing) and deployed hosting.
