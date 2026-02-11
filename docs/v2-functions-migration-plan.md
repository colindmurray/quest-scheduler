---
created: 2026-02-11
lastUpdated: 2026-02-11
summary: "Staged Cloud Functions v1-to-v2 migration plan aligned with active feature work and deployment constraints."
category: DESIGN_DOC
status: CURRENT
implementationStatus: PENDING
note: "Recently authored and aligned with current repository state; pending execution."
changelog:
  - "2026-02-11: Document present in workspace (no git history available)."
---

# v2 Functions Migration Plan

## Summary
This plan migrates the remaining Cloud Functions v1 modules in this repository to v2 where practical, without disrupting the active `basic-poll` implementation work.

Key points:
- The codebase is already mixed v1/v2.
- There is no universal hard deprecation date forcing all v1 functions to migrate immediately.
- Migration must be staged because Firebase does not support in-place same-name v1->v2 upgrades in a single deploy.
- `auth.onUserCreate` should remain v1 for now because v2 does not provide the same basic Auth trigger set.

## Scope and Context
This plan explicitly accounts for the current in-flight plan state:
- `docs/basic-poll.md`
- `docs/basic-poll-tasks.md`
- `docs/fixtures/basic-polls-irv-fixtures.json`
- `docs/plan-execution/basic-poll-task-list.md`
- `docs/task-list.md`

Current checkpoint (from `docs/task-list.md`):
- Last Completed: `basic-poll` `P2 6.4`
- Next Step: `P2 7.3`

Observed drift to resolve before migration starts:
- `P2 7.3` is marked pending in trackers, but `notifyBasicPollRequiredChanged` is already implemented and tested in `functions/src/basic-polls/callables.js` and `functions/src/basic-polls/callables.test.js`.

## Current Functions Topology (As Of 2026-02-11)

### Runtime/Tooling Baseline
- `firebase-tools`: `15.4.0`
- `firebase-functions`: `7.0.3`
- Functions runtime: Node.js `22` (`firebase.json`)
- `functions.config()` usage in repository: none (`rg "functions.config("`)

### v1 Runtime Modules (Remaining)
1. `functions/src/legacy.js` (`2759` LOC)
- 18 runtime exports (`onCall`/`onRequest`), including Google Calendar OAuth, friend/group/poll invite flows, blocking, and account deletion.
- Includes `functions.runWith({ secrets: [...] })` usage.
- Heavily used by web callables.

2. `functions/src/basic-polls/callables.js` (`586` LOC)
- 6 `onCall` exports:
  - `createBasicPoll`
  - `finalizeBasicPoll`
  - `reopenBasicPoll`
  - `removeBasicPoll`
  - `resetBasicPollVotes`
  - `notifyBasicPollRequiredChanged`
- Directly tied to active `basic-poll` plan work.

3. `functions/src/auth.js` (`112` LOC)
- `sendPasswordResetInfo` (`onCall`)
- `onUserCreate` (`functions.auth.user().onCreate`)

4. `functions/src/notifications/emit.js` (`60` LOC)
- `emitNotificationEvent` (`onCall`)

5. `functions/src/notifications/reconcile.js` (`127` LOC)
- `reconcilePendingNotifications` (`onCall`)

6. `functions/src/discord/nudge.js` (`232` LOC)
- `nudgeDiscordParticipants` (`functions.region(...).runWith(...).https.onCall`)

Total remaining v1 runtime exports: 29.

#### v1 Export Inventory (Current)
- `functions/src/legacy.js`:
  - `googleCalendarStartAuth`
  - `googleCalendarOAuthCallback`
  - `googleCalendarListCalendars`
  - `googleCalendarFinalizePoll`
  - `cloneSchedulerPoll`
  - `googleCalendarDeleteEvent`
  - `sendFriendRequest`
  - `revokeFriendRequest`
  - `acceptFriendInviteLink`
  - `sendPollInvites`
  - `registerQsUsername`
  - `revokePollInvite`
  - `sendGroupInvite`
  - `revokeGroupInvite`
  - `removeGroupMemberFromPolls`
  - `blockUser`
  - `unblockUser`
  - `deleteUserAccount`
- `functions/src/basic-polls/callables.js`:
  - `createBasicPoll`
  - `finalizeBasicPoll`
  - `reopenBasicPoll`
  - `removeBasicPoll`
  - `resetBasicPollVotes`
  - `notifyBasicPollRequiredChanged`
- `functions/src/auth.js`:
  - `sendPasswordResetInfo`
  - `onUserCreate`
- `functions/src/notifications/emit.js`:
  - `emitNotificationEvent`
- `functions/src/notifications/reconcile.js`:
  - `reconcilePendingNotifications`
