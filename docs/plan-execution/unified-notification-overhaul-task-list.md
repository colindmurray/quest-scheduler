# Unified Notification Overhaul — Task List

## Execution Checkpoint
- Last Completed: P3.1 Discord routing + rate limits
- Next Step: Complete
- Open Issues: None
- Last Updated (YYYY-MM-DD): 2026-01-31

## Task List

### P0 — Foundations (Security + Shared Contracts)
- [x] P0.1 Define event taxonomy + alias map
  - Dependencies: None
  - Definition of Ready:
    - [ ] Plan doc naming + routing rules reviewed
    - [ ] Legacy notification types inventory confirmed
  - Definition of Done:
    - [ ] `NOTIFICATION_EVENTS` enum + legacy alias map exists in functions
    - [ ] Routing rule skeleton created for core event types
  - Acceptance Criteria:
    - Event names align with plan + mapping table
    - Unit tests cover alias resolution and enum completeness
  - Test Gate: `npm --prefix functions run test`

- [x] P0.2 Firestore rules for `notificationEvents` + `pendingNotifications`
  - Dependencies: P0.1
  - Definition of Ready:
    - [ ] Desired write path confirmed (callable only)
  - Definition of Done:
    - [ ] Rules deny client reads/writes to `notificationEvents`
    - [ ] Rules deny client writes to `pendingNotifications`
    - [ ] Rules tests cover allow/deny cases
  - Acceptance Criteria:
    - Client attempts to write events are rejected in emulator tests
  - Test Gate: `npm --prefix web run test:rules`

- [x] P0.3 Callable `emitNotificationEvent` helper
  - Dependencies: P0.1, P0.2
  - Definition of Ready:
    - [ ] Event payload shape documented in code
  - Definition of Done:
    - [ ] Callable validates actor UID + allowlisted event types
    - [ ] Event docs created with `status: "queued"` + `createdAt`
    - [ ] Web wrapper calls callable with typed input
  - Acceptance Criteria:
    - Invalid payloads return clear errors
    - Unit tests cover success + validation failures
  - Test Gate: `npm --prefix functions run test`

- [x] P0.4 UI compatibility for legacy + new notification types
  - Dependencies: P0.1
  - Definition of Ready:
    - [ ] Inventory of legacy notification types confirmed
  - Definition of Done:
    - [ ] Notification rendering supports both legacy + new types
    - [ ] Mapping covers `SESSION_*` aliases during migration
  - Acceptance Criteria:
    - Existing notification fixtures render without regressions
  - Test Gate: `npm --prefix web run test`

### P1 — Core Router + Templates
- [x] P1.1 Centralized template module
  - Dependencies: P0.1
  - Definition of Ready:
    - [ ] Template structure agreed (in-app + email)
  - Definition of Done:
    - [ ] Template exports standardized `(event, recipient)` signature
    - [ ] Initial templates for `POLL_INVITE_SENT` (in-app + email)
  - Acceptance Criteria:
    - Template rendering uses payload snapshots only
  - Test Gate: `npm --prefix functions run test`

- [x] P1.2 Router pipeline (in-app + email) with status handling
  - Dependencies: P0.1, P0.2, P0.3, P1.1
  - Definition of Ready:
    - [ ] Router rule map defined for poll invite flow
  - Definition of Done:
    - [ ] Router processes queued events → processed/partial/failed
    - [ ] In-app + email delivery for `POLL_INVITE_SENT`
    - [ ] Legacy aliases accepted during migration
  - Acceptance Criteria:
    - Integration tests verify event → notification + email writes
  - Test Gate: `npm --prefix functions run test`

- [x] P1.3 Auto-clear engine + dedupe support
  - Dependencies: P1.2
  - Definition of Ready:
    - [ ] Auto-clear rules confirmed for poll + social events
  - Definition of Done:
    - [ ] Auto-clear batch updates respect Firestore limits
    - [ ] DedupeKey logic prevents duplicate in-app notifications
  - Acceptance Criteria:
    - Unit tests cover auto-clear for finalize/cancel/reopen
  - Test Gate: `npm --prefix functions run test`

