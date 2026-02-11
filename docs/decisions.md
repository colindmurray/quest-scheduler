---
created: 2026-01-06
lastUpdated: 2026-02-02
summary: "Living architecture decision log covering product, data, auth, and implementation tradeoff decisions."
category: DECISION_LOG
status: CURRENT
note: "Still used as the primary repository for durable architecture and process decisions."
changelog:
  - "2026-02-02: chore: sync notifications, discord, and identity updates"
  - "2026-01-31: Improve invite flows, notifications, and tests"
  - "2026-01-29: Chore: consolidate audit/docs and recent updates"
  - "2026-01-27: chore: save work in progress"
  - "2026-01-06: Initial commit"
---

# Architecture Decisions

## Email Notifications
- Approach: Firebase Extension (Trigger Email) using SMTP.
- Current implementation: extensions manifest (`firebase.json`) + params in `extensions/firestore-send-email.env` and secrets in `extensions/firestore-send-email.secret.local`.
- Trigger condition: only when votes change and creator has `settings.emailNotifications = true`.

## Email Verification Enforcement
- Decision: enforce verification at the Firestore rules layer for sensitive creates (scheduler + questing group creation).
- Rationale: prevents unverified email/password accounts from creating polls while still allowing login + read access.
- Implementation: check `request.auth.token.email_verified == true` or Google sign-in provider.

## Calendar Event Defaults
- Decision: remove per-user default calendar title/description in settings.
- Rationale: calendar event details should mirror the session poll title/description (with questing group context).
- Implementation: store poll `description` on scheduler documents; prefill calendar event title/description from poll data.

## TypeScript Migration (Incremental)
- Decision: migrate JS → TS in small chunks while keeping JS/TS mixed via `allowJs: true` and `checkJs: false`.
- Decision: start with non-strict TypeScript settings and tighten over time as coverage improves.
- Decision: keep functions compiled to `lib/` when TS is introduced; update `functions/package.json` `main` accordingly.

## Identifier Parsing Test Vectors
- Decision: keep a shared set of test vectors for identifier parsing (email, Discord username, legacy tag, Discord ID, QS username) and update both client/server helpers together.
- Rationale: regex drift between `web/src/lib/identifiers.js` and `functions/src/utils/identifiers.js` would create inconsistent validation across the app.
- Implementation: when changing identifier rules, update both helper modules and validate against the vectors below.
- Vectors:
  - Email: `user@example.com`, `USER+alias@example.co`
  - Discord username: `user.name`, `user_name`, `user-name`
  - Legacy Discord tag: `user#1234`
  - Discord ID: `123456789012345678`
  - QS username: `questmaster`, `dm-kris`

## Notification Retention
- Decision: delete dismissed in-app notifications after 20 days (scheduled cleanup or Firestore TTL).
- Rationale: keep notification collections lean while preserving recent history for UX context.

## Unified Notification Overhaul: Event Emission
- Decision: `notificationEvents` writes are server-only via a callable `emitNotificationEvent`. Clients do not write events directly.
- Rationale: avoids spoofing and simplifies validation; reduces Firestore rule complexity.

## Unified Notification Overhaul: Coalescing
- Decision: initial coalescing uses `dedupeKey` with immediate processing; no Cloud Tasks or delayed batching in v1.
- Rationale: lower ops cost and complexity for small scale.

## Unified Notification Overhaul: Event Retention
- Decision: set `expiresAt` on `notificationEvents` and use Firestore TTL (default 90 days) for cleanup.
- Rationale: prevent unbounded growth while retaining enough history for debugging.

## Unified Notification Overhaul: Channel Skips
- Decision: treat missing in-app or email recipients as a successful no-op in the router (skip without error).
- Rationale: events may intentionally target only one channel; status should not be `partial` when a channel has no recipients.

## Unified Notification Overhaul: Preference Resolution
- Decision: resolve in-app/email delivery per recipient inside the router using user settings (`notificationMode`, `notificationPreferences`, `emailNotifications`).
- Rationale: keep preference logic centralized and consistent across web + functions; avoid client-side filtering drift.

## Unified Notification Overhaul: Email Eligibility
- Decision: only event types with email templates are eligible for email delivery; if a preference resolves to `inApp+Email` for a non-eligible event, it is downgraded to `inApp`.
- Rationale: avoid router failures on missing templates and keep low-importance events in-app only by default.

## Unified Notification Overhaul: Group Invite Revocation
- Decision: use `GROUP_INVITE_DECLINED` events (actor = invitee) to auto-clear revoked group invites, without sending new notifications to inviters.
- Rationale: reuse existing auto-clear rules without introducing a new event type.

## Unified Notification Overhaul: Auto-Clear Expansion
- Decision: auto-clear poll-scoped notifications on `POLL_DELETED` (invites, reminders, slot changes, ready-to-finalize, finalized, reopened, cancelled, created) and clear `POLL_CANCELLED`/`POLL_DELETED` when `POLL_RESTORED` arrives.
- Decision: auto-clear group-scoped notifications on `GROUP_DELETED` for pending invites and member change notifications.
- Rationale: removed/deleted resources should not leave stale actionable notifications visible.

## Unified Notification Overhaul: All Votes In Notifications
- Decision: split "all votes in" into creator (`POLL_READY_TO_FINALIZE`) and participant opt-in (`POLL_ALL_VOTES_IN`) events.
- Rationale: creators need the prompt by default in simple mode; participants can opt in via advanced settings without changing creator defaults.