- `functions/src/discord/nudge.js`:
  - `nudgeDiscordParticipants`

### v2 Runtime Modules (Already Migrated)
- Discord ingress/worker/link/oauth/unlink/roles/repost/warmup
- Scheduler triggers
- Busy window triggers
- Basic poll Firestore triggers
- Notification router trigger

Total existing v2 runtime exports: 23.

#### v2 Export Inventory (Current)
- `functions/src/discord/ingress.js`: `discordInteractions`
- `functions/src/discord/worker.js`: `processDiscordInteraction`
- `functions/src/discord/link-codes.js`: `discordGenerateLinkCode`
- `functions/src/discord/oauth.js`: `discordOAuthStart`, `discordOAuthLoginStart`, `discordOAuthCallback`
- `functions/src/discord/unlink.js`: `discordUnlink`
- `functions/src/discord/roles.js`: `discordListGuildRoles`
- `functions/src/discord/repost.js`: `discordRepostPollCard`
- `functions/src/discord/warmup.js`: `discordWarmup`
- `functions/src/triggers/scheduler.js`:
  - `postDiscordPollCard`
  - `updateDiscordPollCard`
  - `processDiscordSchedulerUpdate`
  - `handleDiscordPollDelete`
  - `updateDiscordPollOnVote`
  - `notifyDiscordSlotChanges`
- `functions/src/triggers/busy-windows.js`:
  - `syncBusyWindowsOnSchedulerWrite`
  - `syncBusyWindowsOnVoteWrite`
- `functions/src/triggers/basic-polls.js`:
  - `onGroupBasicPollVoteWritten`
  - `onSchedulerBasicPollVoteWritten`
  - `onGroupBasicPollDeadlineUpdated`
  - `onSchedulerBasicPollDeadlineUpdated`
- `functions/src/notifications/router.js`: `processNotificationEvent`

### Frontend Coupling to v1 Callables
Active web consumers call v1 function names directly, especially for:
- Legacy domain actions (`sendFriendRequest`, `sendPollInvites`, `revokeGroupInvite`, etc.)
- Calendar callables (`googleCalendarStartAuth`, `googleCalendarFinalizePoll`, etc.)
- Account actions (`deleteUserAccount`, `sendPasswordResetInfo`)
- Notification helpers (`emitNotificationEvent`, `reconcilePendingNotifications`)
- Basic poll server actions (`createBasicPoll`, `notifyBasicPollRequiredChanged`, etc.)

This coupling means migration sequencing must include client compatibility strategy for callable names.

## External Migration Requirements (What Is Actually Required)
1. There is no published hard deadline requiring all 1st gen functions to move to 2nd gen immediately.
2. `functions.config()` is deprecated and effectively blocked for new deployments after December 2025, but this codebase does not use it.
3. v1 and v2 can coexist, and Firebase recommends migrating one function at a time.
4. Firebase currently does not support direct same-name in-place upgrades from v1 to v2 in one deploy; migration requires rename/cutover flow.
5. v2 uses a different default service account than v1, so IAM parity must be validated during migration.
6. v2 does not support the same set of basic Auth triggers as v1 (important for `onUserCreate`).

## Constraints Specific to Current Project State
1. `basic-poll` plan is still active; high-churn files should not be migrated mid-task unless necessary.
2. `functions/src/legacy.js` has recent basic-poll related changes (`removeGroupMemberFromPolls`, `deleteUserAccount`, calendar finalization snapshot behavior).
3. OAuth callback endpoints (`googleCalendarOAuthCallback`, `discordOAuthCallback`) have external redirect URI implications.
4. Existing test suites heavily mock v1 APIs (`firebase-functions/v1`) for these modules; migration requires test harness updates.

## Target End State
1. All eligible v1 HTTP/callable/background functions migrated to v2.
2. `legacy.js` split into domain modules before or during migration to reduce blast radius.
3. `onUserCreate` retained on v1 until there is a validated v2-compatible replacement path for required semantics.
4. No regression to active basic-poll roadmap items.

## Migration Strategy

### Phase 0: Prep and Guardrails (Required)
1. Reconcile basic-poll tracker drift (`P2 7.3` status) before touching migration files.
2. Freeze migration changes to docs + inventory until active basic-poll step is checkpointed.
3. Capture baseline tests:
- `npm --prefix functions run test -- src/auth.test.js src/notifications/emit.test.js src/notifications/reconcile.test.js src/discord/nudge.test.js src/basic-polls/callables.test.js src/legacy.callables.test.js src/legacy.calendar.test.js`
4. Confirm IAM baseline for service-account-sensitive paths (Firestore/Auth/Admin SDK calls).

Acceptance:
- Trackers aligned, baseline tests green, and no unresolved basic-poll merge conflicts.

