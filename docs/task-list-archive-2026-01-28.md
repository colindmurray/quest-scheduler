# Quest Scheduler — Task List Archive

Archived on: 2026-01-28

This file contains historical task list entries that are not part of the current automated testing migration.

## Phase 0 — Repo + Tooling
- [x] Initialize Vite React app in repo root (web/)
- [x] Add Tailwind CSS setup
- [x] Add shadcn/ui setup (components.json + utils + base Button)
- [x] Add ESLint config (`web/eslint.config.js`)
- [x] 2026-01-28: Resolve web lint errors (hooks, avatars, spinner, auth/theme exports)
- [ ] Add Prettier (optional but recommended)

## Phase 0.5 — Branding
- [x] Rebrand UI and docs to Quest Scheduler
- [x] Add Privacy Policy + Terms of Service pages and link in app
- [x] Add Contact us mailto link (support@questscheduler.cc)
- [x] Replace app icon with new Quest Scheduler logo
- [x] 2026-01-26: Move splash background asset to `web/public/assets/background.jpeg`
- [x] 2026-01-26: Apply splash background image to landing/login page
- [x] 2026-01-26: Add light/dark app background images for logged-in pages
- [x] 2026-01-26: Strengthen light-mode card borders for nested surfaces
- [x] 2026-01-26: Add subtle light-mode shadow for nested cards
- [x] 2026-01-26: Force landing page to dark theme + update branding text styling
- [x] 2026-01-26: Update Privacy Policy + Terms for Discord integration and Google OAuth limited use
- [x] 2026-01-26: Add external policy links and clarify token storage language in legal pages
- [x] 2026-01-28: Update Privacy Policy + Terms for Discord login, public identifiers, and avatar customization

## Phase 1 — Firebase Wiring
- [x] Add Firebase config module
- [x] Add Auth provider (Google)
- [x] Set up Firestore client and base hooks
- [x] Add Firebase CLI config (`firebase.json`, `.firebaserc`)
- [x] Add local Google OAuth client secret file fallback for Cloud Functions
- [x] Migrate Functions config from `functions.config()` to env variables
- [x] Store Google OAuth client JSON in Secret Manager (defineJsonSecret)

## Phase 2 — Data Model + Rules
- [x] Define Firestore collections and document shapes (`docs/implementation-plan.md`)
- [x] Implement security rules
- [x] 2026-01-27: Allow poll creators to delete vote docs to unblock poll deletion with questing groups
- [ ] Seed minimal test data (local only)

## Phase 3 — App Shell
- [x] App layout, theme tokens, fonts
- [x] Router (Dashboard, Scheduler, Settings)
- [x] Protected route guard
- [x] Centralize app-wide constants with env overrides

## Phase 4 — Scheduler Creation
- [x] Date range picker
- [x] Calendar selection (basic slot picking)
- [x] Slot creation + multi-slot per day
- [x] Invitee selection (manual input placeholder)
- [x] Create scheduler + shareable UUID link (basic flow)
- [x] Add "Anyone with link" sharing option and gated access
- [x] Restore calendar click selection for slot creation

## Phase 5 — Voting Experience
- [x] Calendar view with slot chips
- [x] Modal vote editor per day
- [x] List view with Feasible/Preferred
- [x] Submit/edit vote flows
- [ ] Add pending poll invite flow (notifications + dashboard + accept/decline)
- [x] Add pending poll invite flow (notifications + dashboard + accept/decline)
- [x] Enforce accepted participants only; pending invites cannot vote

## Phase 6 — Results + Finalization
- [x] Results view with sorting modes
- [x] Add weekday labels to list/results slot rows
- [x] Sort list slots by date and use date as results tie-breaker
- [x] Creator finalization modal
- [x] Google Calendar event creation (client-side)

## Phase 7 — Re-open Workflow
- [x] Re-open finalized scheduler
- [x] Re-finalize with delete-old-event checkbox
- [x] 2026-01-26: Add calendar update confirmation on reopen/edit/delete actions (delete linked event)

