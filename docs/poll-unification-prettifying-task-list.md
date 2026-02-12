---
created: 2026-02-12
lastUpdated: 2026-02-12
summary: "Execution tracker for poll UX unification and visual polish across session/general polls, including shared Discord sync refactor."
category: TASK_TRACKER
status: CURRENT
implementationStatus: PLANNED
note: "Companion plan: docs/poll-unification-prettifying-plan.md"
changelog:
  - "2026-02-12: Initial task list created with phased execution, acceptance criteria, and validation gates."
---

# Poll Unification + Prettifying — Task List

## Plan Execution Checkpoint
- Last Completed: Phase 1.2 participant summary primitive and Phase 2.2 Discord metadata row parity landed for scheduler/general poll views.
- Next Step: Phase 4.1 shared backend Discord sync helpers and trigger wiring.
- Open Issues: None.
- Last Updated (YYYY-MM-DD): 2026-02-12

## Working Branch Recommendation
- Branch: `feature/poll-unification-prettifying`

## Validation Gate (Apply Per Phase)
- `npm --prefix web run test`
- `npm --prefix functions run test`
- `npm --prefix web run test:rules`
- `npm --prefix web run test:integration`
- `npm --prefix web run test:e2e:emulators`

---

## Phase 1 — Shared Frontend Poll Primitives

### 1.1 Extract shared poll metadata header (P1)
- Create shared component for status/deadline/group/archive metadata.
- Replace duplicated metadata rendering in:
  - scheduler detail surface
  - general poll modal
- Preserve context-specific controls via props/slots.

Acceptance:
- Both contexts use the shared header component.
- Existing statuses and deadline behavior remain correct.

### 1.2 Extract participant summary primitive (P1)
- Create shared participant summary with invitee/voted/pending avatar bubbles.
- Wire into general poll modal and session context without behavior regressions.

Acceptance:
- Avatar bubbles render consistently in both contexts.
- Counts and pending calculations match existing behavior.

### 1.3 Extract markdown content primitive (P1)
- Create shared markdown renderer wrapper for poll descriptions and option notes.
- Replace repeated `ReactMarkdown`+`remarkGfm` wrappers.

Acceptance:
- Markdown styling and behavior unchanged or improved.
- No regression in link rendering/typography.

---

## Phase 2 — General Poll Modal Parity Enhancements

### 2.1 Add rich meta row parity in general poll modal (P1)
- Include status chip, deadline display, group chip/color, archived indicator.

Acceptance:
- General poll modal header has session-like information density.

### 2.2 Add Discord linkage metadata/actions in general poll modal (P1)
- Show posted/sync status when poll has discord metadata.
- Show `View in Discord` when `messageUrl` exists.
- Add repost action if supported by existing backend endpoints.

Acceptance:
- Discord-linked general polls expose linkage metadata in modal.
- Non-linked polls do not show empty placeholder controls.

### 2.3 Add compact participant strip + optional expanded details (P2)
- Add participant summary row by default.
- Add expandable details section for manager/creator where useful.

Acceptance:
- Default modal remains compact.
- Expanded mode provides useful social proof without clutter.

### 2.4 Optional manager live preview for OPEN polls (P2)
- Show provisional results block for open polls (non-final snapshot).

Acceptance:
- Preview clearly labeled provisional.
- Finalized results view remains authoritative.

---

## Phase 3 — Session Poll Refinements

### 3.1 Session description markdown rendering parity (P2)
- Apply shared markdown renderer to scheduler poll description where appropriate.

Acceptance:
- Session description supports styled markdown and links consistently.

### 3.2 Action menu harmonization (P2)
- Align lifecycle action naming/grouping between session/general poll surfaces.

Acceptance:
- Menu semantics feel consistent without losing scheduler-specific actions.

### 3.3 Optional add-on poll completion snapshot in session cards (P3)
- Add compact add-on completion metadata where it helps scanning.

Acceptance:
- Card remains readable; no clutter regression.

---

## Phase 4 — Shared Backend Discord Sync Core

### 4.1 Extract common discord sync helpers (P1)
- Shared queue helper
- Shared message URL builder
- Shared metadata merge/write helper
- Shared hash comparison utility

Acceptance:
- Both scheduler and basic/general poll trigger pipelines use shared internals.

### 4.2 Extract common status-message helper (P2)
- Reuse status message update behavior where possible.

Acceptance:
- Comparable lifecycle state transitions handled consistently.

