---
created: 2026-02-11
lastUpdated: 2026-02-11
summary: "Execution task list for the basic polls initiative, organized by phase, priority, and dependencies."
category: TASK_TRACKER
status: CURRENT
implementationStatus: ONGOING
note: "Active task tracker for the current long-running basic-poll implementation plan."
changelog:
  - "2026-02-11: Updated Phase 1/4 and testing expectations for independent embedded poll finalize/reopen behavior."
  - "2026-02-11: Document present in workspace (no git history available)."
---

# Basic Polls — Task List

Ordered by logical dependency and priority. **P1–P2** are required for a shippable feature. **P3–P4** are nice-to-haves that can be dropped or deferred.

## Branching Strategy

1. **`feature/basic-polls`** — branch off `master`. Implement Phases 1–11 (core basic polls + Discord poll-create/finalize). Merge to `master` once fully tested and validated.
2. **`feature/discord-session-create`** — branch off `feature/basic-polls` (after it's merged to `master`, or off `master` post-merge). Implement Phase 12 (Discord session-create) and any remaining P3/P4 items from Phase 13 that depend on a stable basic polls foundation.

This prevents the session-create work from blocking the core feature, while keeping a clean dependency chain.

---

## Phase 1: Data Model & Security Rules

### 1.1 — Firestore rules: group-linked basic polls (P1)
Add rule matches for `questingGroups/{groupId}/basicPolls/{pollId}` and `.../votes/{uid}`.
- Read: group members only (`isGroupMember`)
- Create/update poll: group managers only (`isGroupManager`)
- Create/update vote: group members; only own vote doc (`request.auth.uid == uid`) **and** poll is writable (`status == "OPEN"` and deadline not passed)
- Delete poll: group managers
- Delete vote: own vote or group manager, only while poll is writable
- Finalize/reopen: group managers (update `status`)
**Accept:** rules tests cover member read, manager create/edit/finalize, non-member denied, own-vote-only write, and vote write blocked after finalize/deadline.

### 1.2 — Firestore rules: scheduler-embedded basic polls (P1)
Add rule matches for `schedulers/{schedulerId}/basicPolls/{pollId}` and `.../votes/{uid}`.
- Read: `canReadScheduler(parentData)`
- Create/update poll: `isCreator(parentData)` (scheduler creator only)
- Create/update vote: `canVoteScheduler(parentData)`; only own vote doc; parent scheduler must not be `CANCELLED`; embedded poll must be `OPEN`; embedded poll deadline (if set) must be in the future
- Delete poll: scheduler creator
- Delete vote: own vote or scheduler creator, only while writable
**Accept:** rules tests cover scheduler participant vote, creator poll CRUD, non-participant denied, and vote writes blocked when embedded poll is finalized, scheduler is cancelled, or deadline is passed.

### 1.3 — Firestore indexes (P1)
Add indexes in `firestore.indexes.json` for:
- `questingGroups/{gId}/basicPolls` composite on `status` + `createdAt`
- `schedulers/{sId}/basicPolls` composite on `order`
- Collection group `votes` under `basicPolls` (if needed for cleanup queries)
**Accept:** emulator runs without missing-index errors for the queries used in 2.x tasks.

---

## Phase 2: Data Layer (Web)

### 2.1 — Data access: group-linked basic polls CRUD (P1)
Create `web/src/lib/data/basicPolls.js` (or extend existing data layer) with:
- `createBasicPoll(groupId, pollData)`
- `updateBasicPoll(groupId, pollId, updates)`
- `deleteBasicPoll(groupId, pollId)` — deletes poll doc + all vote subdocs
- `finalizeBasicPoll(groupId, pollId)`
- `reopenBasicPoll(groupId, pollId)`
- `subscribeToGroupPolls(groupId, callback)` — real-time listener
- `subscribeToBasicPoll(groupId, pollId, callback)` — single poll listener
**Accept:** unit tests for each function; integration tests against emulator.

### 2.2 — Data access: basic poll votes (P1)
Add to the same module:
- `submitBasicPollVote(parentType, parentId, pollId, userId, voteData)`
- `deleteBasicPollVote(parentType, parentId, pollId, userId)`
- `subscribeToBasicPollVotes(parentType, parentId, pollId, callback)`
- `subscribeToMyBasicPollVote(parentType, parentId, pollId, userId, callback)`
Supports both `"group"` and `"scheduler"` parent types to resolve the correct subcollection path.
**Accept:** unit tests; emulator integration test for vote create/update/delete/subscribe.

### 2.3 — Data access: scheduler-embedded basic polls CRUD (P1)
Extend data layer with:
- `createEmbeddedBasicPoll(schedulerId, pollData)`
- `updateEmbeddedBasicPoll(schedulerId, pollId, updates)`
- `deleteEmbeddedBasicPoll(schedulerId, pollId)` — deletes poll doc + all vote subdocs
- `reorderEmbeddedBasicPolls(schedulerId, pollIds)` — batch-update `order` fields
- `subscribeToEmbeddedBasicPolls(schedulerId, callback)`
**Accept:** unit tests; emulator integration test.

### 2.4 — Data access: deletion cleanup extensions (P1)
Extend existing deletion flows:
- `removeParticipantFromPoll` in `pollInvites.js`: also delete `schedulers/{sId}/basicPolls/*/votes/{uid}`
- `deleteQuestingGroup` in `questingGroups.js`: also delete `questingGroups/{gId}/basicPolls/*` and their votes (or switch to server-side `recursiveDelete`)
- Scheduler deletion flow in `SchedulerPage.jsx`: also delete embedded basic polls + votes before deleting scheduler doc
**Accept:** integration tests verify no orphaned basic poll docs after participant removal, group deletion, scheduler deletion.

---

## Phase 3: Core Web UI — Standalone Group-Linked Polls

### 3.1 — GroupPollPage: routing & shell (P1)
- Add route `/groups/:groupId/polls/:pollId` to `App.jsx` → new `GroupPollPage` component
- Auth guard: must be signed in + group member
- Shell: loads poll via real-time listener, shows loading/error/not-found states
**Accept:** navigating to route renders the shell; non-members see access denied.

### 3.2 — GroupPollPage: voting UI — multiple choice (P1)
- Single-select and multi-select option lists
- Submit / clear vote actions
- `allowWriteIn` → "Other" text input with validation (trim, max length, non-empty)
- Live results bar chart (vote counts + percentages, sorted by count)
- Voter breakdown (expandable avatar chips per option)
- Empty state ("No votes yet")
**Accept:** can cast/change/clear multiple-choice votes; live results update in real time.

### 3.3 — GroupPollPage: voting UI — ranked choice (P1)
- Draggable reorderable list (`@dnd-kit/sortable`)
- Mobile fallback: up/down arrow buttons alongside drag handles
- Unranked section for options not yet ranked
- Submit ranking / clear ranking actions
- Live results: raw first-choice vote counts bar chart (no IRV computation while open)
**Accept:** can drag-to-rank, use arrow buttons on mobile, submit partial rankings; live first-choice counts display.

### 3.4 — GroupPollPage: results display — multiple choice (P1)
- Horizontal bar chart with vote count + percentage
- Winner highlight (accent color, bold)
- `allowMultiple`: percentages as "X of N voters"
- `allowWriteIn`: group identical write-ins (case-insensitive)
- Voter breakdown (expandable)
**Accept:** finalized poll shows correct results; matches design doc format.

### 3.5 — GroupPollPage: results display — ranked choice (P1)
- Static results summary: winner + round-by-round breakdown table
- Exhausted ballot counts per round
- Tie display with creator tiebreaker prompt
**Accept:** IRV algorithm produces correct results for test cases (majority win, multi-round elimination, tie, partial rankings, exhausted ballots).

### 3.6 — GroupPollPage: edit mode for managers (P1)
- "Edit" toggle for group managers
- Edit title, description (markdown Write/Preview textarea)
- Edit options: label, reorder (drag), add, remove (blocked if votes exist)
- Option note modal (markdown Write/Preview textarea + rendered preview)
- Edit settings: voteType, allowMultiple, maxSelections, allowWriteIn, deadlineAt
- Unsafe edit → vote reset confirmation dialog
**Accept:** managers can edit all fields; unsafe edits prompt vote reset; non-managers cannot access edit mode.

### 3.7 — Group card: polls section (P1)
Add a "Polls" section to `GroupCard.jsx` (or modal):
- "Create poll" button → creation modal
- List of open polls (title, vote type badge, "X/Y voted", deadline)
- Recent finalized polls (last 5)
- Each links to `/groups/:groupId/polls/:pollId`
**Accept:** polls section renders in group card; create button opens creation flow; links navigate correctly.

### 3.8 — Poll creation modal (standalone) (P1)
Modal for creating a group-linked basic poll:
- Title (required), description (optional markdown), vote type toggle
- Multiple-choice settings (conditional): allowMultiple, maxSelections, allowWriteIn
- Options list with add/remove/reorder/note-edit
- Deadline date/time picker (optional)
- On save → `createBasicPoll()`
**Accept:** can create polls from group card; poll appears in group polls list.

---

## Phase 4: Core Web UI — Embedded Polls in Scheduler

### 4.1 — Scheduler edit mode: embedded polls section (P1)
Add "Embedded Polls" section below slot management in scheduler edit mode:
- "+ Add poll" button → creation modal (same as 3.8 but with `required` toggle and optional deadline)
- Card list of embedded polls: title, vote type badge, required/optional badge, "X/Y voted", edit/remove/reorder actions
- Drag-to-reorder cards (`@dnd-kit`)
- Remove with confirmation dialog
**Accept:** creator can add, edit, reorder, remove embedded polls; cards display correctly.

### 4.2 — Scheduler page: embedded poll voting (P1)
Participants see embedded polls as stacked cards on the scheduler page:
- Each card: poll title, vote type badge, required/optional badge, voting UI or vote summary
- Progress bar: "2/3 polls completed"
- Required polls with no vote: amber "Required" badge
- Inline voting (same components as GroupPollPage voting UI)
**Accept:** participants can vote on embedded polls inline; progress indicator updates.

### 4.3 — Scheduler page: embedded poll deep link (P2)
- Support `?poll=:pollId` query parameter
- Auto-scroll to and highlight the target embedded poll card on load
- Auto-expand collapsed section if needed
**Accept:** notification `actionUrl` with `?poll=` scrolls to the correct embedded poll.

### 4.4 — Embedded poll status model (P1)
- Embedded poll voting UI respects embedded-poll status plus parent scheduler cancel state:
  - Embedded poll `OPEN` + scheduler not `CANCELLED` → voting enabled
  - Embedded poll `FINALIZED` → read-only results view
  - Scheduler `CANCELLED` → read-only results view for all embedded polls
  - Scheduler `FINALIZED` alone does not lock embedded poll voting
- Scheduler creator can finalize/reopen each embedded poll independently.
- Firestore rules enforce embedded poll status/deadline + parent scheduler cancel gating (not UI-only).
**Accept:** creator can finalize/reopen embedded polls individually; participant writes are rejected when embedded poll is finalized, scheduler is cancelled, or deadline passed; participant voting remains allowed when scheduler is finalized but embedded poll is still open.

### 4.5 — Finalization warnings for required embedded polls (P2)
When creator clicks "Finalize" on scheduler:
- Compute missing required embedded poll votes (server-side callable)
- If incomplete: modal warning with summary (poll name + missing count, expandable user list)
- "Finalize anyway" button
- Record snapshot on scheduler doc (`finalizedWithMissingRequiredBasicPollVotes`, etc.)
**Accept:** creator sees warning when required polls incomplete; can still finalize; snapshot is recorded.

### 4.6 — Scheduler cloning: include embedded polls (P2)
When cloning a scheduler:
- Clone all embedded basic poll docs (new IDs, same structure)
- Follow clone setting for votes (clear if "clear votes" is enabled)
**Accept:** cloned scheduler includes embedded polls; votes handled per clone setting.

---

## Phase 5: IRV Algorithm & Shared Utilities

### 5.1 — IRV computation utility (P1)
Create shared utility (used by web results display + server finalization + Discord):
- Input: option IDs + vote docs with `rankings`
- Output: round-by-round results (per-round vote counts, eliminated option per round, exhausted count, winner or tie)
- Implements: strict majority check, backward tie-breaking, batch elimination, exhausted ballot tracking
- Runtime strategy: parallel implementations in `web/src/lib/basic-polls/irv.js` and `functions/src/basic-polls/irv.js` with shared fixture-based contract tests
**Accept:** unit tests covering: majority first round, multi-round elimination, tie at final round, partial rankings, all ballots exhausted, backward tie-breaking, batch elimination, and parity between web/functions outputs.

### 5.2 — Multiple-choice tally utility (P1)
Create utility for multiple-choice result computation:
- Input: option IDs + vote docs with `optionIds` / `otherText`
- Output: per-option vote count, percentage, sorted results, write-in grouping
- Handles: single-select, multi-select ("X of N voters" percentages), write-in grouping (case-insensitive trim)
**Accept:** unit tests covering: single-select, multi-select percentages, write-in grouping, ties sorted by option order.

### 5.3 — Finalized result snapshots (P1)
Persist immutable result snapshots at finalization time:
- Standalone poll finalization writes `finalResults` on the basic poll doc
- Scheduler finalization writes/derives embedded basic poll `finalResults` snapshots
- UI reads snapshots for finalized/cancelled results, not live vote docs
**Accept:** integration tests verify finalized results remain stable even if underlying vote docs are later pruned.

---

## Phase 6: Notifications

### 6.1 — Notification event types + templates (P1)
Register new event types in notification constants:
- `BASIC_POLL_CREATED`, `BASIC_POLL_FINALIZED`, `BASIC_POLL_REOPENED`
- `BASIC_POLL_VOTE_SUBMITTED`, `BASIC_POLL_REMINDER`
- `BASIC_POLL_RESET`, `BASIC_POLL_REMOVED`
- `BASIC_POLL_DEADLINE_CHANGED`
- `BASIC_POLL_REQUIRED_CHANGED` (embedded only)
- `BASIC_POLL_RESULTS`
- `BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES` (embedded, creator-only)

Create in-app templates and (where applicable) email templates for each.
**Accept:** each event type resolves correctly; in-app templates render title/body/actionUrl.

### 6.2 — Server-side notification emission + auth boundaries (P1)
Emit notification events from server-owned paths (callables/triggers), not directly from web clients for privileged actions:
- `createBasicPoll` server path → `BASIC_POLL_CREATED`
- finalize server path → `BASIC_POLL_FINALIZED` + `BASIC_POLL_RESULTS`
- reopen server path → `BASIC_POLL_REOPENED`
- vote submit path (web/discord) → `BASIC_POLL_VOTE_SUBMITTED`
- delete/remove server path → `BASIC_POLL_REMOVED`
- vote reset server path → `BASIC_POLL_RESET`
- deadline change server path → `BASIC_POLL_DEADLINE_CHANGED`
**Accept:** notification events appear in `notificationEvents` for each action and permission checks are enforced server-side for finalize/reopen/reset/remove events.

### 6.3 — Auto-clear rules (P1)
Add auto-clear rules to `functions/src/notifications/auto-clear.js`:
- `BASIC_POLL_FINALIZED` → clear reminders, reopened, reset notices for that poll
- `BASIC_POLL_REOPENED` → clear finalized notices
- `BASIC_POLL_RESET` → clear reminders and incomplete notices
- `BASIC_POLL_VOTE_SUBMITTED` → clear voter's own reminder for that poll
- Required→optional / poll removed → clear related incomplete notices
**Accept:** auto-clear tests verify stale notifications are cleared for each scenario.

### 6.4 — Notification preferences: basic polls (P2)
Add `basicPolls` to notification preference system:
- Default preference for each `BASIC_POLL_*` event type
- User-configurable in settings (inApp / inApp+Email / off)
**Accept:** preference resolution returns correct channels for basic poll events.

---

## Phase 7: Data Integrity — Server-Side Cleanup

### 7.1 — Extend `removeGroupMemberFromPolls` for basic poll votes (P1)
When a user is removed from a questing group, also delete votes on OPEN polls:
- `questingGroups/{gId}/basicPolls/*/votes/{uid}`
- `schedulers` with matching `questingGroupId` → `schedulers/{sId}/basicPolls/*/votes/{uid}`
**Accept:** function test verifies OPEN-poll votes are deleted and finalized-result snapshots remain intact.

### 7.2 — Extend `deleteUserAccount` for basic poll votes (P1)
When a user account is deleted, also delete:
- Basic poll votes under all groups the user is a member of
- Basic poll votes under all schedulers the user participated in
- Verify `collectionGroup("votes")` query reaches `basicPolls/*/votes/{uid}` — if not, add explicit queries
**Accept:** function test verifies all user basic-poll votes are deleted on account deletion and finalized poll result pages still render from snapshots.

### 7.3 — Required embedded poll: server-side callable for `BASIC_POLL_REQUIRED_CHANGED` (P2)
Callable that accepts `{ schedulerId, basicPollId }`:
- Computes eligible voter set (`participantIds` + group `memberIds`)
- Computes missing voters (no vote doc for required poll)
- Emits `BASIC_POLL_REQUIRED_CHANGED` with `recipients.userIds` = missing voters
**Accept:** callable correctly computes missing voters; notification emitted to correct recipients.

---

## Phase 8: Dashboard Integration

### 8.1 — Dashboard: "Polls to vote on" section (P2)
Add section to `DashboardPage.jsx`:
- Query standalone group polls where user is member, status `OPEN`, user has no vote doc
- Query required embedded polls where parent scheduler is not `CANCELLED` and embedded poll status is `OPEN`, user has no vote doc
- Card per poll: title, context ("in [Group]" / "in [Scheduler]"), vote type badge, required badge, deadline countdown, "Vote" link
- Only renders if unvoted polls exist
**Accept:** dashboard shows unvoted polls; clicking "Vote" navigates to correct page.

---

## Phase 9: Discord — Basic Poll Voting

### 9.1 — Basic poll card builder (P2)
Create `functions/src/discord/basic-poll-card.js`:
- `buildBasicPollCard(poll, group)` → Discord embed + components
- Layout per design doc: title, type, status, options list, votes, deadline, footer
- Components: Vote button (Primary) + Finalize button (Secondary) when OPEN; disabled + View Results link when FINALIZED
**Accept:** card renders correctly for open and finalized states.

### 9.2 — Discord voting: multiple-choice (P2)
Worker handlers for basic poll multiple-choice voting:
- `bp_vote:{pollId}` → ephemeral with select menu (single or multi based on settings)
- `bp_mc_select:{pollId}` → store selection
- `bp_submit:{pollId}` → write vote doc with `source: "discord"`
- `bp_clear:{pollId}` → delete vote doc
- Vote session management (`discordVoteSessions/{discordUserId}:basicPoll:{pollId}`)
- Race condition handling: re-fetch poll before write, reject if gone/closed
**Accept:** can vote on multiple-choice basic poll from Discord; vote appears in Firestore.

### 9.3 — Discord voting: ranked choice (P2)
Worker handlers for sequential ranked-choice voting:
- `bp_vote:{pollId}` (ranked) → ephemeral with "Pick your 1st choice" select menu
- `bp_rank_select:{pollId}` → store choice, advance step, show next select menu
- `bp_rank_undo:{pollId}` → remove last ranking, step back
- `bp_rank_reset:{pollId}` → clear rankings, restart
- `bp_rank_submit:{pollId}` → write vote doc with `rankings` + `source: "discord"`
- Running summary in ephemeral message
- Pagination for >25 options (reuse `getVotePage` / `MAX_SELECT_OPTIONS`)
**Accept:** can complete a full ranked-choice vote from Discord; partial rankings work; undo/reset work.

### 9.4 — Basic poll card sync trigger (P2)
Add Firestore triggers for both poll metadata and vote changes:
- `onDocumentWritten` on `questingGroups/{gId}/basicPolls/{pId}`
- `onDocumentWritten` on `questingGroups/{gId}/basicPolls/{pId}/votes/{uid}`
- Both enqueue a sync worker that computes sync hash (title/status/options/vote counts/results state)
- Compare to `discord.syncHash`; if changed → update Discord card via `editChannelMessage`
- Handle poll deletion → delete Discord message
**Accept:** web/discord vote changes and web edits both update the Discord card; deleted poll removes the card.

---

## Phase 10: Discord — `poll-create` Command

### 10.1 — Command registration (P2)
Add top-level `poll-create` command to `functions/scripts/register-discord-commands.js`:
- Parameters: title, options, mode, multi, allow_other, deadline (per design doc)
**Accept:** command appears in Discord after registration script runs.

### 10.2 — Worker: poll creation flow (P2)
Implement the 10-step authorization & creation flow in the worker:
1. Resolve Discord → QS user
2. Find linked group by channelId
3. Check group manager status
4. Parse + validate options (2–25, pipe-delimited)
5. Validate mode/multi/allow_other combinations
6. Parse deadline (ISO or relative)
7. Create poll doc in Firestore
8. Post poll card to channel
9. Store Discord metadata on poll doc
10. Ephemeral confirmation with "Edit on Web" Link button
11. Emit `BASIC_POLL_CREATED` notification
**Accept:** end-to-end test: `/poll-create` in linked channel creates poll + posts card + sends confirmation.

### 10.3 — Error messages (P2)
Add all 10 new error message constants to `error-messages.js` per design doc.
**Accept:** each error scenario returns the correct ephemeral error message.

---

## Phase 11: Discord — `poll-create` Finalization

### 11.1 — Worker: finalize from Discord (P2)
Implement `handleBasicPollFinalize()`:
- Permission check (group manager)
- Status check (not already finalized)
- Ranked-choice tie check → ephemeral error directing to web
- Update poll doc (status, finalizedAt, finalizedByUserId)
- Compute results (MC tally or IRV)
- Update poll card to finalized state
- Post results message to channel (MC or RC format per design doc)
- Emit `BASIC_POLL_FINALIZED` + `BASIC_POLL_RESULTS` notifications
**Accept:** finalization from Discord works for MC and RC polls; tie redirects to web; results message posted.

---

## Testing Gate A: Pre-Merge Validation (`feature/basic-polls` → `master`)

All tests below must pass before merging the basic-polls branch. They are organized into three tiers: unit tests (fast, isolated), integration tests (emulator-backed), and E2E tests (Playwright, full-stack). Individual tasks already have per-task acceptance criteria; this gate ensures comprehensive cross-cutting coverage.

### A.1 — Unit tests: IRV algorithm (P1)
File: `web/src/lib/basic-polls/irv.test.js` + `functions/src/basic-polls/irv.test.js`
Both implementations run identical fixtures:
- First-round majority win (3 options, 5 voters, one has >50%)
- Multi-round elimination (5 options, 7 voters, winner emerges round 3)
- Final-round tie (2 remaining options, equal votes → tie declared)
- Backward tie-breaking during elimination (2 last-place options, prior-round counts differ)
- Batch elimination (3 tied last-place options whose combined total < next-lowest)
- Partial rankings (voters rank 2 of 5 → ballots exhaust mid-count)
- All ballots exhausted (every voter's ranked options eliminated → no winner, all exhausted)
- Single voter (1 ballot, 3 options → first choice wins immediately)
- Single option (trivially wins round 1)
- **Contract parity**: a shared test runner asserts both implementations produce byte-identical JSON output for every fixture
**Accept:** `npm --prefix web run test` + `npm --prefix functions run test` pass; contract parity holds.

### A.2 — Unit tests: multiple-choice tally (P1)
File: `web/src/lib/basic-polls/tally.test.js` + `functions/src/basic-polls/tally.test.js`
- Single-select: 3 options, 5 voters → correct counts/percentages, sorted desc
- Multi-select: 3 options, 4 voters picking 1–2 each → "X of N voters" percentages
- Write-in grouping: "pizza", "Pizza", " PIZZA " → grouped as one entry
- Write-in with unique entries: "Tacos" and "Burritos" stay separate
- Ties sorted by option order (not alphabetical)
- Zero votes → empty results, no division-by-zero
- **Contract parity** with functions implementation
**Accept:** both suites pass; parity holds.

### A.3 — Unit tests: data layer functions (P1)
File: `web/src/lib/data/basicPolls.test.js`
- `createBasicPoll` writes correct doc shape (all fields, defaults, server timestamps)
- `updateBasicPoll` partial update preserves unchanged fields
- `deleteBasicPoll` deletes poll doc + all vote subdocs (mock batch)
- `finalizeBasicPoll` sets status/finalizedAt/finalizedByUserId/finalResults
- `reopenBasicPoll` sets status back to OPEN, clears finalizedAt
- `submitBasicPollVote` for group parent and scheduler parent (both paths)
- `deleteBasicPollVote` deletes vote doc
- `reorderEmbeddedBasicPolls` batch-updates `order` fields
**Accept:** `npm --prefix web run test` passes.

### A.4 — Unit tests: notification templates + auto-clear (P1)
File: extend `functions/src/notifications/templates.test.js`, `auto-clear.test.js`, `constants.test.js`
- Every `BASIC_POLL_*` event type resolves to a valid template (title, body, actionUrl)
- Auto-clear matrix:
  - `BASIC_POLL_FINALIZED` → clears REMINDER, REOPENED, RESET for that poll
  - `BASIC_POLL_REOPENED` → clears FINALIZED for that poll
  - `BASIC_POLL_RESET` → clears REMINDER, REQUIRED_CHANGED for that poll
  - `BASIC_POLL_VOTE_SUBMITTED` → clears voter's own REMINDER
  - `BASIC_POLL_REMOVED` → clears all notices for that poll
**Accept:** `npm --prefix functions run test` passes.

### A.5 — Unit tests: Discord worker handlers (P1)
File: extend `functions/src/discord/worker.handlers.test.js` or new `worker.basic-poll.test.js`
- `handleBasicPollVoteButton`: opens ephemeral with correct select menu (MC single, MC multi, RC step-1)
- `handleBasicPollSubmitVote`: writes vote doc, re-fetches poll before write, rejects if finalized/deleted
- `handleBasicPollClearVote`: deletes vote doc
- `handleBasicPollFinalize`: permission check, status check, tie check → error, MC finalize, RC finalize
- `handleBasicPollRankSelect/Undo/Reset/Submit`: builds ranking incrementally, undo removes last, reset clears
- `handlePollCreate` worker flow: validates options (2–25), rejects RC+write-in, parses deadline, creates doc
- Error messages: each error key returns correct text
**Accept:** `npm --prefix functions run test` passes.

### A.6 — Unit tests: basic poll card builder + sync hash (P2)
File: `functions/src/discord/basic-poll-card.test.js`
- Open MC poll → correct embed fields + Vote/Finalize buttons
- Open RC poll → correct embed fields, type shows "Ranked Choice"
- Finalized poll → disabled buttons, results in embed, green color
- Option with note → "ℹ️" appended to label
- Sync hash changes when: title changes, status changes, vote count changes, options change
- Sync hash stable when: unrelated field changes
**Accept:** `npm --prefix functions run test` passes.

### A.7 — Integration tests: Firestore rules (P1)
File: extend `web/src/__tests__/rules/rules.test.js`
Run against Firebase emulators. Test matrix:

**Group-linked polls:**
| Actor | Action | Expected |
|---|---|---|
| Group member | Read poll | ✅ Allow |
| Non-member | Read poll | ❌ Deny |
| Group manager | Create poll | ✅ Allow |
| Non-manager member | Create poll | ❌ Deny |
| Group manager | Update poll (title, options) | ✅ Allow |
| Group manager | Finalize poll (status → FINALIZED) | ✅ Allow |
| Group manager | Reopen poll (status → OPEN) | ✅ Allow |
| Group member | Create own vote (poll OPEN) | ✅ Allow |
| Group member | Create own vote (poll FINALIZED) | ❌ Deny |
| Group member | Create own vote (deadline passed) | ❌ Deny |
| Group member | Update own vote (poll OPEN) | ✅ Allow |
| Group member | Delete own vote (poll OPEN) | ✅ Allow |
| Group member | Delete own vote (poll FINALIZED) | ❌ Deny |
| Group member | Write another user's vote | ❌ Deny |
| Group manager | Delete any member's vote | ✅ Allow |

**Scheduler-embedded polls:**
| Actor | Action | Expected |
|---|---|---|
| Scheduler participant | Read embedded poll | ✅ Allow |
| Non-participant | Read embedded poll | ❌ Deny |
| Scheduler creator | Create embedded poll | ✅ Allow |
| Non-creator participant | Create embedded poll | ❌ Deny |
| Participant | Vote on embedded poll (scheduler OPEN) | ✅ Allow |
| Participant | Vote on embedded poll (scheduler FINALIZED, embedded poll OPEN) | ✅ Allow |
| Participant | Vote on embedded poll (embedded poll FINALIZED) | ❌ Deny |
| Participant | Vote on embedded poll (scheduler CANCELLED) | ❌ Deny |
| Participant | Vote on embedded poll (embedded deadline passed) | ❌ Deny |
| Participant | Vote on embedded poll (scheduler reopened, embedded poll OPEN) | ✅ Allow |
| Participant | Write another user's vote | ❌ Deny |

**Accept:** `npm --prefix web run test:rules` passes with all rows green.

### A.8 — Integration tests: data integrity & cleanup (P1)
File: extend `web/src/__tests__/integration/` or `functions/src/legacy.test.js`
Run against Firebase emulators.
- **Participant removal**: remove participant from scheduler → their embedded basic poll votes deleted; poll results still render from snapshot
- **Group member removal**: remove member from group → their standalone basic poll votes on OPEN polls deleted; FINALIZED poll snapshots untouched
- **Scheduler deletion**: delete scheduler → all embedded basic poll docs + vote docs deleted
- **Group deletion**: delete group → all group-linked basic poll docs + vote docs deleted
- **User account deletion**: delete user → all their basic poll votes everywhere deleted; finalized results still render
- **Vote reset on unsafe edit**: change voteType on poll with votes → all vote docs deleted, BASIC_POLL_RESET emitted
- **Finalized result snapshot stability**: finalize a poll, delete a voter's account → re-read poll → `finalResults` unchanged
**Accept:** `npm --prefix web run test:rules` or `npm --prefix functions run test` passes (depending on where tests live).

### A.9 — Integration tests: notification emission + routing (P2)
File: extend `functions/src/notifications/emit.test.js` and `router.test.js`
Run against emulators.
- Create standalone poll → `BASIC_POLL_CREATED` event in `notificationEvents` with correct `recipients.userIds` (group members)
- Finalize standalone poll → `BASIC_POLL_FINALIZED` + `BASIC_POLL_RESULTS` events emitted
- Reopen poll → `BASIC_POLL_REOPENED` event; `BASIC_POLL_FINALIZED` notices auto-cleared
- Submit vote → `BASIC_POLL_VOTE_SUBMITTED` event; voter's own REMINDER auto-cleared
- Reset votes → `BASIC_POLL_RESET` event; REMINDERs auto-cleared
- Remove embedded poll → `BASIC_POLL_REMOVED` event; related notices auto-cleared
- Discord routing: notification routed to Discord channel when `group.discord.notifications.basicPolls` enabled
**Accept:** all notification events appear with correct type/recipients/actionUrl; auto-clear verified.

### A.10 — Integration tests: Discord card sync trigger (P2)
File: `functions/src/triggers/basic-poll-card.test.js`
Run against emulators or with mocked Firestore.
- Poll created with `discord.messageId` → trigger fires, sync hash stored
- Vote submitted → vote trigger fires, sync hash changes, `editChannelMessage` called
- Poll finalized → trigger fires, card updated with results embed
- Poll title changed on web → trigger fires, card updated
- Poll deleted → trigger fires, `deleteChannelMessage` called
- No-op: unrelated field change → sync hash unchanged, no Discord API call
**Accept:** `npm --prefix functions run test` passes.

### A.11 — E2E tests: standalone poll lifecycle (P1)
File: `web/e2e/basic-poll-standalone.spec.js`
Seed: emulator seeded with a questing group (2 members: creator + voter).
- **Create poll**: creator navigates to group → clicks "Create poll" → fills title, 3 options, MC single-select → saves → poll appears in group card
- **Vote**: voter navigates to poll page → selects option → submits → live results update
- **Edit poll**: creator edits title and option label → saves → changes visible; voter's vote preserved
- **Write-in**: creator creates MC poll with `allowWriteIn` → voter submits write-in text → write-in appears in results
- **Finalize**: creator clicks Finalize → poll shows finalized results with correct winner
- **Reopen**: creator reopens poll → voting UI reappears → deadline can be changed
- **Delete poll**: creator deletes poll → poll gone from group card; navigating to URL shows not-found
**Accept:** `npm --prefix web run test:e2e` passes.

### A.12 — E2E tests: embedded poll lifecycle (P1)
File: `web/e2e/basic-poll-embedded.spec.js`
Seed: emulator seeded with a scheduler (creator + 1 participant), OPEN status.
- **Add embedded poll**: creator in edit mode → adds MC poll (required) → card appears in embedded polls section
- **Vote on embedded poll**: participant sees embedded poll card → votes inline → progress updates to "1/1 polls completed"
- **Required badge**: unvoted required poll shows amber "Required" badge
- **Scheduler finalize with incomplete**: creator clicks Finalize → warning modal shows missing required poll votes → "Finalize anyway" → prompt asks whether to also finalize embedded polls
- **Finalize session only path**: creator chooses "Finalize session only" → scheduler finalization dialog opens; after session finalizes, embedded poll remains votable if still open
- **Finalize embedded poll path**: creator finalizes an embedded poll from its card → participant cannot vote until creator reopens that embedded poll
**Accept:** `npm --prefix web run test:e2e` passes.

### A.13 — E2E tests: ranked choice voting (P2)
File: `web/e2e/basic-poll-ranked.spec.js`
Seed: emulator seeded with a group + RC poll (4 options, 3 voters).
- **Drag to rank**: user drags options to reorder → ranking reflects drag order
- **Arrow buttons (mobile viewport)**: user clicks up/down arrows → options reorder correctly
- **Partial ranking**: user ranks 2 of 4 → submits → accepted
- **Submit + results**: all 3 voters submit rankings → creator finalizes → static results show winner + round breakdown
- **Tie**: seed votes that produce a final-round tie → finalize → creator sees tie-breaking prompt → picks winner → results display "tie broken by"
**Accept:** `npm --prefix web run test:e2e` passes.

### A.14 — E2E tests: dashboard integration (P2)
File: extend `web/e2e/scheduler.spec.js` or new `web/e2e/basic-poll-dashboard.spec.js`
Seed: emulator seeded with 1 open standalone poll + 1 scheduler with required embedded poll, user has not voted on either.
- Dashboard shows "Polls to vote on" section with both polls
- Standalone poll card: shows "in [Group Name]", "Vote" link navigates to `/groups/:gId/polls/:pId`
- Embedded poll card: shows "in [Scheduler Title]", "Required" badge, "Vote" link navigates to `/scheduler/:sId?poll=:pId`
- After voting on both → "Polls to vote on" section disappears
**Accept:** `npm --prefix web run test:e2e` passes.

### A.15 — E2E tests: edge case coverage (P2)
File: `web/e2e/basic-poll-edge-cases.spec.js`
Seed: emulator seeded with various poll states.
- **Deadline past**: poll with `deadlineAt` in the past → vote button disabled in UI; direct Firestore write rejected by rules
- **Unsafe edit with votes**: creator changes `voteType` on poll with votes → vote reset dialog → confirm → votes cleared → BASIC_POLL_RESET notification appears
- **Option with note**: poll option has a markdown note → "View note" icon visible → click opens modal with rendered markdown
- **Deep link**: navigate to `/scheduler/:sId?poll=:pId` → page scrolls to embedded poll card
- **Non-member access**: non-group-member navigates to poll URL → access denied
**Accept:** `npm --prefix web run test:e2e` passes.

### A.16 — Test commands & coverage gate (P1)
Run all test suites and verify coverage:
```bash
npm --prefix web run test                      # Unit tests (web)
npm --prefix functions run test                # Unit tests (functions)
npm --prefix web run test:rules                # Firestore rules (emulator)
npm --prefix web run test:e2e:emulators        # E2E (emulator + seed + Playwright)
npm --prefix web run test:coverage             # Coverage report
npm --prefix functions run test -- --coverage  # Coverage report
```
Coverage targets (new basic poll code only):
- `web/src/lib/basic-polls/`: ≥90% line coverage
- `web/src/lib/data/basicPolls.js`: ≥85% line coverage
- `functions/src/basic-polls/`: ≥90% line coverage
- `functions/src/discord/` basic-poll handlers: ≥80% line coverage
- `functions/src/notifications/` basic-poll templates/auto-clear: ≥90% line coverage

**All suites green + coverage met = merge-ready.**

---

## Phase 12: Discord — `/session-create` Command (P3 — Post-Core)

Implement after Phases 1–11 are merged and validated. Branch off `master` post-merge (see Branching Strategy above).

### 12.1 — Server-side session defaults utility (P3)
Create `functions/src/utils/session-defaults.js`:
- Port `getSessionDefaults(weekday)` logic from `web/src/hooks/useUserSettings.js`
- Check `defaultStartTimes[weekday]` (new format), fall back to old string format, then `defaultStartTime` + `defaultDurationMinutes`
**Accept:** unit tests match the web utility's output for all weekday/fallback scenarios.

### 12.2 — Command registration (P3)
Add top-level `/session-create` command to `functions/scripts/register-discord-commands.js`:
- Parameters: title (required), description (optional)
**Accept:** command appears in Discord after registration script runs.

### 12.3 — Worker: date selection wizard (P3)
Implement the week-view button grid wizard:
- Ephemeral message with embed (title, timezone, selected dates summary with default times)
- 3 action rows: weekday buttons, weekend + nav buttons, Create + Edit on Web + Cancel
- Date toggle: update session state, re-render message via UPDATE_MESSAGE
- Week navigation: shift displayed week, preserve selections
- Past date handling: disabled buttons
- Session state in `discordSessionCreateSessions/{discordUserId}:{channelId}`
**Accept:** can navigate weeks, select/deselect dates, see default times in summary; past dates disabled.

### 12.4 — Worker: session poll creation (P3)
When user clicks "Create":
1. Generate slots from selected dates + user defaults (with timezone conversion)
2. Create scheduler doc with group linkage and `pendingInvites: []`
3. Create slot subdocs
4. Post scheduler poll card
5. Store Discord metadata
6. Ephemeral confirmation with slot summary + "Edit on Web" link
7. Emit `POLL_CREATED` notification
8. Clean up wizard session state
**Accept:** session poll created with correct slots/times matching user defaults; card posted; wizard cleaned up.

### 12.5 — Worker: "Edit on Web" mid-wizard (P3)
When user clicks "Edit on Web" during wizard:
- Create scheduler in Firestore with currently selected dates (or just title if none)
- `pendingInvites: []` (array, matching existing app behavior)
- Link button URL points to `{APP_URL}/scheduler/{schedulerId}/edit`
- Clean up wizard session state
**Accept:** clicking "Edit on Web" before "Create" still saves data to Firestore; web edit page loads it.

### 12.6 — Error messages (P3)
Add 4 new session-create error messages to `error-messages.js` per design doc:
- `notGroupMemberForCreate`, `noDefaultsFound`, `noDateSelected`, `sessionCreateExpired`
**Accept:** each error scenario returns correct ephemeral error.

---

## Testing Gate B: Pre-Merge Validation (`feature/discord-session-create` → `master`)

All tests below must pass before merging the session-create branch. This gate covers session-create-specific functionality and includes regression checks to ensure the core basic polls feature remains intact.

### B.1 — Unit tests: session defaults utility (P3)
File: `functions/src/utils/session-defaults.test.js`
- Weekday with `defaultStartTimes[weekday]` set → returns that time
- Weekday without per-day override → falls back to old string-format `defaultStartTime`
- No overrides at all → falls back to `defaultStartTime` + `defaultDurationMinutes`
- All 7 weekdays covered (Sunday–Saturday)
- Edge case: empty settings object → sensible defaults (e.g., 19:00, 180 min)
- **Contract parity**: output matches `web/src/hooks/useUserSettings.js` `getSessionDefaults()` for identical input fixtures
**Accept:** `npm --prefix functions run test` passes; parity with web utility confirmed.

### B.2 — Unit tests: wizard state management (P3)
File: `functions/src/discord/session-create.test.js` (or `worker.session-create.test.js`)
- Initial state: current week displayed, no dates selected, correct timezone in embed
- Toggle date on → date appears in selected list with default time in summary
- Toggle date off → date removed from selected list
- Week navigation forward → displayed dates shift +7 days; previous selections preserved
- Week navigation backward → displayed dates shift −7 days; selections preserved
- Past dates → buttons disabled; toggling a past date has no effect
- Max selections: toggling a 15th date → rejected with ephemeral error (if capped)
**Accept:** `npm --prefix functions run test` passes.

### B.3 — Unit tests: slot generation from selections (P3)
File: `functions/src/discord/session-create.test.js`
- 3 selected dates with user defaults → 3 slot objects with correct UTC start/end times
- Timezone conversion: user in "America/New_York", selects Wed 7pm → UTC slot is correct offset
- DST boundary: date during DST transition → slot times are correct (not off by 1 hour)
- No defaults for a weekday → falls back to global default
- Duration calculation: start + duration = end (no off-by-one)
**Accept:** `npm --prefix functions run test` passes.

### B.4 — Unit tests: session-create error messages (P3)
File: extend `functions/src/discord/error-messages.test.js`
- `notGroupMemberForCreate` → correct text
- `noDefaultsFound` → correct text mentioning web settings
- `noDateSelected` → correct text
- `sessionCreateExpired` → correct text
**Accept:** `npm --prefix functions run test` passes.

### B.5 — Integration tests: session poll creation flow (P3)
File: `functions/src/discord/session-create.integration.test.js`
Run against Firebase emulators.
- Full flow: linked group + manager user + 3 selected dates → creates scheduler doc with:
  - `questingGroupId` matching group
  - `pendingInvites: []` (empty array)
  - `status: "OPEN"`
  - `createdByUserId` matching the Discord-linked QS user
  - Correct `discord.channelId` and `discord.messageId`
- Slots: 3 slot subdocs with correct UTC times matching user defaults + timezone
- Cleanup: wizard session doc (`discordSessionCreateSessions/{id}`) deleted after creation
- Notifications: `POLL_CREATED` event emitted to group members
- Non-manager user → ephemeral error, no scheduler created
- No linked group → ephemeral error referencing `/link-group`
**Accept:** `npm --prefix functions run test` passes (or emulator integration suite).

### B.6 — Integration tests: "Edit on Web" mid-wizard (P3)
File: extend `functions/src/discord/session-create.integration.test.js`
- User clicks "Edit on Web" with 2 dates selected → scheduler doc created in Firestore with:
  - 2 slot subdocs matching selected dates
  - `pendingInvites: []`
  - No Discord card posted (no `discord.messageId`)
- User clicks "Edit on Web" with 0 dates selected → scheduler doc created with title only, no slots
- Wizard session doc cleaned up after handoff
- Link button URL matches `{APP_URL}/scheduler/{schedulerId}/edit`
**Accept:** `npm --prefix functions run test` passes.

### B.7 — E2E tests: session-create wizard flow (P3)
File: `web/e2e/session-create-wizard.spec.js`
Seed: emulator seeded with a questing group (Discord-linked, 2 members).
Note: This test may require a Discord interaction mock or be structured as a server-side integration test if the wizard is entirely ephemeral. If full E2E is infeasible, rely on B.5/B.6 integration tests and test only the web-side handoff.
- **Web handoff**: scheduler created via "Edit on Web" → navigate to `/scheduler/:sId/edit` → slots pre-populated with correct dates/times → can edit and save
- **Created session on web**: scheduler created via "Create" button → navigate to scheduler page → shows correct title, slots, and vote UI
- **Participant access**: second group member navigates to created scheduler → can see and vote on slots
**Accept:** `npm --prefix web run test:e2e` passes.

### B.8 — Regression tests: basic polls still work (P3)
Re-run the full Testing Gate A suite to ensure session-create changes didn't break anything:
```bash
npm --prefix web run test                      # Unit tests (web)
npm --prefix functions run test                # Unit tests (functions)
npm --prefix web run test:rules                # Firestore rules (emulator)
npm --prefix web run test:e2e:emulators        # E2E (emulator + seed + Playwright)
```
**Accept:** all Gate A tests still pass. No regressions in basic poll creation, voting, finalization, notifications, or Discord integration.

### B.9 — Test commands & coverage gate (P3)
Run all test suites and verify coverage:
```bash
npm --prefix web run test                      # Unit tests (web)
npm --prefix functions run test                # Unit tests (functions)
npm --prefix web run test:rules                # Firestore rules (emulator)
npm --prefix web run test:e2e:emulators        # E2E (emulator + seed + Playwright)
npm --prefix functions run test -- --coverage  # Coverage report
```
Coverage targets (new session-create code only):
- `functions/src/utils/session-defaults.js`: ≥90% line coverage
- `functions/src/discord/` session-create handlers: ≥80% line coverage
- `functions/src/discord/error-messages.js`: ≥90% line coverage

**All suites green + coverage met + Gate A regression pass = merge-ready.**

---

## Phase 13: Nice-to-Have Enhancements

### 13.1 — IRV reveal animation (P3)
Framer Motion stepped animation for ranked-choice results:
- `AnimatePresence` with `mode="popLayout"` for eliminations
- `layout` prop on remaining candidates for smooth reflow
- `staggerChildren` / `delayChildren` for round timing
- Auto-advance (2s per round) with "Skip to results" button
**Accept:** animation plays correctly for multi-round IRV; skip button works.

### 13.2 — Winner celebration effect (P4)
`canvas-confetti` (~3 kB) on IRV or MC winner reveal.
**Accept:** confetti fires on result reveal; can be disabled.

### 13.3 — Discord write-in "Other" support (P3)
Support write-in via Discord modal for "Other" text input in MC polls:
- Modal opens on "Other" selection in ephemeral voting UI
- Text input with validation (trim, max length)
- Stores `otherText` on vote doc
**Accept:** can write-in from Discord; text stored correctly.

### 13.4 — Deadline auto-finalization (P3)
Scheduled Cloud Function to auto-finalize polls past deadline:
- Query polls where `deadlineAt < now` and `status = "OPEN"`
- Set `status = "FINALIZED"`, emit `BASIC_POLL_FINALIZED` + `BASIC_POLL_RESULTS`
- For ranked-choice ties: set `status = "AWAITING_TIEBREAK"` or leave open with a warning
**Accept:** polls auto-finalize after deadline; notifications sent.

### 13.5 — Notification section: Discord toggle for basic polls (P3)
Add `basicPolls` toggle to questing group Discord notification settings:
- `group.discord.notifications.basicPolls: boolean`
- Respected by Discord notification handler when routing `BASIC_POLL_*` events
**Accept:** toggling off suppresses Discord basic poll notifications for the group.

### 13.6 — Reopen from Discord (P4)
Add a **[Reopen]** button on finalized poll cards, gated to group managers.
- Sets `status: "OPEN"`, optionally prompts for new deadline
- Updates poll card back to open state
**Accept:** managers can reopen finalized polls from Discord.

### 13.7 — Embedded poll results posted to Discord on session finalization (P3)
When a scheduler is finalized, the Discord handler also posts summaries for each embedded basic poll's results.
- Separate messages per embedded poll (not inline in the scheduler card)
- Only posts if the group has Discord linked and basic polls notifications enabled
**Accept:** session finalization posts embedded poll results to Discord channel.

### 13.8 — Inline banner: unvoted required embedded polls (P3)
After voting on scheduler slots, if required embedded polls are unvoted:
- Toast or inline banner: "You've voted on the schedule but haven't completed all required polls."
**Accept:** banner appears only when applicable; dismissible.

---

## Dependency Summary

```
─── feature/basic-polls branch ───────────────────────────
Phase 1 (rules)
  └── Phase 2 (data layer)
        ├── Phase 3 (standalone UI)     ← needs Phase 5 (IRV/tally utils) for results
        ├── Phase 4 (embedded UI)       ← needs Phase 5 for results
        ├── Phase 6 (notifications)
        └── Phase 7 (server cleanup)
Phase 5 (IRV/tally) ← needed before results display in Phase 3/4
Phase 8 (dashboard) ← needs Phase 2 + 3
Phase 9 (Discord voting) ← needs Phase 2 + 5
Phase 10 (Discord poll-create) ← needs Phase 9
Phase 11 (Discord finalize) ← needs Phase 10 + 5
  └── Testing Gate A (full basic-polls validation)
──────────────────────────────── merge to master ─────────

─── feature/discord-session-create branch ────────────────
Phase 12 (session-create) ← needs existing scheduler infra; independent of basic poll phases
  └── Testing Gate B (session-create validation + Gate A regression)
Phase 13 (nice-to-haves) ← anytime after their dependencies
──────────────────────────────── merge to master ─────────
```