### Phase 1: Low-Risk v1 Callable Migration
Migrate modules with lower coupling first.

1. `functions/src/notifications/emit.js` -> v2 `onCall`
2. `functions/src/notifications/reconcile.js` -> v2 `onCall`
3. `functions/src/auth.js` -> migrate only `sendPasswordResetInfo` to v2 `onCall`
4. `functions/src/discord/nudge.js` -> v2 `onCall` with `{ region, secrets }`

Notes:
- Keep exported function names stable where possible, but follow rename/cutover constraints.
- Update corresponding tests to mock `firebase-functions/v2/https` request shape (`request.data`, `request.auth`).

Acceptance:
- Targeted unit suites pass.
- Staging smoke tests pass for each callable.

### Phase 2: Basic Poll Callable Migration (After Basic-Poll Stabilization Gate)
Gate condition:
- Basic-poll tracker is at or beyond currently planned checkpoint and no pending schema/notification contract churn in `basic-polls/callables.js`.

Work:
1. Migrate `functions/src/basic-polls/callables.js` from v1 `functions.https.onCall` to v2 `onCall`.
2. Keep existing callable names or execute rename/cutover with client compatibility path.
3. Validate notification emission semantics and payload shape compatibility.

Acceptance:
- `src/basic-polls/callables.test.js`, `src/triggers/basic-polls.test.js`, and related notification tests pass.
- Web integration tests that call basic-poll server actions remain green.

### Phase 3: Legacy Domain Migration (Largest Workstream)
Prerequisite:
- Split `functions/src/legacy.js` into domain files before v2 migration to reduce risk:
  - `calendar-callables.js`
  - `friends-callables.js`
  - `groups-callables.js`
  - `poll-invites-callables.js`
  - `user-account-callables.js`

Then migrate each domain file to v2 `onCall`/`onRequest` in small batches.

Special care:
1. Calendar OAuth endpoints:
- Validate redirect URI behavior post-cutover.
- Reconfirm `QS_GOOGLE_OAUTH_CLIENT_JSON` secret binding in v2 options.

2. Account deletion and cleanup:
- Re-run full legacy callable tests and basic-poll cleanup tests due high data-integrity impact.

Acceptance:
- `src/legacy.callables.test.js`, `src/legacy.calendar.test.js`, `src/legacy.clone.test.js`, `src/legacy.helpers.test.js` pass after refactor/migration.
- Web smoke flows pass for friends/groups/poll invites/scheduler finalize.

### Phase 4: Auth Trigger Strategy (`onUserCreate`)
`functions/src/auth.js:onUserCreate` should remain v1 for now.

Rationale:
- v2 supports Auth blocking triggers, but does not support the same set of basic Auth events as v1.
- This project currently depends on post-create behavior (user doc initialization + friend request backfill + pending notification reconciliation).

Plan:
1. Keep `onUserCreate` in v1.
2. Track Firebase support updates for equivalent v2 trigger semantics.
3. Reassess once parity exists or if architecture is changed to replace this trigger path.

### Phase 5: Cutover, Cleanup, and Hardening
1. Remove remaining `firebase-functions/v1` imports except intentional holdouts (`onUserCreate`).
2. Update `docs/runbook.md` and `docs/testing.md` with v2-specific deploy/test notes.
3. Add explicit migration notes to `docs/decisions.md`.
4. Verify no stale callable names remain in web data layer.

### Phase 6: Post-Migration `onUserCreate` Replacement (After Initial Migration Is Stable)
Run this phase only after Phases 0-5 are complete, staging has been stable, and all migration regression suites are passing.

Objective:
- Replace v1 `onUserCreate` behavior with an explicit, idempotent bootstrap workflow while preserving current semantics:
  - user/profile document initialization
  - pending friend request `toUserId` backfill
  - pending notification reconciliation

Proposed replacement architecture:
1. Add a v2 callable: `bootstrapUserProfileV2` (authenticated).
- Performs the same initialization currently in `onUserCreate`.
- Must be idempotent (`set(..., { merge: true })`, guarded backfills, safe retries).
- Returns `{ bootstrapped: true, alreadyBootstrapped: boolean }`.

2. Trigger bootstrap from client login/session initialization.
- Call once after auth is established (app shell/auth gate).
- Use local guard/debounce to avoid redundant calls in the same session.
- Treat failures as recoverable and retry on next app load.

3. Add a server reconciliation safety net.
- Scheduled v2 job to find recent Auth users missing required docs and run the same bootstrap helper.
- Covers missed client bootstrap calls and offline-first edge cases.

