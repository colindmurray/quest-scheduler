---
created: 2026-02-12
lastUpdated: 2026-02-12
summary: "Second-pass code health audit focused on duplication, reliability risks, dead code, test gaps, and composability/extensibility."
category: REFERENCE
status: CURRENT
---

# Code Health Audit (Pt 2)

Date: 2026-02-12

## Scope and Method
- Audited `web/src`, `functions/src`, and selected test/config/script files.
- Evidence sources:
  - `jscpd` clone scan (`29` clones, `~1.94%` duplicated lines over JS/JSX scanned set).
  - `knip` unused file/export/dependency scan (run separately in `web/` and `functions/`).
  - targeted `rg` queries for repeated patterns and risky constructs.
  - file-size and test-gap scripts for hotspot detection.

## Findings (Prioritized)

## P1 High

1. Monolithic modules create high change risk and low composability.
- Evidence:
  - `web/src/features/scheduler/SchedulerPage.jsx` (~3706 lines, 70 `useState` calls).
  - `web/src/features/dashboard/DashboardPage.jsx` (~1930 lines, 21 `useState` calls).
  - `functions/src/discord/worker.js` (~2642 lines).
  - `functions/src/legacy.js` (~2826 lines).
- Impact:
  - Hard to reason about side effects, brittle refactors, higher regression risk, slower onboarding.
- Recommendation:
  - Split by bounded contexts: data hooks/services, command handlers, and presentational components.
  - For Discord worker, extract command modules (`poll-create`, `vote`, `link-group`, etc.) with shared helpers.

2. Poll vote validity logic is duplicated across client/server/triggers and can drift.
- Evidence:
  - `web/src/lib/data/basicPolls.js:112`
  - `functions/src/basic-polls/callables.js:34`
  - `functions/src/basic-polls/required-summary.js:8`
  - `functions/src/triggers/basic-polls.js:50`
  - `functions/src/triggers/basic-poll-card.js:40`
  - `web/src/features/dashboard/components/group-basic-poll-modal.jsx:50`
- Impact:
  - One bug fix may land in one layer but not others, causing inconsistent vote counts/results/notifications.
- Recommendation:
  - Canonicalize vote-validation helpers in one shared module per runtime boundary (or generated shared package), then consume everywhere.

3. UI form logic for general poll and embedded poll editor still has significant duplication.
- Evidence (`jscpd`):
  - `web/src/features/basic-polls/components/CreateGroupPollModal.jsx:628`
  - `web/src/features/scheduler/components/EmbeddedPollEditorModal.jsx:386`
  - Additional clone blocks at `CreateGroupPollModal.jsx:166`, `:746`, `:829` with matching `EmbeddedPollEditorModal.jsx` ranges.
- Impact:
  - Feature drift risk between standalone and embedded poll edit/create experiences.
- Recommendation:
  - Extract a shared `PollEditorForm` core (state + validation + option editing + deadline controls), with thin wrappers for standalone vs embedded context.

4. Navigation fallback hack is duplicated in many components.
- Evidence:
  - `web/src/components/polls/basic-poll-card.jsx:85`
  - `web/src/features/dashboard/components/SessionCard.jsx:72`
  - `web/src/features/dashboard/components/NextSessionCard.jsx:38`
  - `web/src/features/dashboard/components/MobileAgendaView.jsx:66`
  - `web/src/features/dashboard/components/DashboardCalendar.jsx:149`
  - `web/src/features/dashboard/DashboardPage.jsx:1197`
- Pattern:
  - `navigate(target)` then `setTimeout(...window.location.assign(target))`.
- Impact:
  - Repeated workaround logic, fragile timing behavior, hard-to-debug edge cases.
- Recommendation:
  - Centralize in `useSafeNavigate` helper/hook with explicit fallback policy and shared tests.

## P2 Medium

5. Multiple duplicated `toDate` implementations (and related date coercion logic).
- Evidence:
  - `web/src/lib/time.js:5`
  - `web/src/lib/data/basicPolls.js:68`
  - `web/src/features/dashboard/DashboardPage.jsx:49`
  - `web/src/features/dashboard/components/group-basic-poll-modal.jsx:30`
  - `web/src/features/basic-polls/components/CreateGroupPollModal.jsx:32`
  - `web/src/components/polls/basic-poll-voting-card.jsx:4`
  - `functions/src/discord/time-utils.js:3`
- Impact:
  - Subtle inconsistencies in date coercion and null handling.
- Recommendation:
  - Add shared date coercion helpers (`coerceDate`, `coerceTimestamp`) in one module per runtime and reuse.

6. Notification metadata/routing helpers duplicated across notification router/reconcile paths.
- Evidence (`jscpd` + source):
  - `functions/src/notifications/router.js:22` (`buildMetadata`, `hashEmail` path logic)
  - `functions/src/notifications/reconcile.js:14` (same patterns)