- [x] P1.4 Pending notification reconciliation
  - Dependencies: P0.3
  - Definition of Ready:
    - [ ] Email normalization + hash behavior documented
  - Definition of Done:
    - [ ] Auth onCreate (or user doc onCreate) reconciles pending invites
    - [ ] Callable on first login reconciles missed cases
  - Acceptance Criteria:
    - Pending invites materialize for new users in emulator test
  - Test Gate: `npm --prefix functions run test`

### P2 — Migration + Settings
- [x] P2.1 Migrate poll invite flow end-to-end
  - Dependencies: P1.2, P1.3
  - Definition of Ready:
    - [ ] Poll invite path identified in web + functions
  - Definition of Done:
    - [ ] Poll invite emits event via callable
    - [ ] Router output matches legacy behavior
  - Acceptance Criteria:
    - Emulator flow: invite → notification + email
  - Test Gate: `npm --prefix web run test:e2e:emulators`

- [x] P2.2 Migrate poll lifecycle flows (vote, finalize, reopen, slot change)
  - Dependencies: P2.1
  - Definition of Ready:
    - [ ] Each flow mapped to event type + rules
  - Definition of Done:
    - [ ] Legacy sends removed for migrated flows
  - Acceptance Criteria:
    - E2E poll lifecycle tests pass against emulators
  - Test Gate: `npm --prefix web run test:e2e:emulators`

- [x] P2.3 Migrate social flows (friend + group invites)
  - Dependencies: P1.2
  - Definition of Ready:
    - [ ] Friend/group flows mapped to new event types
  - Definition of Done:
    - [ ] Event emission replaces legacy writes
  - Acceptance Criteria:
    - In-app notifications rendered for both flows
  - Test Gate: `npm --prefix web run test`

- [x] P2.4 Notification settings UI (simple/advanced)
  - Dependencies: P1.2
  - Definition of Ready:
    - [ ] Defaults + actionability classification confirmed
  - Definition of Done:
    - [ ] Settings persisted on user doc
    - [ ] Router respects simple/advanced preferences
  - Acceptance Criteria:
    - UI toggles update routing outcomes in tests
  - Test Gate: `npm --prefix web run test`

- [x] P2.5 Notification event retention (TTL)
  - Dependencies: P1.2
  - Definition of Ready:
    - [ ] TTL duration confirmed (default 90 days)
  - Definition of Done:
    - [ ] `expiresAt` set on new `notificationEvents`
    - [ ] Firestore TTL configured + documented
  - Acceptance Criteria:
    - Old events expire in emulator/TTL test notes
  - Test Gate: `npm --prefix functions run test`

### P3 — Discord + Cleanup
- [x] P3.1 Discord routing + rate limits
  - Dependencies: P1.2
  - Definition of Ready:
    - [ ] Discord settings schema validated
  - Definition of Done:
    - [ ] Router sends Discord notifications per group settings
    - [ ] Nudge + reminder rate limits enforced
  - Acceptance Criteria:
    - Discord messages are skipped gracefully with `partial` status
  - Test Gate: `npm --prefix functions run test`

- [x] P3.2 Remove legacy direct notification sends
  - Dependencies: P2.2, P2.3, P2.4
  - Definition of Ready:
    - [ ] All flows emit events in production code
  - Definition of Done:
    - [ ] Legacy notification writes removed
    - [ ] Legacy alias support marked for deprecation after 2 releases
  - Acceptance Criteria:
    - No direct writes to `users/{uid}/notifications` outside router
  - Test Gate: `npm --prefix web run test`

