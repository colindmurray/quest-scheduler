---
created: 2026-02-12
lastUpdated: 2026-02-12
summary: "Execution tracker for remediating findings from docs/code-health-audit-pt2.md."
category: TASK_TRACKER
status: CURRENT
implementationStatus: PLANNED
note: "Companion audit: docs/code-health-audit-pt2.md"
changelog:
  - "2026-02-12: Initial task list created from Code Health Audit (Pt 2) findings."
---

# Code Health Audit (Pt 2) — Task List

## Plan Execution Checkpoint
- Last Completed: Phase 1 complete (removed orphaned files + cleaned unused web dependencies) with full validation gate pass.
- Next Step: Phase 2 helper consolidation (`hasSubmittedVote`, safe navigation fallback, date coercion, notifications shared helpers).
- Open Issues: None.
- Last Updated (YYYY-MM-DD): 2026-02-12

## Working Branch Recommendation
- Branch: `feature/code-health-audit-pt2`

## Validation Gate (Run per phase where relevant)
- `npm --prefix web run test`
- `npm --prefix functions run test`
- `npm --prefix web run test:rules`
- `npm --prefix web run test:integration`
- `npm --prefix web run test:e2e:emulators`
- `npm --prefix web run build`

---

## Phase 1 — Dead Code + Dependency Hygiene

### 1.1 Remove or archive confirmed orphaned files (P1)
- Evaluate and remove/archive:
  - `web/src/features/dashboard/components/pending-invite-dialog.jsx`
  - `web/src/lib/data/mail.js`
  - `web/src/lib/emailTemplates.js`
  - `functions/src/notifications/rules.js`
- Verify there are no runtime imports or script usage dependencies before deletion.

Acceptance:
- Files are removed or explicitly retained with documented rationale in `docs/decisions.md`.
- Tests/build pass after cleanup.

### 1.2 Resolve unused dependency set in web package (P1)
- Review and either remove or adopt:
  - `@hookform/resolvers`, `@react-oauth/google`, `framer-motion`, `react-hook-form`, `zod`
  - dev: `@testing-library/jest-dom`, `msw`
- Ensure package-lock consistency after edits.

Acceptance:
- No unintentional dependency bloat remains.
- `npm --prefix web run test` and `npm --prefix web run build` pass.

---

## Phase 2 — Shared Helper Consolidation (Highest Drift Risk)

### 2.1 Consolidate basic poll vote-submission semantics (P1)
- Extract shared helper(s) for:
  - normalized option/ranking id lists
  - `hasSubmittedVote` semantics across multiple/ranked/write-in modes
- Replace duplicated implementations in:
  - web data layer and modal surfaces
  - functions callables/triggers/summary paths

Acceptance:
- One canonical helper per runtime boundary is reused by all consumers.
- Existing behavior parity preserved with regression tests.

### 2.2 Centralize safe navigation fallback logic (P1)
- Create shared `useSafeNavigate` helper/hook.
- Replace repeated `navigate + setTimeout + window.location.assign` patterns in dashboard/session/basic poll cards.

Acceptance:
- Navigation behavior unchanged from user perspective.
- Duplicated fallback blocks removed from components.

### 2.3 Consolidate date coercion utilities (P2)
- Add shared date coercion helpers (`coerceDate`, `coerceTimestamp` style).
- Replace local `toDate` duplicates across key poll/dashboard components and data utilities.

Acceptance:
- No behavior regressions in deadline/status rendering.
- Reduced duplicate date parsing logic.

### 2.4 Consolidate notification shared helpers (P2)
- Extract shared metadata + email-hash/pending-event helper logic used by:
  - `functions/src/notifications/router.js`
  - `functions/src/notifications/reconcile.js`

Acceptance:
- Shared helper module in place.
- Router and reconcile paths consume it.

---

## Phase 3 — Constant/Contract Consistency

### 3.1 Add notification event parity guard between web/functions (P1)
- Add test/tooling that verifies `web` notification type constants stay in sync with `functions` notification events.
- Fail fast when one side adds/removes an event without the other.

Acceptance:
- CI/local tests detect mismatch immediately.

### 3.2 Introduce poll domain constant modules (P2)
- Define and reuse enums/constants for statuses and vote types where string literals are currently duplicated.
- Prioritize high-touch poll paths first.

