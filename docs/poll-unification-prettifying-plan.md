---
created: 2026-02-12
lastUpdated: 2026-02-12
summary: "Plan to unify session/general poll UX and shared logic, reduce feature drift, and deliver a higher-fidelity poll experience."
category: DESIGN_DOC
status: CURRENT
implementationStatus: PLANNED
note: "Companion task tracker: docs/poll-unification-prettifying-task-list.md"
changelog:
  - "2026-02-12: Initial plan draft covering shared Discord sync, shared poll UI primitives, and parity improvements across session/general polls."
---

# Poll Unification + Prettifying Plan

## 1) Problem Statement
Session polls and general polls have evolved in parallel. Both now work, but key capabilities and visual patterns are duplicated or unevenly applied, increasing maintenance cost and risk of feature drift.

Current symptoms:
- Session poll detail view has richer metadata and operational controls than general poll modal.
- Discord sync logic exists in two separate trigger pipelines with overlapping behavior.
- Poll metadata, participant summary, and presentation primitives are not fully shared.
- UI polish level differs across contexts despite many shared product concepts.

## 2) Goals
1. Make session and general poll experiences feel like one coherent system.
2. Keep session polls as the primary UX while making general polls first-class and discoverable.
3. Centralize shared logic/components to prevent drift.
4. Preserve current behavior and data contracts while refactoring behind stable interfaces.
5. Improve visual hierarchy and information density without adding clutter.

## 3) Non-Goals
- Re-architecting scheduler slot voting itself.
- Introducing new poll types beyond existing multiple-choice / ranked-choice.
- Large schema migrations requiring backfills.
- Replacing Discord integration stack or command architecture.

## 4) Design Principles
- One source of truth for shared poll concepts.
- Session poll UX remains the "bread and butter" baseline.
- Parity by default: if one poll type gains core lifecycle metadata/control, evaluate both.
- Shared primitives first, wrappers second.
- Prefer additive refactors with compatibility fallbacks.

## 5) Target Architecture

### 5.1 Shared Frontend Poll Surface
Create shared primitives used by both session and general poll contexts:
- `PollMetaHeader`
  - status chip, deadline/time context, questing group chip, archived state, optional discord state.
- `PollParticipantSummary`
  - invitee/voted/pending counts + avatar bubbles.
- `PollDiscordMetaRow`
  - posted/sync status, view link, optional lifecycle actions (where allowed).
- `PollMarkdownContent`
  - unified markdown rendering wrapper for description/notes.

Use wrappers for context-specific composition:
- `SessionPollDetailShell` (scheduler page context).
- `GeneralPollDetailShell` (dashboard modal context).

### 5.2 Shared Backend Discord Sync Core
Extract a shared internal module for poll-card sync behavior used by both scheduler and general-poll triggers:
- common queue enqueue helper
- common sync hash utilities
- common discord metadata merge/update helper
- common status-message update helper
- shared message URL builder

Poll-type-specific pieces remain pluggable:
- card payload builder
- vote counting semantics
- lifecycle message text

## 6) Scope by Phase

### Phase A — Shared Foundations
- Build frontend shared poll primitives (meta, participants, markdown, discord row).
- Build backend shared Discord sync internals and wire both trigger pipelines.

### Phase B — General Poll Parity Upgrades
- Upgrade general poll modal header to match session-style information richness.
- Add discord metadata/status row in general poll modal when linked.
- Add participant summary with avatar bubbles in modal detail.
- Add optional manager-only live result preview for open polls.

### Phase C — Session Poll Refinements
- Apply shared markdown renderer to session poll description.
- Harmonize action grouping labels/tone with general poll lifecycle menu semantics.
- Add optional add-on poll completion snapshot in session cards where useful.

### Phase D — Visual Consistency + Polish
- Standardize chip/badge language and spacing rhythm.
- Align hover/focus motion patterns between poll cards and modal internals.
- Ensure mobile/desktop consistency and no layout regressions.

### Phase E — Hardening + Docs
- Expand tests around shared modules and parity behavior.
- Update design docs/task trackers and decisions log.
- Capture rollout and fallback notes.

## 7) Detailed Workstreams

### 7.1 UX/IA Workstream
- Define the canonical poll metadata hierarchy:
  - type, status, scope/group, deadline/time, participation progress, discord linkage.
- Establish shared terminology map (Open/Finalized/Closed/Archived; Add-on vs General).
- Ensure deep link behavior still lands users in the correct modal/section context.

### 7.2 Frontend Component Workstream
- Extract duplicate rendering logic from:
  - `web/src/features/scheduler/SchedulerPage.jsx`
  - `web/src/features/dashboard/components/group-basic-poll-modal.jsx`
  - `web/src/components/polls/basic-poll-card.jsx`
- Consolidate repeated markdown prose wrappers.
- Add extension points for creator-only controls and poll-type-specific actions.

### 7.3 Backend Discord Workstream
- Refactor shared behavior currently duplicated in:
  - `functions/src/triggers/scheduler.js`
  - `functions/src/triggers/basic-poll-card.js`
- Keep existing callable and trigger entrypoints stable.
- Maintain compatibility with current discord metadata fields on docs.

### 7.4 Test Workstream
- Unit tests for shared frontend primitives and backend sync helpers.
- Integration tests validating parity behavior in dashboard and scheduler contexts.
- Existing e2e flows updated to assert:
  - metadata parity expectations,
  - discord meta visibility,
  - no regressions in create/edit/finalize/reopen/archive/delete flows.

## 8) Risks and Mitigations
- Risk: regressions from refactoring shared logic.
  - Mitigation: extract behind adapter functions; retain legacy wrappers until parity tests pass.
- Risk: visual bloat in modal.
  - Mitigation: progressive disclosure and compact default rows.
- Risk: discord sync edge-case drift during migration.
  - Mitigation: preserve event entrypoints and add snapshot tests for both poll types.

## 9) Acceptance Criteria
1. General poll modal and session embedded poll cards share the same core voting card + shared meta primitives.
2. Discord metadata display behavior is consistent across poll types where linkage exists.
3. Backend Discord sync duplication is reduced to poll-type adapters over a shared core.
4. Session polls retain richer scheduling-specific controls without losing visual consistency.
5. Test gates pass (`web`, `functions`, rules, integration, e2e emulators).
6. Documentation updated with final architecture and ongoing tracker status.

## 10) Rollout Strategy
1. Land shared foundation modules behind no-op wrappers.
2. Migrate general poll surfaces to shared primitives.
3. Migrate session surfaces to shared primitives.
4. Switch Discord triggers to shared sync internals.
5. Run full test gate and deploy staging.
6. Run focused UAT on dashboard/general poll modal/session poll page/discord-linked groups.
7. Deploy production once parity checklist is signed off.

## 11) Success Metrics
- Reduction in duplicated poll metadata rendering paths.
- Reduction in duplicated Discord sync logic across trigger modules.
- Fewer poll UX regressions after new feature additions.
- Faster implementation of future poll features due to shared primitives.