## Progress Notes
- 2026-01-31: Task list created from plan doc and expert feedback; ready for execution.
- 2026-01-31: Tests not run (setup and documentation only).
- 2026-01-31: Completed P0.1 (notification constants, alias resolver, rules skeleton). Tests: `npm --prefix functions run test` (pass, 1 skipped).
- 2026-01-31: Completed P0.2 (server-only rules for notificationEvents + pendingNotifications, rules tests). Tests: `npm --prefix web run test:rules` (pass).
- 2026-01-31: Completed P0.3 (emitNotificationEvent callable + web wrapper + tests). Tests: `npm --prefix functions run test` (pass, 1 skipped), `npm --prefix web run test` (pass).
- 2026-01-31: Completed P0.4 (notification type normalization + UI compatibility). Tests: `npm --prefix web run test` (pass).
- 2026-01-31: Completed P1.1 (template module + poll invite templates). Tests: `npm --prefix functions run test` (pass, 1 skipped).
- 2026-01-31: Completed P1.2 (router trigger + in-app/email delivery for poll invites + tests). Tests: `npm --prefix functions run test` (pass, 1 skipped).
- 2026-01-31: Completed P1.3 (auto-clear rules + dedupe support + tests). Tests: `npm --prefix functions run test` (pass, 1 skipped).
- 2026-01-31: Completed P1.4 (pending notification reconciliation + callable + web hook). Tests: `npm --prefix functions run test` (pass, 1 skipped), `npm --prefix web run test` (pass).
- 2026-01-31: Completed P2.1 (poll invite flow now emits events; router handles email/in-app). Tests: `npm --prefix functions run test` (pass, 1 skipped), `npm --prefix web run test` (pass), `npm --prefix web run test:e2e:emulators` (pass).
- 2026-01-31: Completed P2.2 (vote/finalize/reopen/slot change emit events + new templates). Tests: `npm --prefix functions run test` (pass, 1 skipped), `npm --prefix web run test` (pass), `npm --prefix web run test:e2e:emulators` (pass).
- 2026-01-31: Completed P2.3 (friend/group invites emit events; removed legacy sync + emails). Tests: `npm --prefix functions run test` (pass, 1 skipped), `npm --prefix web run test` (pass).
- 2026-01-31: Completed P2.4 (notification settings UI + preference-aware router). Tests: `npm --prefix functions run test` (pass, 1 skipped), `npm --prefix web run test` (pass).
- 2026-01-31: Completed P2.5 (notificationEvents TTL + expiresAt + client-side email opt-out removal). Tests: `npm --prefix functions run test` (pass, 1 skipped), `npm --prefix web run test` (pass).
- 2026-01-31: Completed P3.2 (removed legacy notification writes in web/functions; emit events for group member removed/left and poll invite revokes; added in-app templates + preference gating). Tests: `npm --prefix functions run test` (pass, 1 skipped), `npm --prefix web run test` (pass).
- 2026-01-31: Completed P3.1 (router Discord delivery, discord message builder + tests; removed direct Discord sends in scheduler triggers). Tests: `npm --prefix functions run test` (pass, 1 skipped), `npm --prefix web run test` (pass).
- 2026-01-31: Re-ran function tests after Timestamp expiry fix in legacy functions. Tests: `npm --prefix functions run test` (pass, 1 skipped).
- 2026-01-31: Ran E2E emulator suite. Tests: `npm --prefix web run test:e2e:emulators` (pass).
- 2026-01-31: Quieted emulator/deprecation noise in `scripts/run-e2e.sh` and re-ran E2E suite. Tests: `npm --prefix web run test:e2e:emulators` (pass).
- 2026-01-31: Added composite Firestore indexes for notification queries and deployed to staging. Tests not run (index-only change).
- 2026-01-31: Fixed `userVoteRef` undefined in scheduler voting flow by returning it from `useSchedulerData`. Tests: `npm --prefix web run test` (pass).
- 2026-01-31: Deployed staging hosting with the `userVoteRef` fix. Tests: `npm --prefix web run test` (pass).
- 2026-01-31: Ran coverage. Tests: `npm --prefix web run test:coverage` (pass), `npm --prefix functions run test -- --coverage` (pass, 1 skipped).
- 2026-01-31: Enabled Discord worker integration test by auto-starting Firestore emulator when needed. Tests: `npm --prefix functions run test -- --coverage` (pass).