## Phase 8 — Settings
- [x] Default session times per weekday
- [x] Default duration/title/description
- [x] Notifications toggle
- [x] Add delete profile flow with confirmation
- [x] Delete profile removes outgoing friend requests and accepted links
- [x] Update legal pages with account deletion language
- [x] 2026-01-27: Account deletion clears votes from all polls

## Phase 9 — Notifications
- [ ] Configure SMTP credentials + deploy Trigger Email extension (installed; placeholders in `extensions/firestore-send-email.env`)
- [x] Wire questing group invites to create in-app notifications for existing users
- [x] Backfill in-app notifications for pending group invites on login
- [x] Send in-app finalization notifications to poll participants (exclude creator)
- [x] Notify poll creator when someone joins via link or submits votes
- [x] Send poll invite emails + notifications to new participants (exclude creator)
- [x] Add Quest Scheduler logo header to outgoing emails
- [x] 2026-01-25: Fix support email reference in invite email template
- [x] Load friend/group notifications globally on login
- [x] Remove friend/group invite notifications on accept/decline
- [x] Notify inviter when a group invite is accepted
- [x] 2026-01-28: Show notification actors with display names + identifiers (add actor metadata, render via UserIdentity)
- [x] 2026-01-28: Replace email-only labels in polls, groups, and invites with UserIdentity display
- [x] 2026-01-28: Backfill friend request recipient IDs on user creation to strengthen UUID linkage

## Phase 11 — Friends System
- [x] Replace address book with friend requests + accept flow
- [x] Friends page with pending requests + questing groups tab
- [x] Friend invite link that auto-accepts after login
- [x] Allow questing group invites without requiring friendship
- [x] 2026-01-25: Add optional friend request checkbox for non-friend group invites (no extra email)
- [x] Friend invite modal flow for email links
- [x] Pending outgoing requests section + unfriend action
- [x] Questing group invite revocation + accept/decline permissions
- [x] Harden friend/group notifications and group leave/remove flows against permission edge cases
- [x] Fix outgoing friend request list query to use sender UID
- [x] Make notification actions update UI immediately (optimistic updates)
- [x] Allow friend request reads/removals by sender email to prevent one-sided visibility
- [x] Optimistically remove unfriended users from the friends list UI
- [x] Delete all historical friend request docs on unfriend so re-requests work
- [x] Auto-remove friend/group notifications when accepting/declining in Friends & Groups

## Phase 10 — QA + Deployment
- [ ] Manual test plan + bug fixes
- [x] Add unit tests for invite notification wiring
- [x] Deploy setup config (hosting predeploy + runbook)
- [x] Deploy Firestore rules + hosting
- [ ] Verify Google OAuth scopes in production
- [x] 2026-01-26: Remove calendar scopes from login; limit calendar OAuth scopes to calendar events + calendar list read
- [x] 2026-01-26: Tighten privacy policy language to state no calendar event details are read
- [x] 2026-01-26: Clarify friendRequests collection represents full friendship lifecycle in implementation plan
- [x] 2026-01-26: Add Google Identity Services button on /auth with env-configured client ID
- [x] Remove legacy App Hosting backend (`studio`) so only Hosting remains

## Phase 14 — Calendar Auth Integrity
- [x] Fix Settings permissions read regression
- [x] Enforce calendar OAuth account matches signed-in email
- [x] Surface expired calendar auth in Settings flow
- [x] Deploy calendar auth fixes (functions + rules + hosting)

## Phase 12 — Abuse Prevention + Invite Limits
- [x] Define invite/abuse fields on user profiles (allowance, suspension, blocked list)
- [x] Add Cloud Function endpoints to enforce invite limits and blocked users
- [x] Wire friend request + poll invite flows through server enforcement
- [x] Add blocked users UI in Friends & Groups
- [x] Enforce suspension + banned email checks on login