## Scheduler: Copy Votes
- Decision: implement vote copying as a modal flow with centralized slot-overlap matching logic in `web/src/features/scheduler/utils/copy-votes.js`.
- Decision: matching is timezone-free (pure UTC start/end comparison); UI display still respects user timezone settings.
- Rationale: keep the tricky overlap rules deterministic and unit-testable; avoid duplicating edge-case logic across components.

## Scheduler: Auto-Block Conflicts
- Decision: store per-user finalized-session busy windows on `usersPublic/{uid}.busyWindows` and a boolean toggle `usersPublic/{uid}.autoBlockConflicts`.
- Decision: maintain `busyWindows` via Cloud Functions triggers on scheduler/vote writes so clients can compute effective tallies without scanning all schedulers.
- Decision: disallow clients from writing `usersPublic/{uid}.busyWindows` in Firestore rules (server-only derived data).
- Decision: apply conflict blocking only in results/tallies (votes remain saved); the user sees a "Busy (ignored in results)" callout with a link to the blocking poll.
- Rationale: reduce client read amplification, keep behavior consistent across clients, and preserve user intent/history while preventing double-booking in finalization decisions.

## Basic Polls: Discord Creation & Finalization
- Decision: add `/qs poll-create` slash command for creating standalone group-linked polls from Discord channels linked to questing groups.
- Decision: the poll card includes a "Finalize" button visible to all but gated server-side to group managers.
- Decision: ranked-choice polls with a final-round tie cannot be finalized from Discord (ephemeral error directs to web for tie-breaking UI).
- Decision: finalization posts a results message to the channel and updates the poll card embed.
- Decision: poll card sync uses a Firestore trigger (same pattern as scheduler cards) so web edits also update the Discord card.
- Decision: reopen from Discord is deferred to a later version; web-only for v1.
- Rationale: Discord is the primary communication channel for this user base; creating and finalizing polls without leaving Discord reduces friction. The trigger-based sync ensures the card stays current regardless of where changes originate.

## Discord Session Poll Creation
- Decision: add `/qs session-create` slash command for creating session polls from Discord channels linked to questing groups.
- Decision: date selection uses a week-at-a-time button grid wizard (Discord has no native date picker). Selected dates toggle green/gray; navigation buttons shift weeks.
- Decision: slot times default to the user's per-day session defaults (`settings.defaultStartTimes`), falling back to simple mode defaults, then hardcoded 18:00/240min.
- Decision: any linked group member can create session polls (not just managers), matching web behavior.
- Decision: the scheduler is created with `questingGroupId` set to the linked group automatically.
- Rationale: Discord is where the group communicates; quick session creation without leaving Discord lowers the barrier to scheduling. Per-day defaults eliminate time entry from the Discord flow entirely.

## Seamless Discord-to-Web Handoff
- Decision: both `/qs poll-create` and `/qs session-create` create real Firestore documents immediately (not drafts). An "Edit on Web" Link button in the ephemeral confirmation opens the web edit page with all Discord-entered data pre-loaded.
- Decision: no draft or pending state — polls are `OPEN` and functional the moment Discord creation completes.
- Decision: clicking "Edit on Web" during the session creation wizard (before clicking Create) still saves the current state to Firestore first, then redirects.
- Rationale: avoids draft state complexity; the web edit page already loads from Firestore. Users get a seamless transition from Discord's limited creation UI to the full-featured web editor.

## Local Codex Long-Run Execution
- Decision: standardize long-running implementation work on local Codex CLI scripts (`scripts/codex/*.sh`) with a generated plan tracker (`docs/plan-execution/<plan-id>-task-list.md`) and prompt scaffold (`.codex/prompts/<plan-id>-execute.md`).
- Decision: use the generic `execute-local-plan` skill as the default workflow for future long-running plans, instead of creating plan-specific execution skills by default.
- Decision: keep run artifacts in `.codex/runs/` and exclude them from git tracking.
- Rationale: this keeps execution reusable across future plans, preserves checkpoint state cleanly, and enforces local-only execution without Codex Cloud dependencies.

## Skill Lifecycle Management
- Decision: archive legacy, plan-specific skills under `.codex/skills-archive/<date>/` instead of deleting them.
- Decision: keep `.codex/skills/` focused on currently active generic workflows.
- Applied: moved `execute-plan-unified-notification-overhaul`, `test-plan-runner`, and `ts-migration-chunk` to `.codex/skills-archive/2026-02-11/`.
- Rationale: preserves historical skill context while reducing accidental reuse of obsolete workflows.

## Integration Test File Parallelism
- Decision: run web integration test files serially by setting `fileParallelism: false` in `web/vitest.integration.config.js`.
- Rationale: integration tests share Firebase emulator/auth state and clear Firestore between tests; parallel file execution caused cross-file interference and non-deterministic permission failures unrelated to feature behavior.

## Basic Polls: Finalized Snapshot Source of Truth
- Decision: treat `poll.finalResults` as the canonical closed-state result source for both standalone and embedded basic polls.
- Decision: compute and persist snapshots at finalization time only (`finalizeBasicPoll` for group polls; `googleCalendarFinalizePoll` for embedded polls), including deterministic tallies/IRV rounds and `voterCount`.
- Decision: closed poll UIs render from snapshots and do not require live vote docs; live-doc fallbacks are retained only for legacy finalized records without snapshots.
- Rationale: finalized outcomes must remain stable even if vote docs are later pruned by cleanup/privacy flows.