Acceptance:
- Core poll flows no longer rely on scattered magic strings.

---

## Phase 4 — Monolith Decomposition (Composability + Extensibility)

### 4.1 Decompose `DashboardPage` into focused hooks/components (P1)
- Extract:
  - general poll action handlers
  - filter state/logic
  - modal orchestration
  - subscription/fetch orchestration

Acceptance:
- `DashboardPage.jsx` reduced materially in size/complexity.
- Behavior parity maintained (tests + manual smoke).

### 4.2 Decompose `SchedulerPage` and `CreateSchedulerPage` (P1)
- Move business logic into hooks/services.
- Split major UI sections into composable, testable components.

Acceptance:
- Large files reduced substantially.
- New units have direct tests.

### 4.3 Decompose Discord worker command handling (P1)
- Split `functions/src/discord/worker.js` into command handlers (poll create/vote/link/admin actions).
- Keep shared utilities centralized.

Acceptance:
- Worker entrypoint coordinates handlers; command modules own behavior.
- Existing command tests pass with minimal fixture changes.

---

## Phase 5 — Under-Tested Surface Backfill

### 5.1 Add focused tests for previously under-tested hotspots (P1)
- Prioritize:
  - `web/src/features/dashboard/components/group-basic-poll-modal.jsx`
  - `web/src/components/polls/basic-poll-voting-card.jsx`
  - `web/src/features/dashboard/components/DashboardCalendar.jsx`
  - `web/src/hooks/useCalendarNavigation.js`
  - extracted scheduler/dashboard hooks from Phases 4.1/4.2

Acceptance:
- Each extracted/critical module has direct unit/integration coverage.

### 5.2 Harden Firestore subscription hook tests for stale error reset (P2)
- Add tests for `useFirestoreDoc` and `useFirestoreCollection` ref changes and error clearing behavior.

Acceptance:
- Stale error state regression prevented by tests.

---

## Phase 6 — UX/Robustness Hygiene

### 6.1 Replace `window.confirm` with shared confirmation dialog (P2)
- Replace in dashboard and general poll modal destructive actions.
- Ensure keyboard/accessibility parity.

Acceptance:
- No native confirm usage remains in core UI flows.
- E2E tests pass with deterministic dialog interaction.

### 6.2 Adopt form library in poll editors (P2)
- Apply `react-hook-form` + `zod` to poll create/edit flows (standalone + embedded shared form).

Acceptance:
- Validation logic is schema-driven.
- Form code is shorter, clearer, and easier to extend.

---

## Phase 7 — Closeout

### 7.1 Re-run full validation and publish outcomes (P1)
- Run full test/build gate and summarize pass/fail + residual risk.

Acceptance:
- All required suites pass.
- Any remaining deferred items are explicitly documented.

### 7.2 Update docs and trackers (P1)
- Update:
  - `docs/code-health-audit-pt2.md` (status refresh + completed items)
  - `docs/task-list.md` (checkpoint/progress notes)
  - `docs/decisions.md` (non-obvious architecture decisions)

Acceptance:
- Documentation and implementation state are aligned.

---

## Progress Notes
- 2026-02-12: Created initial execution tracker from `docs/code-health-audit-pt2.md` with phased workstream, acceptance criteria, and validation gates.
- 2026-02-12: Completed Phase 1 cleanup.
  - Removed orphaned files:
    - `web/src/features/dashboard/components/pending-invite-dialog.jsx`
    - `web/src/lib/data/mail.js`
    - `web/src/lib/emailTemplates.js`
    - `functions/src/notifications/rules.js`
  - Removed unused web dependencies:
    - `@hookform/resolvers`, `@react-oauth/google`, `framer-motion`, `react-hook-form`, `zod`
    - dev: `@testing-library/jest-dom`, `msw`
  - Validation:
    - `npm --prefix web run test` (pass, `327 passed`)
    - `npm --prefix functions run test` (pass, `350 passed`)
    - `npm --prefix web run test:rules` (pass, `21 passed`)
    - `npm --prefix web run test:integration` (pass, `11 passed`)
    - `npm --prefix web run test:e2e:emulators` (pass, `49 passed`, `75 skipped`)
    - `npm --prefix web run build` (pass)