## Phase 13 — Questing Group Participants
- [x] Highlight questing group on poll view and mark group members
- [x] Prevent removal of participants added via questing group
- [x] Persist questing group selection on edit + remove non-group participants on change
- [x] Match poll view group styling to Create Poll group bubble + fix edit prefill
- [x] Hide group members from duplicate participant list + align color fallback
- [x] 2026-01-25: Treat questing group members as implicit poll participants (rules + dashboard + Discord)
- [x] 2026-01-26: Include questing group selection in clone poll dialog
- [x] 2026-01-26: Allow poll creators to clone and retain all votes via server-side clone
- [x] 2026-01-26: Improve clone poll invitees (hide group members, show group card, filter recommendations)
- [x] 2026-01-26: Add public Discord bot install page and invite flow
- [x] 2026-01-26: Add Discord bot install link in account menu
- [x] 2026-01-26: Remove bot permissions integer from UI and add Discord logo to install CTA
- [x] 2026-01-26: Swap Discord CTA logo asset and restyle button to Discord palette
- [x] 2026-01-26: Center Discord CTA and move permissions note below
- [x] 2026-01-27: Clean up group member poll votes/invites via callable removal

## Phase 15 — Discord Integration (Design)
- [x] Draft Discord bot feature design doc (poll voting for questing groups)
- [x] Add API contract + Mermaid sequence diagrams + verification notes
- [x] 2026-01-25: Review discord bot design doc; update for data-model alignment, security hardening, and rate-limit handling
- [x] 2026-01-25: Finalize Discord design doc with bootstrap link flow, interaction response matrix, and reconciliation details
- [x] 2026-01-25: Re-validate Discord bot design with current API constraints; refine UX, permissions, and runtime guidance
- [x] 2026-01-25: Update Discord design doc with interaction response fixes, permissions checks, thread/channel metadata, and refreshed API constraints
- [x] 2026-01-25: Refine Discord design doc for low-cost pagination fallback, permission bitfield correction, signature verification guidance, and safer post-response processing
- [x] 2026-01-25: Reconcile external AI edits on Discord design doc; fix CPU allocation wording, task size limits, permissions bitfield, and add data integrity + idempotency checks

## Phase 16 — Discord Integration (MVP)
- [ ] 2026-01-25: Kickoff MVP implementation (infra + ingress/worker + OAuth + group link UI + poll posting/voting flows). Cloud Tasks API/queue/IAM + Functions deploy completed; Discord portal steps still pending.
- [x] 2026-01-25: Reduce Discord interaction timeouts by replying before Cloud Task enqueue (redeployed discordInteractions).
- [x] 2026-01-25: Clear Discord voting UI after submit to prevent repeated clicks (redeployed processDiscordInteraction).
- [x] 2026-01-25: Show Discord link status when channel name is unavailable (fallback to channelId on group settings card).
- [x] 2026-01-25: Render Discord vote slot labels in scheduler timezone instead of server default.
- [x] 2026-01-25: Avoid duplicate ephemeral vote panels by deferring updates for select/submit interactions.
- [x] 2026-01-25: Clarify Discord vote dropdown labels for preferred vs feasible selections.
- [x] 2026-01-25: Add inline labels above Discord vote dropdowns using disabled buttons.
- [x] 2026-01-25: Keep preferred selections automatically included in feasible selections for Discord voting.
- [x] 2026-01-26: Landing page highlights Discord voting support with a Discord callout.
- [x] 2026-01-26: Add Discord voting actions for "Clear my votes" and "None work for me".
- [x] 2026-01-26: Add Discord voting pagination for polls with more than 25 slots.
- [x] 2026-01-26: Centralize Discord voting error messages and refresh finalized/stale/authorization text.
- [x] 2026-01-26: Debounce Discord poll updates with Cloud Tasks + lastSyncedHash checks.
- [x] 2026-01-26: Add Discord account unlink flow (callable + Settings UI).
- [x] 2026-01-26: Add Discord unlink-group slash command and handler.
- [x] 2026-01-26: Add Discord link code rate limits, attempt caps, and admin permission checks.
- [x] 2026-01-26: Show Discord poll sync status, View-in-Discord link, and Discord vote badges.
- [x] 2026-01-26: Add Discord structured logging, latency tracking, and pendingSync retries.
- [x] 2026-01-26: Close Discord vote panel when selecting "None work for me".
- [x] 2026-01-26: Announce finalized polls in Discord with notifyRoleId/@everyone mentions.
- [x] 2026-01-26: Sync Discord messages on poll delete/unlink/relink and expose notify role selection in group settings.
- [x] 2026-01-26: Add "No ping" option for Discord finalization notifications.
- [x] 2026-01-26: Clear Discord voting UI for closed polls and post reopen alerts with @ mentions.
- [x] 2026-01-27: Show voting progress in Discord poll widget (X/Y voted with pending count).