Implementation details:
1. Refactor current `onUserCreate` internals in `functions/src/auth.js` into shared helpers:
- `ensureUserDocsInitialized(uid, userRecordLike)`
- `backfillPendingFriendRequests(email, uid)`
- `reconcilePendingNotificationsForUser(email, uid)`

2. Reuse those helpers from:
- existing v1 `onUserCreate` (during transition)
- new v2 callable `bootstrapUserProfileV2`
- new scheduled reconciliation function

3. Add bootstrap marker fields in `users/{uid}` for observability:
- `bootstrap.version`
- `bootstrap.lastRunAt`
- `bootstrap.lastSource` (`onUserCreateV1` | `bootstrapCallableV2` | `bootstrapReconcileJobV2`)

Rollout sequence:
1. Deploy helpers + `bootstrapUserProfileV2` + reconciliation job while keeping `onUserCreate` active.
2. Enable client bootstrap call (guarded, retry-safe).
3. Monitor for a full release window:
- users without `users/{uid}` or `usersPublic/{uid}` docs
- pending friend requests missing `toUserId`
- pending notification backlog
4. If metrics stay clean, disable/remove v1 `onUserCreate`.
5. Keep reconciliation job in place for at least one additional release cycle.

Acceptance criteria:
1. New-user signup/login always results in initialized `users` and `usersPublic` docs.
2. Friend request backfill behavior matches current v1 behavior.
3. Pending notifications are reconciled for newly registered users.
4. Re-running bootstrap does not create duplicates or regress data.
5. `functions/src/auth.test.js` and new callable/job tests pass; end-to-end signup smoke tests pass.

Rollback plan:
1. Re-enable v1 `onUserCreate` export immediately if bootstrap metrics degrade.
2. Keep new callable/job deployed (they are idempotent and safe to coexist).
3. Re-run reconciliation job to repair any partially initialized users.

## Cutover Pattern (Because Same-Name Direct Upgrade Is Unsupported)
Use one of these patterns per function:

1. Alias pattern (preferred for zero-downtime callable migration)
- Deploy v2 as `<name>V2`.
- Update client callers to prefer `<name>V2` and optionally fallback.
- Validate, then remove v1 `<name>`.
- Optional later rename normalization during maintenance.

2. Delete/recreate pattern (preferred for fixed external callback URLs)
- Delete v1 function.
- Deploy v2 with original name.
- Use maintenance window and fast smoke verification.

For background triggers, ensure idempotency if running old/new in parallel during migration windows.

## Per-Module Priority Matrix
1. `notifications/emit.js` - Priority: High - Risk: Low - Phase: 1
2. `notifications/reconcile.js` - Priority: High - Risk: Low - Phase: 1
3. `auth.js:sendPasswordResetInfo` - Priority: High - Risk: Low - Phase: 1
4. `discord/nudge.js` - Priority: Medium - Risk: Medium - Phase: 1
5. `basic-polls/callables.js` - Priority: High - Risk: Medium/High - Phase: 2
6. `legacy.js` - Priority: High - Risk: High - Phase: 3
7. `auth.js:onUserCreate` - Priority: Deferred hold - Risk: N/A - Phase: 4

## Test Plan by Phase

Phase 1:
- `npm --prefix functions run test -- src/auth.test.js src/notifications/emit.test.js src/notifications/reconcile.test.js src/discord/nudge.test.js`

Phase 2:
- `npm --prefix functions run test -- src/basic-polls/callables.test.js src/triggers/basic-polls.test.js src/notifications/auto-clear.test.js src/notifications/router.test.js`
- `npm --prefix web run test -- src/lib/data/basicPolls.test.js`

Phase 3:
- `npm --prefix functions run test -- src/legacy.callables.test.js src/legacy.calendar.test.js src/legacy.clone.test.js src/legacy.helpers.test.js`
- Targeted web suites for friends/groups/poll invite/calendar flows.

Phase 5 (final confidence pass):
- `npm --prefix functions run test`
- `npm --prefix web run test`
- `npm --prefix web run build`

## Deliverables
1. Migrated runtime modules per phase.
2. Updated tests for v2 request/event handler shapes.
3. Updated operational docs (`runbook`, `testing`, task trackers).
4. Explicitly documented v1 holdout (`onUserCreate`) and rationale.

## References
- Upgrade guide (v1 -> v2): https://firebase.google.com/docs/functions/2nd-gen-upgrade
- Version comparison + limitations: https://firebase.google.com/docs/functions/version-comparison
- Config/env deprecation note (`functions.config()`): https://firebase.google.com/docs/functions/config-env
- Firebase release notes (functions v7 removal of `functions.config()`): https://firebase.google.com/support/releases
- Firestore trigger note (1st gen/2nd gen docs and migration context): https://firebase.google.com/docs/firestore/extend-with-functions-2nd-gen