### 4.3 Keep poll-type adapters thin and explicit (P1)
- Scheduler adapter: slot-based card payload + scheduler vote stats.
- Basic poll adapter: option-based card payload + submitted-vote semantics.

Acceptance:
- Poll-type-specific logic remains isolated and test-covered.

---

## Phase 5 — Visual Polish + Motion Consistency

### 5.1 Unify chip spacing, hierarchy, and state colors (P2)
- Standardize badge/chip tone and spacing across modal/card surfaces.

Acceptance:
- Visual language is consistent between session/general poll UIs.

### 5.2 Align hover/focus/transition behavior (P3)
- Keep interactions subtle and consistent with existing dashboard/session styles.

Acceptance:
- Interaction polish is consistent on desktop/mobile and accessible via keyboard.

---

## Phase 6 — Tests, Docs, and Rollout

### 6.1 Add/update unit tests for shared frontend primitives (P1)
Acceptance:
- Shared components have direct unit coverage for key render states.

### 6.2 Add/update unit tests for shared backend Discord sync helpers (P1)
Acceptance:
- Helper behavior validated for hash comparisons, metadata writes, and queue payloads.

### 6.3 Update integration/e2e scenarios for parity assertions (P1)
Acceptance:
- Major user journeys (open/view/vote/finalize/reopen/archive/edit/delete) remain covered.
- Discord-linked poll UX assertions included where deterministic.

### 6.4 Update docs and execution trackers (P1)
- Update this file checkpoint after each compact implementation step.
- Record decisions in `docs/decisions.md` if architecture choices shift.

Acceptance:
- Docs reflect actual shipped architecture and final ownership boundaries.

---

## Progress Notes
- 2026-02-12: Created initial plan and task list docs for poll unification + prettifying initiative.
- 2026-02-12: Completed first shared-frontend extraction pass:
  - Added shared markdown primitive: `web/src/components/polls/poll-markdown-content.jsx`.
  - Added shared option-note dialog primitive: `web/src/components/polls/poll-option-note-dialog.jsx`.
  - Replaced duplicated markdown wrappers in:
    - `web/src/components/polls/basic-poll-voting-card.jsx`
    - `web/src/features/basic-polls/components/CreateGroupPollModal.jsx`
    - `web/src/features/scheduler/components/EmbeddedPollEditorModal.jsx`
    - `web/src/features/scheduler/SchedulerPage.jsx`
  - Replaced duplicated option-note modal markup in:
    - `web/src/features/dashboard/components/group-basic-poll-modal.jsx`
    - `web/src/features/scheduler/SchedulerPage.jsx`
  - Added unit coverage:
    - `web/src/components/polls/poll-markdown-content.test.jsx`
    - `web/src/components/polls/poll-option-note-dialog.test.jsx`
  - Validation:
    - `npm --prefix web run test -- src/components/polls/poll-markdown-content.test.jsx src/components/polls/poll-option-note-dialog.test.jsx src/features/basic-polls/components/CreateGroupPollModal.test.jsx src/features/scheduler/components/EmbeddedPollEditorModal.test.jsx src/features/dashboard/DashboardPage.test.jsx` (pass, `19 passed`, exit code `0`).
- 2026-02-12: Completed participant/discord metadata primitive pass:
  - Added shared participant summary primitive: `web/src/components/polls/poll-participant-summary.jsx`.
  - Added shared Discord metadata row primitive: `web/src/components/polls/poll-discord-meta-row.jsx`.
  - Replaced duplicated participant avatar/count row markup in:
    - `web/src/components/polls/basic-poll-card.jsx`
    - `web/src/components/polls/basic-poll-voting-card.jsx`
  - Added participant summary + Discord metadata parity in:
    - `web/src/features/dashboard/components/group-basic-poll-modal.jsx`
    - `web/src/features/scheduler/SchedulerPage.jsx`
  - Added unit coverage:
    - `web/src/components/polls/poll-participant-summary.test.jsx`
    - `web/src/components/polls/poll-discord-meta-row.test.jsx`
  - Validation:
    - `npm --prefix web run test -- src/components/polls/poll-participant-summary.test.jsx src/components/polls/poll-discord-meta-row.test.jsx src/components/polls/poll-markdown-content.test.jsx src/components/polls/poll-option-note-dialog.test.jsx src/features/dashboard/DashboardPage.test.jsx src/features/basic-polls/components/CreateGroupPollModal.test.jsx src/features/scheduler/components/EmbeddedPollEditorModal.test.jsx` (pass, `25 passed`, exit code `0`).
    - `npm --prefix web run build` (pass; existing non-blocking chunk-size warnings).