## Phase 17 — Login & Registration Overhaul
- [x] Add `/auth` route + unified auth UI (Google + Email/Password).
- [x] Ensure user profile docs created on sign-in + auth trigger backup.
- [x] Add verification banner and enforce verified email for poll/group creation.
- [x] Add account linking UI + calendar linking conflict checks.
- [x] Add admin user tool script for delete/suspend/invite allowance updates.
- [x] 2026-01-27: Draft Discord login portal design doc (`docs/discord-login-portal.md`).
- [x] 2026-01-27: Update Discord login portal doc with Discord ID invites + display-name privacy requirements.
- [ ] 2026-01-28: Implement Discord OAuth login flow (start/callback + finish route) and `/auth` Discord button.
- [x] 2026-01-27: Finalize Discord login email requirement (verified email required; compatible with UUID migration).

## Phase 18 — UUID Migration (Phase 1)
- [x] 2026-01-28: Add scheduler `participantIds` + questing group `memberIds` on create/update flows.
- [x] 2026-01-28: Add `voterId` to vote writes (client + clone paths).
- [x] 2026-01-28: Allow `participantIds`/`memberIds` updates in Firestore rules.
- [x] 2026-01-28: Switch friend request creation + accept-invite link to auto IDs (field-based lookup).
- [x] 2026-01-28: Update block checks to support auto-ID blockedUsers docs and legacy email-keyed docs.
- [x] 2026-01-28: Add `functions/scripts/migrate-uuid-identifiers.js` (participantIds/memberIds/voterId backfill).
- [x] 2026-01-28: Run UUID backfill script with qs-admin-tools service account.
- [x] 2026-01-28: Dual-read scheduler/group membership via uid arrays + email fallback.
- [x] 2026-01-28: Enforce group invite blocking server-side (callable) + remove direct pendingInvites writes.
- [x] 2026-01-27: Extend Discord login portal doc for username invites + blacklist/abuse rules.
- [x] 2026-01-28: Switch scheduler/group reads to UID-only (remove participants/members usage).
- [x] 2026-01-28: Update Firestore rules for UID-only participant/member checks.
- [x] 2026-01-28: Extend UUID migration script with `--cleanup` to remove legacy fields.
- [ ] 2026-01-28: Run UUID cleanup (`--cleanup`) after verifying backfill + rules in prod.
- [ ] Manual QA for auth scenarios + Firebase Console checks (providers, one-account-per-email).

## Phase 18 — Calendar Event Sync (Design)
- [x] 2026-01-27: Draft calendar event sync design doc (`docs/calendar_event_sync_design_doc.md`)

## Phase 19 — Display Names and Usernames (Design)
- [x] 2026-01-27: Draft display names and usernames design doc (`docs/display-names-and-usernames.md`)
- [x] 2026-01-27: Update UUID migration + Discord login portal docs with cross-references and extensibility notes
- [x] 2026-01-27: Add invite identifier resolution section (email/Discord username/@username with error handling)
- [x] 2026-01-27: Remove Discord User ID invites; simplify to Discord username only (no pending Discord invites)
