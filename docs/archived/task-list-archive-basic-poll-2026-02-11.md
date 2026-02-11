---
created: 2026-02-11
lastUpdated: 2026-02-11
summary: "Archived global task list state prior to the current basic-poll-focused task tracker reset."
category: TASK_TRACKER
status: OBSOLETE
implementationStatus: DEPRECATED
note: "Historical archive retained for traceability after task-list reset."
changelog:
  - "2026-02-11: Document present in workspace (no git history available)."
---

> [!WARNING]
> This document is **obsolete/deprecated** and retained for historical context only. Do not use it to drive active implementation decisions.

# Quest Scheduler — Task List

## Test Plan Execution Checkpoint
- Last Completed: P3.1 Discord routing + rate limits
- Next Step: Complete
- Open Issues: None
- Last Updated (YYYY-MM-DD): 2026-01-31

## Progress Notes
- 2026-01-31: Archived prior task list to docs/task-list-archive-unified-notification-overhaul-2026-01-31.md.
- 2026-01-31: Ran Claude + Gemini reviews for the plan and task list; incorporated feedback into docs/unified-notification-overhaul.md and docs/decisions.md.
- 2026-01-31: Created docs/plan-execution/unified-notification-overhaul-task-list.md and the execute-plan-unified-notification-overhaul skill.
- 2026-01-31: Tests not run (docs-only changes).
- 2026-01-31: Completed P0.1 (notification constants + alias resolver + rules skeleton). Tests: `npm --prefix functions run test` (pass, 1 skipped).
- 2026-01-31: Completed P0.2 (Firestore rules + rules tests; adjusted pendingNotifications path). Tests: `npm --prefix web run test:rules` (pass).
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
- 2026-01-31: Added staging Firebase config overrides + build script + runbook updates. Tests: `npm --prefix web run test` (pass).
- 2026-01-31: Added `web/.env.staging` with staging Firebase config. Tests not run (env-only change).
- 2026-01-31: Ignored staging OAuth client secret file in `.gitignore`. Tests not run (config change only).
- 2026-01-31: Set `QS_GOOGLE_OAUTH_CLIENT_JSON` Secret Manager value for staging (version 1). Tests not run (infra change only).
- 2026-01-31: Deploy attempt failed; missing secret `DISCORD_APPLICATION_ID` for staging. Need value before retry.
- 2026-01-31: Set staging Discord secrets `DISCORD_PUBLIC_KEY`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_APPLICATION_ID` (v1). Missing `DISCORD_BOT_TOKEN` to deploy.
- 2026-01-31: Set staging `DISCORD_BOT_TOKEN` (v1). Deploy succeeded for hosting/rules/extensions, but some 2nd-gen functions failed due to Eventarc service agent propagation; retry needed.
- 2026-01-31: Updated Discord OAuth tests to read env client values when present. Tests: `npm --prefix functions run test` (pass; 1 skipped: worker integration requires emulator).
- 2026-01-31: Ran functions tests with Firestore emulator. Tests: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm --prefix functions run test` (pass).
- 2026-01-31: Deployed staging (hosting/functions/firestore/storage/extensions). Follow-up: set Functions artifacts cleanup policy in us-central1.
- 2026-01-31: Re-deployed hosting to finalize live release. Hosting URL live at https://quest-scheduler-stg.web.app (and firebaseapp.com alias).
- 2026-01-31: Set staging Google OAuth client ID in `web/.env.staging` and re-deployed hosting. Tests not run (env-only change + deploy).
- 2026-01-31: Allowed Discord (custom provider) to pass email verification check in Firestore rules. Tests: `npm --prefix web run test:rules` (pass).
- 2026-01-31: Deployed updated Firestore rules to staging project.
- 2026-01-31: Granted `roles/iam.serviceAccountTokenCreator` to quest-scheduler-stg@appspot.gserviceaccount.com for Discord custom token signing.
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
- 2026-01-31: Fixed leave poll flow to delete votes before removing participant; added call-order assertions. Tests: `npm --prefix web run test -- pollInvites.test.js` (pass).
- 2026-01-31: Added account dropdown feedback form + feedback data layer, Firestore/Storage rules, and tests. Tests: `npm --prefix web run test -- feedback` (pass), `npm --prefix web run test:rules` (pass).
- 2026-01-31: Switched feedback flow to modal launched from account dropdown. Tests: `npm --prefix web run test -- feedback` (pass).
- 2026-01-31: Deployed feedback modal + rules to staging. Deploy: `firebase deploy --project staging --only hosting,firestore:rules,storage` (success).
- 2026-01-31: Re-deployed staging hosting with `VITE_BUILD_MODE=staging` to fix Google OAuth origin mismatch. Deploy: `VITE_BUILD_MODE=staging firebase deploy --project staging --only hosting` (success).
- 2026-01-31: Added `scripts/deploy-staging.sh` and `scripts/deploy-prod.sh` to enforce build mode; updated runbook. Tests not run (script/docs change).
- 2026-01-31: Updated poll invite flow so pending invites are participants, declines remove votes/participants, and UI now distinguishes pending invites; excluded pending invites from active dashboard lists. Tests: `npm --prefix web run test -- pollInvites.test.js` (pass), `npm --prefix web run test:rules` (pass; emulator warnings), `npm --prefix functions run test -- legacy.callables.test.js` (pass; legacy stderr logged).
- 2026-01-31: Fixed dashboard pending invite filtering fallback, forced invite modal open when pending, and normalized auth email in Firestore rules. Tests: `npm --prefix web run test:rules` (pass; emulator warnings).
- 2026-01-31: Added dashboard quick accept/decline buttons for pending invites and covered with tests. Tests: `npm --prefix web run test -- DashboardPage.test.jsx` (pass; JSX transform warning).
- 2026-01-31: Adjusted poll invite creation/edit/clone to treat all invitees as pending, updated clone callable pendingInvites, and kept dashboard quick actions. Tests: `npm --prefix functions run test -- legacy.clone.test.js` (pass), `npm --prefix web run test -- DashboardPage.test.jsx` (pass; JSX transform warning).
- 2026-01-31: Reworked poll invite saving/creation to send all invites as pending, adjusted cloneSchedulerPoll pendingInvites, and redeployed staging (hosting + functions). Tests: `npm --prefix functions run test -- legacy.clone.test.js` (pass), `npm --prefix web run test -- DashboardPage.test.jsx` (pass; JSX transform warning).
- 2026-01-31: Fixed sendPollInvites to keep pending invites even when invitees are already participants (non-group), expanded e2e seed data for poll invite scenarios, and added poll-invite flow e2e coverage (chromium-only, stateful). Tests: `npm --prefix functions run test -- legacy.callables.test.js` (pass), `npm --prefix web run test:e2e:emulators` (pass; poll-invite-flow skipped on firefox/mobile).
- 2026-01-31: Deployed updated functions (sendPollInvites pending-invite fix) to staging. Deploy: `firebase deploy --only functions --project quest-scheduler-stg` (success).
- 2026-01-31: Added edge-case coverage updates (poll invite e2e pending-session assertions, decline-by-email unit test, invitee-accept rules test). Tests pending.
- 2026-01-31: Edge-case pass tests. Tests: `npm --prefix web run test -- pollInvites.test.js` (pass), `npm --prefix web run test:rules` (pass; emulator permission warnings), `npm --prefix web run test:e2e:emulators` (pass; poll-invite-flow skipped on firefox/mobile).
- 2026-01-31: Added auto-dismiss of poll invite notifications on accept/decline, e2e check for auto-clear on decline, and function coverage for email-only invites. Tests pending.
- 2026-01-31: Auto-clear notifications on poll invite accept/decline implemented + coverage. Tests: `npm --prefix functions run test -- legacy.callables.test.js` (pass), `npm --prefix web run test -- pollInvites.test.js` (pass), `npm --prefix web run test:rules` (pass; emulator permission warnings), `npm --prefix web run test:e2e:emulators` (pass; poll-invite-flow skipped on firefox/mobile).
- 2026-01-31: Added friend/group invite auto-dismiss handling (accept/decline), suppressed blocked group invites, added friend request revoke callable + outgoing cancel UI, and expanded auto-clear coverage. Tests: `npm --prefix web run test -- friends.test.js questingGroups.test.js` (pass), `npm --prefix functions run test -- legacy.callables.test.js notifications/auto-clear.test.js` (pass; legacy stderr logged).
- 2026-01-31: Hardened invite notification clearing (delete fallback + waitForPendingWrites), verified pending invite persistence, and stabilized friend/group invite e2e selectors/timing (modal targeting + invite button scoping). Tests: `npm --prefix web run test -- pollInvites.test.js` (pass), `npm --prefix web run test -- friends.test.js` (pass), `npm --prefix web run test -- questingGroups.test.js` (pass), `npm --prefix web run test:e2e:emulators` (pass).
- 2026-01-31: Sanity run all test suites (web/functions/unit/rules/e2e/coverage). Tests: `npm --prefix web run test` (pass), `npm --prefix functions run test` (pass), `npm --prefix web run test:rules` (pass; emulator permission warnings), `npm --prefix web run test:e2e:emulators` (pass; 20 skipped), `npm --prefix web run test:coverage` (pass), `npm --prefix functions run test -- --coverage` (pass).
- 2026-01-31: Deployed staging (hosting + firestore rules/indexes + storage rules) with `VITE_BUILD_MODE=staging`. Deploy: `scripts/deploy-staging.sh` (success; rules ternary type warning).
- 2026-01-31: Deployed production (hosting + functions + firestore rules/indexes + storage rules) with `VITE_BUILD_MODE=production`. Deploy: `DEPLOY_ONLY=hosting,functions,firestore,storage scripts/deploy-prod.sh` (success; rules ternary type warning).
- 2026-02-01: Added composite Firestore indexes for schedulers pending invite queries (creatorEmail/creatorId + pendingInvites). Tests not run (index-only change).
- 2026-02-01: Added missing in-app notification templates (poll created/ready/reminder/cancelled/restored/deleted, friend removed, group deleted) and expanded auto-clear rules/tests for poll delete/restore and group delete; documented auto-clear rationale in decisions. Tests pending.
- 2026-02-01: Expanded notification E2E coverage (all in-app templates + auto-clear flows), added notifier seed data for auto-clear invite scenarios, and stabilized revoke-invite selectors. Tests: `npm --prefix functions run test -- notifications/auto-clear.test.js notifications/templates.test.js` (pass), `npm --prefix web run test:e2e:emulators` (pass; 24 skipped).
- 2026-02-01: Added WebKit project to Playwright E2E and adjusted auth profile sync to avoid indefinite loading in WebKit; set emulator host to `localhost` for E2E. Tests: `npm --prefix web run test:e2e:emulators` (pass; 36 skipped).
- 2026-02-01: Added pending-notification cleanup for revoked/blocked invites (poll/friend/group), expanded unit coverage for email-only revoke paths + blocked poll invites, and tightened auto-clear E2E scenarios (poll invite revoked, friend decline). Tests: `npm --prefix functions run test -- legacy.callables.test.js` (pass; legacy stderr logged), `npm --prefix web run test:e2e:emulators` (pass; 36 skipped).
- 2026-02-02: Investigated Discord OAuth invalid redirect reports; prod deploys may be inheriting `DISCORD_OAUTH_REDIRECT_URI` from `functions/.env` (localhost) because `functions/.env.studio-473406021-87ead` does not override it, leading to mismatched redirect URIs in Discord. Tests not run (investigation only).
- 2026-02-02: Hardened Discord OAuth redirect handling (ignore localhost override outside emulator), set prod redirect in `functions/.env.studio-473406021-87ead`, and documented env guidance. Tests: `npm --prefix functions run test -- src/discord/oauth.test.js` (pass).
- 2026-02-02: Deployed functions to staging via `DEPLOY_ONLY=functions ./scripts/deploy-staging.sh`. Tests not run.
- 2026-02-02: Moved local-only functions env to `functions/.env.local`, added staging env file, and introduced `scripts/run-emulators-local.sh` for emulator startup; updated runbook/testing docs and gitignore. Tests: `npm --prefix functions run test -- src/discord/oauth.test.js` (pass).
- 2026-02-02: Re-deployed staging functions after env separation (`DEPLOY_ONLY=functions ./scripts/deploy-staging.sh`). Tests not run.
- 2026-02-02: Switched staging Discord OAuth redirect to the Cloud Run URL and updated local emulator redirect; redeployed staging functions (`DEPLOY_ONLY=functions ./scripts/deploy-staging.sh`). Tests not run.
- 2026-02-02: Switched prod Discord OAuth redirect to Cloud Run URL and re-deployed prod functions (`DEPLOY_ONLY=functions ./scripts/deploy-prod.sh`). Tests not run.
- 2026-02-02: Added Discord link test-message cleanup, Discord poll repost callable + UI menu option, and private-channel warning text. Tests: `npm --prefix functions run test -- src/discord/worker.handlers.test.js src/discord/discord-client.test.js src/discord/repost.test.js` (pass), `npm --prefix web run test -- src/lib/data/discord.test.js src/features/settings/components/GroupCard.test.jsx` (pass).
- 2026-02-02: Added Discord link permission preflight + test message, plus private-channel warning in settings UI. Tests: `npm --prefix functions run test -- src/discord/worker.handlers.test.js` (pass), `npm --prefix web run test -- GroupCard.test.jsx` (pass).
- 2026-02-02: Added poll timezone display + auto-convert setting across web + Discord (timezone abbreviations everywhere; Discord vote labels/poll cards updated). Tests: `npm --prefix web run test -- poll-card-utils.test.js time.test.js` (pass), `npm --prefix functions run test -- discord/poll-card.test.js discord/worker.helpers.test.js` (pass).
- 2026-02-02: Deployed staging hosting/storage/firestore via `scripts/deploy-staging.sh` (success). Tests not run as part of deploy.
- 2026-02-02: Deployed production hosting/storage/firestore via `scripts/deploy-prod.sh` (success). Tests not run as part of deploy.
- 2026-02-02: Fixed session poll header timezone to respect auto-convert display timezone. Tests: `npm --prefix web run test -- poll-status-meta.test.jsx` (pass).
- 2026-02-02: Re-deployed staging + production hosting/storage/firestore for poll header timezone fix (`scripts/deploy-staging.sh`, `scripts/deploy-prod.sh`). Tests not run as part of deploy.
- 2026-02-02: Added conditional "Hide timezone" setting when auto-convert is enabled; hide TZ labels across scheduler/dashboard when checked. Tests: `npm --prefix web run test -- time.test.js poll-status-meta.test.jsx` (pass).
- 2026-02-02: Re-ran settings/timezone tests after hide-timezone toggle update. Tests: `npm --prefix web run test -- time.test.js poll-status-meta.test.jsx` (pass).
- 2026-02-02: Deployed staging hosting/storage/firestore via `scripts/deploy-staging.sh` (success).
- 2026-02-02: Deployed production hosting/storage/firestore via `scripts/deploy-prod.sh` (success).
- 2026-02-02: Added all-votes-in notifications (creator + participant opt-in), Discord toggle, and updated templates/docs. Tests: `npm --prefix functions run test -- notifications/constants.test.js notifications/templates.test.js notifications/discord.test.js notifications/auto-clear.test.js` (pass), `npm --prefix web run test -- GroupCard.test.jsx` (pass), `npm --prefix web run test:e2e:emulators` (fail: notification-types timeout), `npm --prefix web run test:e2e:emulators` (pass).
- 2026-02-02: Added required attendance filter selector to session poll results panel, plus filtering helpers and tests. Tests: `npm --prefix web run test -- required-attendance.test.js` (pass).
- 2026-02-02: Ran full test suite for avatar/identity consolidation + Discord worker fix. Tests: `npm --prefix web run test` (pass), `npm --prefix functions run test` (pass), `npm --prefix web run test:rules` (pass), `npm --prefix web run test:e2e:emulators` (pass; 36 skipped).
- 2026-02-02: Deployed staging (hosting/functions/firestore/storage) with `DEPLOY_ONLY=hosting,functions,firestore,storage scripts/deploy-staging.sh` (success).
- 2026-02-02: Deployed production (hosting/functions/firestore/storage) with `DEPLOY_ONLY=hosting,functions,firestore,storage scripts/deploy-prod.sh` (success).
- 2026-02-02: Ignored local env + Gemini settings files in `.gitignore`. Tests not run (ignore-only change).
- 2026-02-02: Centralized avatar + identity rendering for user bubbles across scheduler/friends/groups/invites; updated identity helpers and avatar components. Tests: `npm --prefix web run test -- --run src/lib/identity.test.js src/components/UserIdentity.test.jsx src/components/ui/avatar.test.jsx src/components/ui/voter-avatars.test.jsx` (pass).
- 2026-02-10: Implemented "Copy votes" modal flow (eligible poll dropdown, pending-invite auto-accept callout, future-slot-only copy, overlap warnings, `noTimesWork` support) with centralized matching logic + unit tests.
- 2026-02-10: Implemented "Auto-block conflicts" setting with centralized conflict + effective-tally logic; Cloud Functions triggers now maintain `usersPublic/{uid}.busyWindows` off finalized polls; UI shows "Busy (ignored in results)" with link to blocking poll.
- 2026-02-10: Fixed a `SchedulerPage` runtime crash (hook ordering) that was blanking the UI under Playwright E2E.
- 2026-02-10: Stabilized new E2E specs by running them chromium-only (shared emulator state mutation).
- 2026-02-10: Tests: `npm --prefix web run test` (pass), `npm --prefix functions run test` (pass), `npm --prefix web run test:integration` (pass), `npm --prefix web run test:e2e:emulators` (pass), `npm --prefix web run test:rules` (pass).
- 2026-02-10: Expanded Copy Votes + auto-block conflicts coverage (eligibility helper + tests, more matching cases, busy-windows trigger cases, usersPublic rules hardening) and re-ran full test gate. Tests: `npm --prefix web run test` (pass), `npm --prefix functions run test` (pass), `npm --prefix web run test:rules` (pass), `npm --prefix web run test:integration` (pass), `npm --prefix web run test:e2e:emulators` (pass).
- 2026-02-10: Deployed to staging. Deploy: `DEPLOY_ONLY=hosting,functions,firestore,storage ./scripts/deploy-staging.sh` (success).
- 2026-02-10: Deployed to production. Deploy: `DEPLOY_ONLY=hosting,functions,firestore,storage ./scripts/deploy-prod.sh` (success).
- 2026-02-10: Fixed poll finalize/reopen Discord notifications not firing when there are no in-app/email recipients (Discord is a group broadcast). Centralized emission gate in `web/src/features/scheduler/utils/poll-lifecycle-notifications.js` + unit coverage. Tests: `npm --prefix web run test` (pass), `npm --prefix web run test:integration` (pass).
- 2026-02-10: Fixed notification-event Discord delivery in Cloud Functions by attaching `DISCORD_BOT_TOKEN` secret to `processNotificationEvent` (required for finalize/reopen/cancel/delete Discord posts). Tests: `npm --prefix functions run test` (pass).
- 2026-02-10: Deployed hosting fix to staging + prod. Deploy: `DEPLOY_ONLY=hosting ./scripts/deploy-staging.sh` (success), `DEPLOY_ONLY=hosting ./scripts/deploy-prod.sh` (success).
- 2026-02-10: Deployed functions fix to staging + prod. Deploy: `DEPLOY_ONLY=functions ./scripts/deploy-staging.sh` (success), `DEPLOY_ONLY=functions ./scripts/deploy-prod.sh` (success).
- 2026-02-10: Added basic poll design spec (group-linked standalone + scheduler-embedded) with Discord + unified-notifications integration notes. Tests not run (docs-only change).
- 2026-02-10: Cross-checked `docs/basic-poll.md` against current Firestore rules, group/poll invite flows, Discord ingress/worker, and scheduler Discord triggers; updated the doc with “Reality check” notes (eligibility, required cleanup touchpoints, and deadline automation constraints). Tests not run (docs-only change).
- 2026-02-10: Expanded `docs/basic-poll.md` with session-poll lifecycle edge cases for embedded polls (delete/cancel/finalize/reopen, participant and group eligibility changes, required-toggle semantics, vote reset rules, and finalize warnings that do not hard-block). Tests not run (docs-only change).
- 2026-02-10: Added remaining edge cases to `docs/basic-poll.md` (archive semantics, link-sharing disable behavior, user deletion cleanup, blocking effects, Discord UI limits, and Discord race-condition handling). Tests not run (docs-only change).
- 2026-02-11: Updated `docs/basic-poll.md` and `docs/basic-poll-tasks.md` for consistency with the robustness review (rules-enforced deadline language, standalone-vs-embedded status clarity, server-side notification ownership, finalized snapshot guidance, Discord command/path alignment, and task-list acceptance criteria). Tests not run (docs-only change).