- Impact:
  - Divergence risk in notification metadata shape and pending-notification reconciliation.
- Recommendation:
  - Move shared helpers into `functions/src/notifications/shared.js`.

7. Client and server notification event constant sets are duplicated.
- Evidence:
  - `web/src/lib/data/notifications.js:35` (`NOTIFICATION_TYPES`)
  - `functions/src/notifications/constants.js:1` (`NOTIFICATION_EVENTS`)
- Impact:
  - Silent drift risk when adding or renaming event types.
- Recommendation:
  - Generate shared constants from one source (or add strict parity test that compares both sets).

8. Stale error state risk in Firestore subscription hooks.
- Evidence:
  - `web/src/hooks/useFirestoreDoc.js`
  - `web/src/hooks/useFirestoreCollection.js`
- Issue:
  - `error` is set on snapshot failure but not reset when `docRef/queryRef` changes.
- Impact:
  - UI can display stale errors for fresh refs.
- Recommendation:
  - Reset `error` at effect start when ref changes.

9. Destructive actions rely on `window.confirm` instead of app-styled, testable dialogs.
- Evidence:
  - `web/src/features/dashboard/DashboardPage.jsx:1162`
  - `web/src/features/dashboard/components/group-basic-poll-modal.jsx:412`
- Impact:
  - Inconsistent UX, lower accessibility, poor automation ergonomics.
- Recommendation:
  - Replace with shared dialog component (`AlertDialog`/existing modal primitives).

## P3 Low / Hygiene

10. Dead or orphaned files detected.
- Evidence (no in-repo references):
  - `web/src/features/dashboard/components/pending-invite-dialog.jsx`
  - `web/src/lib/data/mail.js`
  - `web/src/lib/emailTemplates.js`
  - `functions/src/notifications/rules.js`
- Recommendation:
  - Remove or archive after one final runtime usage check.

11. Dependency hygiene: unused dependencies in web package.
- Evidence (`knip` in `web/`):
  - unused deps: `@hookform/resolvers`, `@react-oauth/google`, `framer-motion`, `react-hook-form`, `zod`
  - unused dev deps: `@testing-library/jest-dom`, `msw`
- Note:
  - Some may be intentionally staged for upcoming work.
- Recommendation:
  - Either remove now or immediately adopt in planned refactors (see below).

12. Large areas have no dedicated component/unit tests (rely on indirect coverage).
- Evidence (size + no direct test file naming match):
  - `web/src/features/scheduler/SchedulerPage.jsx`
  - `web/src/features/scheduler/CreateSchedulerPage.jsx`
  - `web/src/features/friends/FriendsPage.jsx`
  - `web/src/features/dashboard/components/group-basic-poll-modal.jsx`
  - `web/src/components/polls/basic-poll-voting-card.jsx`
  - `web/src/features/dashboard/components/DashboardCalendar.jsx`
  - `web/src/hooks/useCalendarNavigation.js`
- Recommendation:
  - Add targeted tests for extracted hooks/components as monoliths are split.

## 3rd-Party Library Opportunities

1. Form state/validation modernization (high ROI).
- Current state: large bespoke state machines in poll/scheduler forms.
- Candidate: `react-hook-form` + `zod` (already installed but unused).
- Benefit: declarative validation, fewer ad hoc validators, easier testability, cleaner controlled/uncontrolled input handling.

2. Natural language/duration parsing for Discord deadline input (medium ROI).
- Current state: hand-rolled parser in `functions/src/discord/worker.js:604` (`d/w` regex + `Date` constructor fallback).
- Candidate: `ms` (durations) and/or `chrono-node` (date parsing with clearer constraints).
- Benefit: more robust parsing and fewer locale/timestamp edge cases.

3. Replace browser-native confirms with accessible dialog primitives (already in stack).
- Candidate: shared `AlertDialog` built on Radix primitives.
- Benefit: consistent UX, better accessibility, deterministic e2e interaction.

## Suggested Execution Order

1. Remove confirmed dead files and clean unused dependencies.
2. Extract shared helpers for:
   - safe navigation fallback
   - vote-submission normalization
   - date coercion
   - notification shared metadata/hash logic
3. Break up highest-risk monoliths (`SchedulerPage`, `DashboardPage`, Discord worker).
4. Adopt `react-hook-form` + `zod` in poll editor flows.
5. Backfill focused tests around extracted hooks/components.

## Notes
- This is a static audit pass; findings should be re-validated after major refactors.
- `knip` reports on Functions exports include known false positives for Firebase-exported handlers because exports are aggregated dynamically in `functions/src/index.js`.
