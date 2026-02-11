---
created: 2026-02-11
lastUpdated: 2026-02-11
summary: "Primary design and scope document for basic polls across group-linked and scheduler-embedded contexts."
category: DESIGN_DOC
status: CURRENT
implementationStatus: ONGOING
note: "Referenced by the active plan execution and aligned with current code paths under web/functions basic poll modules."
changelog:
  - "2026-02-11: Updated embedded poll lifecycle design to support independent finalize/reopen state and scheduler-finalize choice behavior."
  - "2026-02-11: Document present in workspace (no git history available)."
---

# Basic Polls

## Summary
"Basic Polls" are lightweight polls supporting **multiple-choice** (single-select or multi-select, with optional write-in "Other") and **ranked-choice** (instant-runoff voting) modes. Each poll option can have an optional markdown-formatted **note** for detailed descriptions. They can exist:

1. **Standalone, questing-group-linked**: owned by a Questing Group; only group members can vote.
2. **Embedded in a session poll (scheduler)**: attached to a specific scheduler poll; shares the scheduler's participant list and can be marked optional or required.

This doc intentionally does **not** include a "free poll" mode where anyone can create a poll and invite arbitrary strangers.

Example:
> Title: What is better?
> Options: Cats, Dogs, Turtles (+ optional Other)

## Goals
- Support multiple-choice and ranked-choice (IRV) polls with minimal new concepts.
- Allow rich context per option via optional markdown notes.
- Keep vote storage deterministic and auditable (per-user vote docs, UTC timestamps).
- Integrate with the existing unified notification system and Discord bot voting patterns.
- Share poll results to Discord for both standalone and embedded polls.
- Preserve strong access control (group membership / scheduler participation).

## Non-Goals (v1)
- Public "anyone with link can vote" polls.
- Condorcet / approval voting / complex survey logic beyond IRV ranked choice.
- Free-form discussion threads as part of the poll.
- Write-in "Other" for ranked-choice polls (deferred; only supported for multiple-choice in v1).

## Core Concepts

### Poll Fields
- `title`: string
- `description`: string (optional) — context or instructions for the whole poll (e.g., "Pick your top 3 campaign settings for next season")
- `options`: ordered list of discrete choices
- `status`: `"OPEN" | "FINALIZED"` (standalone polls and embedded polls)
- `settings`:
  - `voteType`: `"MULTIPLE_CHOICE" | "RANKED_CHOICE"` (default `"MULTIPLE_CHOICE"`)
  - `allowMultiple`: boolean (only meaningful when `voteType = "MULTIPLE_CHOICE"`)
  - `maxSelections`: number (optional; only meaningful when `allowMultiple`)
  - `allowWriteIn`: boolean (enables "Other"; only meaningful when `voteType = "MULTIPLE_CHOICE"` — not supported for ranked choice in v1)
  - `deadlineAt`: timestamp (UTC) or `null` (no deadline)
- `createdAt`, `updatedAt`: timestamps (UTC)
- `creatorId`: string (matches scheduler/group convention; used by `isCreator(data)` rule helper)

Embedded polls use their own `status` field for creator-controlled finalize/reopen behavior. Parent scheduler status still matters for access: scheduler `CANCELLED` always forces embedded polls read-only, while scheduler `FINALIZED` does not automatically lock embedded polls.

### Poll Description vs Option Notes
The poll-level `description` provides instructions or context for the entire poll ("Pick your top 3 campaign settings for next season"). Option-level `note` provides detail about a specific choice ("Curse of Strahd: gothic horror, levels 1-10, ~40 sessions"). Both are optional and stored as raw markdown. The `description` renders at the top of the poll; option `note` renders inline with its option.

### Vote Fields (Common)
One vote doc per user. The active fields depend on the poll's `voteType`:

**Multiple-choice votes** (`voteType = "MULTIPLE_CHOICE"`):
- `optionIds`: string[] (single-select is represented as a 1-element array)
- `otherText`: string (optional; only when `allowWriteIn` and user chose "Other")

**Ranked-choice votes** (`voteType = "RANKED_CHOICE"`):
- `rankings`: string[] (ordered array of option IDs; index 0 = 1st choice, index 1 = 2nd choice, etc.)
  - Partial rankings are allowed (array length < total option count means "no preference among unranked options")

**Common fields (both modes)**:
- `updatedAt`: timestamp (UTC)
- `source`: `"web" | "discord"` (reflects the most recent write; optional but useful for debugging/analytics)

### Vote Retraction
To retract a vote, delete the vote doc entirely. The UI should offer a "Clear vote" action that deletes the doc. An `optionIds: []` doc is treated as "not voted" for completion calculations but is not the intended retraction mechanism — prefer deleting the doc to keep storage clean and avoid ambiguity.

### Options Shape
Each option should have a stable ID so editing labels doesn't invalidate stored votes:
- `id`: string (generated)
- `label`: string
- `order`: number
- `note`: string (optional; markdown-formatted detail text for this option)

### Option Notes
Each poll option can have an optional **note** — a markdown-formatted detail section (e.g., a description of a campaign setting, a link to a resource, pros/cons list).

Editing mode:
- When the poll is in edit mode, clicking "Add note" or "Edit note" on an option opens a modal with a markdown editor.
- The editor should be a simple textarea with a Write/Preview tab toggle (like GitHub's comment box), not a heavy WYSIWYG editor. This keeps the UI compact inside a modal and avoids unnecessary dependencies.
- Preview pane renders markdown using Tailwind's `prose` typography classes.

Read-only mode:
- When the poll is not in edit mode, clicking a "View note" icon on an option opens a small modal that renders the markdown with an optional scrollbar if the content overflows.

Storage:
- Stored as a raw markdown string on the option object (`options[].note`).
- Markdown is directly compatible with Discord's markdown subset (bold, italic, lists, links, blockquotes, code) — no conversion needed for Discord notifications.

Library choice (see "Library Dependencies" section below):
- Rendering: `react-markdown` + `remark-gfm` with Tailwind `@tailwindcss/typography` (`prose` class).
- Editing: plain `<textarea>` with Write/Preview tab toggle. No toolbar library needed — the user base already knows markdown from Discord usage.
- If users later want formatting buttons, upgrade to `@uiw/react-md-editor` (stores the same raw markdown, so it's a drop-in swap).

## Voting Modes & Results

### Write-In "Other" (Multiple-Choice Only)
Write-in is only available when `voteType = "MULTIPLE_CHOICE"`. It is excluded from ranked-choice polls in v1 because ranking a free-text entry against fixed options adds UX and algorithmic complexity with limited benefit.

Web UI:
- Always show an explicit "Other (write-in)" choice when `allowWriteIn = true`.
- Validate `otherText` (trim, max length, disallow empty).

Discord voting:
- Discrete choice voting is straightforward (select menu / buttons).
- Write-in is possible but adds complexity:
  - Option A: Discord modal for "Other" text input.
  - Option B: follow-up slash command (for example, `/poll-other <text>`).
  - If we want to keep Discord v1 simple, we can support only discrete choice selection from Discord while the web UI supports write-ins.

### Multiple-Choice Results Display
When a multiple-choice poll is finalized (or when viewing live results while open), display:

- **Horizontal bar chart** showing each option with vote count and percentage.
- Bars are sorted by vote count (highest first), with ties broken by option order.
- The winning option(s) get a visual highlight (accent color, bold label).
- If `allowMultiple = true`, percentages are "X of N voters" (not "X of total votes"), since each voter can pick multiple options.
- If `allowWriteIn = true`, group identical write-in text into a single bar (case-insensitive match after trimming). Show unique write-ins as separate entries.
- **Voter breakdown**: expandable row per option showing avatar chips of who voted for it (reuse existing avatar stack pattern from scheduler tallies).
- **Empty state**: "No votes yet" with a muted illustration or icon.

Discord results message (multiple-choice):
- Post a compact summary: option labels with vote counts, winner highlighted in bold, link to full results on web.
- Example: `Poll result for **"Food for session?"**: **Pizza** (4 votes), Subs (2), Salad (1). Full results: https://questscheduler.cc/...`

### Ranked Choice Mode (Instant-Runoff Voting)

When `settings.voteType = "RANKED_CHOICE"`, the poll uses instant-runoff voting (IRV) instead of simple multiple-choice.

#### Algorithm
IRV proceeds in rounds:
1. **Round 1:** Count every voter's 1st-choice option. If any option has a strict majority (>50% of non-exhausted ballots), it wins immediately.
2. **Elimination:** The option with the fewest 1st-choice votes is eliminated. Ballots that ranked the eliminated option first are reassigned to each ballot's next-highest-ranked option still in the race.
3. **Repeat:** Recount. If a majority exists, that option wins. Otherwise, eliminate the new last-place option and redistribute. Continue until one option wins or only one remains.

#### Tie-Breaking
- **During elimination (mid-round):** Use backward tie-breaking — the tied option with fewer votes in the previous round is eliminated. If still tied across all prior rounds, batch-eliminate all tied last-place options simultaneously (safe when their combined total is less than the next-lowest option's total).
- **Final-round tie:** Declare a tie. Present all tied options to the poll creator with a prompt: "These options are tied. Pick one, or re-open the poll." This matches the existing scheduler UX where the creator has final authority on finalization.

#### Partial Rankings
- Voters are NOT required to rank every option. A ballot ranking only 3 of 7 options is valid.
- When all of a voter's ranked options have been eliminated, the ballot becomes **exhausted** and no longer counts toward any remaining option.
- The majority threshold is >50% of **non-exhausted** ballots (not total ballots cast).
- Display exhausted ballot counts per round in results so the creator understands the context.

#### "Has Voted" Rule (Ranked Choice)
A ranked-choice vote doc counts as a submitted vote if `rankings` contains at least 1 option ID.

#### Setting Changes After Votes Exist
Changing `voteType` between `MULTIPLE_CHOICE` and `RANKED_CHOICE` is an "unsafe" edit that requires a vote reset (same as changing `allowMultiple` — see "Vote Reset vs Migration" below). The vote doc shapes are incompatible between modes.

#### Web UI (Voting)
- Present options as a draggable list. The voter reorders by dragging to set their preference ranking (1st at top, last at bottom).
- **Mobile fallback**: alongside drag handles, show up/down arrow buttons for each option so users on small screens can tap to reorder without dragging. This is cheap to implement and significantly improves touch usability.
- Show a clear "Submit ranking" action.
- Allow partial ranking: unranked options can be left in an "unranked" section below the ranked list.
- A "Clear ranking" action should delete the vote doc (same retraction behavior as multiple-choice).

#### Web UI (Results / IRV Reveal Animation)
When a ranked-choice poll is finalized, the results page should show:
- **Static results summary:** The winning option (or tied options) with a breakdown of rounds.
- **Animated "reveal" mode (nice-to-have):** A stepped animation showing each IRV round:
  1. Show all options with their 1st-choice vote counts.
  2. Highlight the option being eliminated (fade out / slide away / strikethrough).
  3. Remaining options reflow and vote counts update as ballots redistribute.
  4. Repeat for each round until the winner is revealed.
  5. Winner gets a highlight animation (scale up, color change).

The animation uses **Framer Motion** (already installed as `motion` v12.x):
- `AnimatePresence` with `mode="popLayout"` for eliminating candidates from the list.
- `layout` prop on remaining candidates for smooth reflow animations.
- `staggerChildren` / `delayChildren` for orchestrating round timing.
- No additional animation library needed. Optional: `canvas-confetti` for a winner celebration effect.

Auto-advance on a timer (e.g., 2 seconds per round) with a "Skip to results" button for users who don't want to watch.

#### Discord (Ranked-Choice Voting)
Discord does not preserve selection order in multi-select menus, so ranked-choice requires a **sequential select menu flow**:

1. User clicks "Vote" on the poll card.
2. Ephemeral message shows a select menu: "Pick your 1st choice" with all options.
3. User selects one. Bot stores it and shows: "Pick your 2nd choice" with remaining options.
4. Repeat until the user clicks "Done" or ranks all options.
5. Buttons alongside each select menu: **[Submit]** **[Undo Last]** **[Start Over]**

The ephemeral message shows a running summary:
```
Ranked Choice: "What should we play next?"

Your ranking so far:
1. Curse of Strahd
2. Tomb of Annihilation

Pick your 3rd choice:
[Select menu with remaining options]

[Submit] [Undo Last] [Start Over]
```

Discord vote session doc shape for ranked choice:
```
discordVoteSessions/{discordUserId}:basicPoll:{pollId}: {
  rankings: ["optionId_A", "optionId_C"],   // built incrementally
  currentStep: 2,                            // next rank to assign (0-indexed)
  pollId, parentType, parentId,
  interactionToken, createdAt, expiresAt
}
```

Pagination for >25 options: reuse the existing `getVotePage` / `MAX_SELECT_OPTIONS` pattern from `functions/src/discord/worker-utils.js`.

#### Discord (Results Display)
Discord cannot display the IRV reveal animation. Instead:
- **Poll results shared to Discord** should show the **final result only**: the winning option (or tie), total rounds, and a link to view the full round-by-round breakdown on the web.
- Example message: `Ranked choice result for **"What should we play next?"**: **Curse of Strahd** wins after 3 rounds (5 voters, 1 exhausted ballot). Full results: https://questscheduler.cc/...`

### Results Notification to Discord (Both Modes)
Poll results (multiple-choice AND ranked-choice) should be shared to Discord for both poll types:
- **Standalone group-linked polls:** When finalized, emit a `BASIC_POLL_FINALIZED` notification event. The Discord notification handler posts a results summary to the group's linked Discord channel (if Discord is linked and `basicPolls` notifications are enabled).
- **Embedded/session-linked polls:** Results are posted to Discord **only when the parent session poll is finalized** (not when the individual embedded poll is finalized independently). When the scheduler emits `POLL_FINALIZED`, the handler should also post summaries for each embedded basic poll's results. This avoids spamming Discord with intermediate results during an active scheduling session.

### Live Results
Decision: show live results while the poll is still `OPEN`, consistent with the existing scheduler which shows live vote tallies.

- **Multiple-choice**: show the bar chart with live vote counts/percentages as votes come in. This matches the real-time tallies users already see on scheduler slots.
- **Ranked-choice**: show **raw first-choice vote counts** live (a simple bar chart of "who picked what as #1"). Do NOT compute or display IRV elimination rounds while the poll is open — this avoids strategic voting and confusing intermediate states. The full IRV reveal is only available after finalization.
- **Creator vs participant visibility**: both see the same live results. For this user base (~10 D&D friends), hiding results until finalization adds unnecessary friction with no real benefit.

## Mode A: Standalone Questing-Group-Linked Basic Polls

### Access Rules
- Only **questing group members** can:
  - read the poll
  - cast/update their vote
  - view results
- Only **group managers** (creator or member-managed managers) can:
  - create/edit polls
  - finalize/reopen polls

Invite list note (current scope):
- For group-linked polls in v1, the "invitee list" is implicit: all current group members are eligible voters.
- If we later need a subset, we can add an optional `eligibleMemberIds` allowlist on the poll doc (still restricted to members).

### Deadline + Finalization
- `deadlineAt = null`: the poll stays `OPEN` until a manager finalizes.
- `deadlineAt != null`:
  - the UI prevents setting a deadline in the past
  - when deadline passes, the poll should be treated as closed in the UI, and vote writes should be blocked by rules (optionally finalized server-side; see "Deadline Auto-Finalization" below)
  - a manager may finalize early at any time
- Reopen workflow:
  - a manager may set `status = OPEN` again
  - they may change `deadlineAt` to a new time in the future, or to `null`
  - a reopen operation must **never** allow setting `deadlineAt` to a timestamp earlier than "now"

### Where Results Live In The UI
Recommended placement:
- `Friends & Groups` page
  - Questing group UI currently renders groups as cards (`web/src/features/settings/components/GroupCard.jsx`) inside the `QuestingGroupsTab`.
  - Add a **"Polls"** section (either within the card or via a modal) with:
    - "Create poll"
    - "Open polls" list
    - "Recent results" panel showing the most recently finalized polls (e.g., last 5)
    - A per-poll details page with:
      - voting UI (if open)
      - results breakdown (if finalized, and live results if open — see "Live Results" above)

This keeps the feature discoverable near group management and aligns with the "group-scoped" permission model.

### Standalone Poll Lifecycle (Edge Cases)
- **Basic poll deleted**: delete the poll doc and all vote docs. No "zombie results" should remain visible.
- **Questing group deleted**: delete the questing group and recursively delete any group-linked basic polls + votes (otherwise they become orphaned storage).
- **Member removed / leaves group**:
  - Their votes should be deleted (or at minimum excluded from tallies if a delete fails).
  - If the poll is `OPEN`, they should immediately lose voting access.
- **User account deleted**:
  - All group-linked basic poll vote docs for that user should be deleted (similar to how scheduler votes are cleaned up today).
- **Poll finalized**: poll becomes read-only. Votes cannot be created/updated/deleted.
- **Poll reopened**: poll becomes writable again; deadline may be changed, but never to the past.
- **Option/settings changes after votes exist**:
  - Label edits and reordering are safe.
  - "Unsafe" edits should require an explicit vote reset (see "Vote Reset vs Migration").

## Mode B: Embedded Basic Polls In A Session Poll (Scheduler)

### Overview
A scheduler poll can contain 0..N embedded basic polls (e.g., "Food preference", "Who can DM?", "One-shot vs campaign"). These are attached to the scheduler and use the scheduler's vote eligibility rules (participants + questing group members).

### Inherited Invite List (Hard Requirement)
- Embedded basic polls **do not** have their own invite list.
- Their eligible voters are exactly the scheduler's **vote-eligible** users.

Reality check (current codebase):
- Scheduler vote eligibility is implemented in Firestore rules as `canVoteScheduler(...)`, which currently allows:
  - explicit participants (`schedulers/{id}.participantIds`)
  - questing group members when `schedulers/{id}.questingGroupId` is set (dynamic membership via `questingGroups/{groupId}.memberIds`)
- Pending invite emails (`pendingInvites`) can read a scheduler but are not vote-eligible.

For embedded polls, the simplest consistent rule is: **if you can vote on the scheduler, you can vote on the embedded basic poll**.
  - "new people added to the session poll can vote"
  - "people removed from the session poll have their votes cleared"

Eligibility clarification:
- `allowLinkSharing` grants **read** access to the scheduler but not vote access. A link-share user must first join (which adds them to `participantIds` via `isLinkShareJoin`), after which they become vote-eligible for both the scheduler and all embedded polls.
- Pending invites (`pendingInvites`) can read the scheduler but are **not** vote-eligible. They gain vote access only after accepting (which adds them to `participantIds`).

Implementation note:
- This implies vote pruning on participant removal (see "Data Integrity" below).

### Embedded Poll Creation & Management UX
The scheduler page's edit mode (creator-only) should include an "Embedded Polls" section below the time slot management area.

**Adding a poll:**
- A "+ Add poll" button opens a modal (consistent with the existing slot-creation and group-settings modal patterns).
- The modal contains:
  - Title (required)
  - Description (optional; markdown textarea with Write/Preview toggle)
  - Vote type toggle: Multiple Choice / Ranked Choice
  - Multiple-choice settings (conditional): allow multiple, max selections, allow write-in
  - Options list: text inputs with "Add option", drag-to-reorder, delete. Each option has an "Add note" link that opens the option note editor modal.
  - Required toggle (default: optional)
  - Deadline (optional; date/time picker, same pattern as scheduler slot time entry)
- On save, the poll doc is written to `schedulers/{schedulerId}/basicPolls/{pollId}`.

**Listing and ordering:**
- Embedded polls appear as a card list below the slot management section, ordered by `order` field (integer, similar to option ordering).
- Each card shows: title, vote type badge, required/optional badge, vote completion summary ("3/5 voted"), and creator actions (edit, remove, reorder).
- Drag-to-reorder cards to change display order (uses the same `@dnd-kit` library as ranked-choice voting UI).
- Reordering updates the `order` field on each poll doc.

**Editing:**
- Click a poll card's edit button to re-open the creation modal pre-filled with existing data.
- Unsafe edits (voteType, allowMultiple, maxSelections, allowWriteIn, removing options) trigger the "Vote Reset vs Migration" confirmation flow if votes exist.

**Removing:**
- Click the remove button on a poll card. Confirmation dialog: "Remove this poll? All votes will be deleted."
- Deletes the poll doc and all its vote docs.

**Practical limit:**
- v1: no hard limit, but the UI should show a soft warning after 5 embedded polls ("Adding many polls may overwhelm participants"). Most real-world use will be 1-3 embedded polls.

### Optional vs Required
Each embedded poll has:
- `required`: boolean

Behavior:
- If `required = true`, the user must submit a vote for that embedded poll before their scheduler vote is considered "complete".

Enforcement options (choose one):
1. **Soft gate (v1)**: enforce in web UI only
  - Pros: minimal backend/rules changes
  - Cons: a user could bypass via direct Firestore writes (or buggy clients)
2. **Hard gate (recommended if feasible)**: enforce server-side at write time
  - Approach A: move "save scheduler vote" to a callable that validates required embedded poll votes before writing.
  - Approach B: Firestore rules validate that required embedded vote docs exist (more complex; limited by rules expressiveness).

This repo currently allows client writes for scheduler votes, so Approach A is typically the simplest "real enforcement".

### Embedded Poll Status Model
Embedded basic polls support independent finalization by the scheduler creator:

- Embedded poll `OPEN` + scheduler not `CANCELLED` → embedded poll accepts votes (UI shows voting controls).
- Embedded poll `FINALIZED` → embedded poll is read-only (UI shows results), regardless of scheduler status.
- Scheduler `CANCELLED` → all embedded polls are read-only.
- Scheduler `FINALIZED` alone does not lock embedded polls; open embedded polls remain votable until individually finalized or deadline-closed.

Implementation: embedded poll docs persist `status`, and read/write eligibility is enforced by both embedded poll state (`status`, `deadlineAt`) and parent scheduler state (`CANCELLED` gate).

### Results Visibility
Embedded basic poll results should be visible from the scheduler poll UI alongside normal scheduling results (as a separate panel).

### Embedded Poll Lifecycle (Edge Cases)
Embedded basic polls should be treated as part of the scheduler's lifecycle.

Status-gating decision (v1):
- Basic poll vote rules **will** enforce closed states and deadlines at write time:
  - Standalone: block vote create/update/delete when poll `status != "OPEN"` or (`deadlineAt` is set and `request.time >= deadlineAt`).
  - Embedded: block vote create/update/delete when embedded poll `status != "OPEN"`, scheduler `status == "CANCELLED"`, or (`deadlineAt` is set and `request.time >= deadlineAt`).
- This intentionally raises the enforcement bar above legacy scheduler slot voting, because poll finalization/deadline integrity is critical for deterministic results.

Scheduler lifecycle:
- **Scheduler deleted**: delete all embedded basic polls and their votes.
- **Scheduler cancelled** (`status = "CANCELLED"`): embedded polls become read-only in the UI (no vote writes). Results remain viewable.
- **Scheduler finalized** (`status = "FINALIZED"`): scheduler slot voting is read-only; embedded polls remain votable if each embedded poll is still `OPEN`.
- **Scheduler reopened** (`status` back to `"OPEN"`): scheduler slot voting reopens; embedded polls keep their own existing open/finalized state.
- **Scheduler cloned**:
  - Embedded polls should be cloned into the new scheduler (structure always).
  - Embedded poll votes should follow the clone behavior chosen for the scheduler (example: if "clear votes" is enabled, embedded poll votes are cleared too).
- **Scheduler archived/unarchived (per-user)**:
  - Archive is a per-user dashboard feature and should not change the underlying scheduler state.
  - Embedded polls should remain accessible per normal scheduler read permissions.

Eligibility changes:
- **Explicit participant removed**:
  - Delete their embedded-poll votes.
  - Do not count their embedded-poll votes in results even if a delete fails (defense-in-depth).
- **Explicit participant added**:
  - No vote deletions.
  - They become eligible to vote on existing embedded polls immediately (if the scheduler poll is open).
- **Link-share join** (when `allowLinkSharing = true`):
  - Same as "participant added"; once they join the scheduler poll, they can vote on embedded polls.
- **Link sharing disabled**:
  - No vote deletions required; existing participants remain eligible.
- **Questing group member removed** (when scheduler has `questingGroupId`):
  - Same as above; the system already has "remove from all group polls" behavior for scheduler votes and must extend it to embedded polls.
- **Scheduler's `questingGroupId` changed**:
  - New group members become eligible immediately (if the scheduler poll is open).
  - Voters who were eligible only via the old group must have embedded-poll votes cleared (unless they are also explicit participants).
  - If the scheduler poll is linked to Discord, embedded-poll Discord messages should be treated like "moved/unlinked" just like the scheduler poll card.
- **User account deleted**:
  - Remove them from scheduler participants/pending invites (existing behavior today) and also delete any embedded basic poll votes for that scheduler.

Embedded poll structure changes:
- **Embedded poll added**:
  - No vote deletions.
  - If it is required, participants who have not voted should see an "incomplete" notice; creator should see completion status.
- **Embedded poll removed**:
  - Delete the embedded poll doc and all its votes.
  - If the poll had a Discord message, update it to show "REMOVED" and disable voting (or delete it).
- **Embedded poll edited (title/description, option label, reorder)**:
  - No vote deletions required.
- **Embedded poll settings edited (allowMultiple/maxSelections/allowWriteIn)**:
  - If votes already exist, default behavior should be "disallow unsafe changes unless the creator explicitly resets votes".
  - See "Vote Reset vs Migration" below.

Required-ness changes:
- **Optional → Required**:
  - Do not delete existing votes.
  - Participants who have not voted on that embedded poll are now "incomplete".
  - Finalization should not be blocked, but the creator must see a clear warning and explicitly confirm finalization despite incomplete required embedded polls.
  - Implementation note: computing missing voters requires server-side access to the full eligible voter set (`participantIds` + questing group `memberIds`) and existing vote docs. The `BASIC_POLL_REQUIRED_CHANGED` notification must be emitted from a server-side callable, not from the client's `emitNotificationEvent` call. The callable should accept `{ schedulerId, basicPollId }`, compute the missing voter set, and emit the event with `recipients.userIds` populated.
- **Required → Optional**:
  - No vote deletions.
  - Remove "incomplete" warnings related to that poll.

### Batch Voting Flow
When a scheduler has multiple embedded polls, the voter should be guided through them efficiently rather than hunting for each one independently.

**Recommended UX: inline voting with progress indicator.**
- The scheduler page shows embedded polls as a stacked card list (below or alongside the time slot voting area).
- Each card shows the poll title, vote type, required/optional badge, and either the voting UI (if not yet voted) or a compact summary of the user's vote (if already voted).
- A progress bar or "2/3 polls completed" indicator appears at the top of the embedded polls section.
- Required polls that are unvoted show a visual flag (amber dot or "Required" badge) so the user can scan for what's left.

**Why not a step-through wizard:**
- The scheduler page already has a lot of content (calendar, slots, vote toggles). Adding a modal wizard that steps through "Vote on schedule → Poll 1 → Poll 2 → Done" would break the user out of context.
- Inline cards let the user vote on polls in any order, skip optional ones, and see their progress at a glance.
- This is consistent with how scheduler slot voting already works (inline toggles per slot, not a wizard).

**Notification nudge:**
- When a participant has voted on the schedule but has unvoted required embedded polls, show a toast or inline banner: "You've voted on the schedule but haven't completed all required polls."
- The `BASIC_POLL_REMINDER` notification can be sent for overdue embedded polls (same as standalone polls).

### Completion Model (Recommended)
Define "completion" separately for:

- **Scheduler slot voting**: existing behavior (slot votes under `schedulers/{schedulerId}/votes/*`).
- **Required embedded basic polls**: per required embedded poll, per eligible voter.

Recommended notification behavior:
- Keep existing "all votes are in" / "ready to finalize" semantics based on scheduler slot voting only.
- Add separate completion UI for required embedded polls so creators can see "schedule is ready, but required embedded polls are incomplete".

Recommended rule for "has voted" on a basic poll:
- **Multiple-choice:** A vote doc counts as submitted if `optionIds` contains at least 1 option ID, or `allowWriteIn = true` and `otherText` is a non-empty string after trimming.
- **Ranked-choice:** A vote doc counts as submitted if `rankings` contains at least 1 option ID.

This avoids treating empty placeholder vote docs as "complete".

### Finalization Warnings (Required Embedded Polls)
Finalization should remain possible even if required embedded polls are incomplete, but the creator must get a deliberate confirmation step.

Recommended UX and data behaviors:
- When the creator clicks "Finalize", compute:
  - which required embedded polls exist
  - which eligible voters are missing votes for each required embedded poll
- If any required embedded poll is incomplete:
  - show a modal warning summarizing missing votes (poll name + count, expandable list of users)
  - require an explicit confirmation ("Finalize anyway")
- If finalized anyway:
  - record a snapshot on the scheduler doc for audit/debug UX (example fields):
    - `finalizedWithMissingRequiredBasicPollVotes: true`
    - `missingRequiredBasicPollVotesSummary: [{ basicPollId, missingCount }]`
    - `missingRequiredBasicPollVotesCapturedAt: <timestamp>`
- Emit a creator-only event (optional but useful):
  - `BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES` (embedded polls only)

This matches the requirement: warn loudly, do not hard-block finalization.

## URL & Routing Structure

Basic polls need stable URLs for notification `actionUrl` fields, Discord "View on web" links, and direct sharing.

### Standalone Group-Linked Polls
- Poll detail page: `/groups/:groupId/polls/:pollId`
  - Shows: poll title, description, voting UI (if open), results (if finalized or live), option notes.
- Group polls list (within Friends & Groups page): `/friends#group-:groupId-polls` (anchor hash within existing page) or a dedicated route `/groups/:groupId/polls`.

v1 recommendation: use `/groups/:groupId/polls/:pollId` as a dedicated route. This is simpler to implement than anchor navigation and provides a clean deep-link target. The Friends & Groups page links to it from the group card's "Polls" section.

### Embedded Polls (Scheduler)
- Embedded polls live within the scheduler page: `/scheduler/:schedulerId`
- For deep links to a specific embedded poll (from notifications or Discord): `/scheduler/:schedulerId?poll=:pollId`
  - The scheduler page scrolls to and highlights the target embedded poll card on load.
  - If the poll is not visible (collapsed section), auto-expand it.

### New Routes Required
Add to `web/src/App.jsx`:
- `/groups/:groupId/polls/:pollId` — `GroupPollPage` (new component, protected)
- No new route needed for embedded polls (they use the existing `/scheduler/:id` route with a query param).

## Dashboard Integration

The dashboard should surface polls that need the user's attention, consistent with the existing "Pending poll invites" pattern.

### "Polls to Vote On" Section
- Appears alongside existing dashboard sections (Pending Sessions, Finalized Sessions, Pending Poll Invites).
- Shows a card for each basic poll (standalone or embedded) where:
  - The user is eligible to vote AND
  - The user has not yet voted AND
  - The poll is `OPEN` (and for embedded polls, the parent scheduler is not `CANCELLED`)
- Card contents:
  - Poll title
  - Context line: "in [Group Name]" for standalone, "in [Scheduler Title]" for embedded
  - Vote type badge (Multiple Choice / Ranked Choice)
  - Required badge (if embedded and required)
  - Deadline countdown (if `deadlineAt` is set and approaching)
  - "Vote" button linking to the poll URL
- Section header: "Polls to vote on" (or "Open Polls" for brevity)
- Section only renders if there are unvoted polls (same pattern as pending invites).
- Visual treatment: use the existing card pattern with a distinct color (e.g., blue-50 border to differentiate from amber pending invites).

### Query Strategy
- For standalone group-linked polls: query `basicPolls` subcollections under each group the user is a member of, where `status = "OPEN"`, then filter client-side for "user has no vote doc".
- For embedded polls: query `basicPolls` subcollections under schedulers the user can see (already loaded for the dashboard), where the scheduler is `OPEN`, then filter for "user has no vote doc" and "required = true" (to prioritize required polls).
- v1 simplification: only surface **required** embedded polls and **all** standalone polls on the dashboard. Optional embedded polls can be discovered from the scheduler page. This avoids an overwhelming list.

## Data Model (Proposed)

### Group-Linked Polls
```
questingGroups/{groupId}/basicPolls/{pollId}
questingGroups/{groupId}/basicPolls/{pollId}/votes/{uid}
```

### Scheduler-Embedded Polls
```
schedulers/{schedulerId}/basicPolls/{pollId}
schedulers/{schedulerId}/basicPolls/{pollId}/votes/{uid}
```

Rationale:
- Keeps scope and permissions obvious via path.
- Avoids a top-level "basicPolls" collection that would require more complex rules to guarantee group membership.

Reality check (current codebase):
- Firestore rules currently allow only `schedulers/{schedulerId}/slots/*` and `schedulers/{schedulerId}/votes/*`.
- `questingGroups/{groupId}` currently has no allowed subcollections.
- Therefore both proposed subcollection paths will require explicit new Firestore rule matches; otherwise reads/writes will be denied by default.

### Poll Doc Shape (Minimal)
```
{
  title,
  description,
  options: [{ id, label, order, note }],   // note: optional markdown string
  status,           // "OPEN" | "FINALIZED"
  settings: {
    voteType,       // "MULTIPLE_CHOICE" | "RANKED_CHOICE" (default "MULTIPLE_CHOICE")
    allowMultiple,  // only when voteType = "MULTIPLE_CHOICE"
    maxSelections,  // only when allowMultiple
    allowWriteIn,   // only when voteType = "MULTIPLE_CHOICE"
    deadlineAt,     // timestamp (UTC) or null
  },
  order,            // integer; display order (for embedded polls with siblings)
  required,         // only for scheduler-embedded polls
  creatorId,        // matches scheduler/group convention
  createdAt,
  updatedAt,
  finalizedAt,      // optional timestamp (UTC)
  finalizedByUserId,// optional
  source,           // "web" | "discord" — where the poll was created
  finalResults,     // immutable snapshot written at finalization (see "Finalized Result Snapshots")
                    // shape: { winner, tied, tallies/rounds, voterCount, exhaustedCount, capturedAt }
  discord: {        // only for standalone polls with a Discord card
    messageId,      // Discord message ID of the poll card
    channelId,      // Discord channel where the card was posted
    guildId,        // Discord server ID
  }
}
```

### Vote Doc Shape (Minimal)

Multiple-choice (`voteType = "MULTIPLE_CHOICE"`):
```
{
  optionIds: [optionId, ...],
  otherText,     // optional
  updatedAt,
  source         // optional: "web" | "discord"
}
```

Ranked-choice (`voteType = "RANKED_CHOICE"`):
```
{
  rankings: [optionId, ...],   // ordered; index 0 = 1st choice
  updatedAt,
  source         // optional: "web" | "discord"
}
```

The `voteType` on the parent poll doc determines which fields are expected. Both shapes coexist in the same `votes/{uid}` subcollection path without ambiguity.

### Shared Utility Packaging (Web + Functions)
Current repo reality:
- `web/` uses ESM (`"type": "module"`).
- `functions/` is currently CommonJS (`main: "index.js"` + `require(...)`).

Recommendation:
- Keep IRV and multiple-choice tally implementations in parallel runtime-specific modules (`web/src/lib/basic-polls/*` and `functions/src/basic-polls/*`) with identical test vectors.
- Add shared fixture-based contract tests so both implementations always produce identical outputs.

## Data Integrity Rules

### Finalized Result Snapshots & Vote Mutability
To keep finalized outcomes stable while still supporting cleanup workflows:
- On standalone poll finalization, write an immutable `finalResults` snapshot on the poll doc (winner/tie, tallies/rounds, voter/exhausted counts, capturedAt).
- For embedded polls, compute and store immutable result snapshots when an embedded poll is finalized (individually or via the scheduler finalize-all path).
- OPEN polls: eligibility changes may prune vote docs.
- FINALIZED/CANCELLED polls: do not recompute outcome from live vote docs in the UI; read from the snapshot.

This prevents finalized results from drifting if later cleanup deletes raw vote docs.

### Membership / Participation Changes
Required behavior (Mode B):
- When a user is removed from a scheduler poll's participants, delete votes on OPEN polls:
  - `schedulers/{schedulerId}/votes/{uid}` (existing behavior today)
  - `schedulers/{schedulerId}/basicPolls/*/votes/{uid}` (new behavior)

Reality check (current codebase):
- Participant removal is currently implemented in a few concrete places:
  - `web/src/lib/data/pollInvites.js` `removeParticipantFromPoll(...)` deletes the scheduler vote doc and removes `participantIds`.
  - `functions/src/legacy.js` `removeGroupMemberFromPolls` removes a questing-group member from all schedulers using the group and deletes their scheduler vote docs.
- To meet the "votes cleared when removed" requirement for embedded basic polls, those flows must also delete
  `schedulers/{schedulerId}/basicPolls/*/votes/{uid}` (and any Discord voting session state if introduced).

Required (Mode A):
- When a user is removed from a questing group, delete votes on OPEN polls:
  - `questingGroups/{groupId}/basicPolls/*/votes/{uid}`
- Implementation note: the existing `removeGroupMemberFromPolls` callable only queries `schedulers` with matching `questingGroupId`. A parallel flow is needed for group-linked basic polls since those live under `questingGroups/`, not `schedulers/`. Either extend the callable or create a new one.

### Poll/Group Deletion Cleanup (Reality Check)
Current codebase reality:
- Scheduler deletion in the web UI currently manually deletes `slots/*` and `votes/*` before deleting the scheduler doc (see `web/src/features/scheduler/SchedulerPage.jsx`).
  - If we add `schedulers/{schedulerId}/basicPolls/*`, the same delete flow must also delete:
    - `schedulers/{schedulerId}/basicPolls/*/votes/*`
    - `schedulers/{schedulerId}/basicPolls/*`
  - Alternative: introduce a server callable that performs an admin `recursiveDelete` on the scheduler doc to avoid client-side fan-out deletes.
- Questing group deletion in the web UI currently deletes only the group doc (`web/src/lib/data/questingGroups.js` `deleteQuestingGroup`).
  - If we store group-linked polls under `questingGroups/{groupId}/basicPolls/*`, deleting the group doc would orphan those subcollection docs (inaccessible via rules, but still stored).
  - Recommended: implement group deletion via a callable that performs an admin `recursiveDelete` of the group doc (or delete basic polls explicitly before deleting the group).
- Additionally, when deleting a group, schedulers with `questingGroupId` matching the deleted group should have that field cleared to avoid dangling references. This is a pre-existing gap (not specific to basic polls) but is amplified by this feature since group-linked basic polls add a second kind of orphaned data.

### User Deletion Cleanup (Reality Check)
Current codebase reality:
- User deletion is implemented as a callable (`functions/src/legacy.js` `deleteUserAccount`).
- For user-created schedulers, `db.recursiveDelete(pollDoc.ref)` is used — this will automatically cascade to any `basicPolls/*` and their `votes/*` subcollections. No extra code needed for embedded polls in user-created schedulers.
- For schedulers created by others, the callable deletes the user's vote doc at `schedulers/{id}/votes/{uid}` but does NOT touch nested subcollections. The callable also calls `deleteUserVotesEverywhere`, which queries `collectionGroup("votes")` by document ID — however, `FieldPath.documentId()` in collection group queries may not match deeply nested paths like `schedulers/{sId}/basicPolls/{bpId}/votes/{uid}`. This needs verification during implementation; if it doesn't match, the callable must explicitly query and delete basic poll votes.
- For group-linked basic polls (`questingGroups/{gId}/basicPolls/*/votes/{uid}`): these are NOT covered by any existing cleanup path. The callable must be extended to query the user's group memberships and delete their basic poll votes under each group.
- If vote docs are deleted on finalized polls due to account deletion/privacy cleanup, finalized UI must still render from `finalResults` snapshots (not live vote docs).

### Blocking / Suppression (Edge Case)
Current codebase reality:
- Blocking primarily suppresses or revokes *invites* and friend requests.
- It does not automatically remove existing group membership or scheduler participation.

For basic polls:
- Blocking should not retroactively change eligibility for existing group-linked polls or embedded polls unless we explicitly add a "remove on block" rule later.

### Option Edits
Allowable edits after votes exist:
- Editing `label` is fine (votes store option IDs).
Edits that require careful behavior:
- Removing an option that has votes:
  - Option A (simplest): disallow removal if any votes exist for it.
  - Option B: allow removal, but automatically remove that optionId from all vote docs (requires a server job / trigger).

v1 recommendation: disallow removal of voted-on options; allow label edits and reordering.

### Vote Reset vs Migration (Recommended Rule)
Some setting changes are hard to apply safely once votes exist. Recommended behavior:

- If a creator changes any of:
  - `voteType` (between `MULTIPLE_CHOICE` and `RANKED_CHOICE`)
  - `allowMultiple`
  - `maxSelections`
  - `allowWriteIn`
  - removing options
- Then require the creator to choose one:
  - **Cancel the change** (keep existing votes valid)
  - **Reset votes** for that basic poll (delete all vote docs and emit a "poll changed, votes reset" notification)

This keeps the system deterministic and avoids partial/ambiguous vote migrations.

## Notifications (Unified Notification Overhaul Integration)

### Event Emission
Use the existing "emit events, route centrally" model:
- Feature code emits an event, router delivers in-app/email/Discord.

Security/ownership guardrail:
- Do **not** emit authoritative lifecycle events directly from web clients for privileged actions (`*_FINALIZED`, `*_REOPENED`, `*_REMOVED`, `*_RESET`, required-change events).
- Emit these from server-side callables/triggers after ownership/permission checks against Firestore data.
- Client-side emission is acceptable only for non-authoritative user-local actions where actor/resource authorization is already constrained and non-privileged.

Proposed event types (names TBD; keep consistent with existing `POLL_*` taxonomy or introduce `BASIC_POLL_*`):
- `BASIC_POLL_CREATED`
- `BASIC_POLL_FINALIZED`
- `BASIC_POLL_REOPENED`
- `BASIC_POLL_DEADLINE_CHANGED`
- `BASIC_POLL_VOTE_SUBMITTED` (targeted to poll creator: for group-linked polls the poll's `creatorId`, for embedded polls the scheduler's `creatorId`; may be noisy)
- `BASIC_POLL_REMINDER` (rate-limited; to non-voters)
- `BASIC_POLL_REQUIRED_CHANGED` (embedded polls only; used for creator/participant notices)
- `BASIC_POLL_RESET` (when a creator resets votes due to settings/options change)
- `BASIC_POLL_REMOVED` (embedded polls only; useful to update Discord messages + clear UI state)
- `BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES` (embedded polls only; creator-only warning/audit)
- `BASIC_POLL_RESULTS` (posted to Discord when a basic poll is finalized; for ranked-choice includes winner/tie + round count)

Routing suggestions:
- Group-linked polls:
  - In-app: group members (or only targeted members if we later add an explicit invite subset)
  - Discord: if group has Discord linked and has "Basic polls" enabled
  - Email: optional; likely off by default for noise
  - **Results to Discord:** When a standalone group-linked poll is finalized, emit `BASIC_POLL_RESULTS` → Discord handler posts a results summary (winner, vote breakdown, link to full results) to the group's linked channel.
- Scheduler-embedded polls:
  - In-app/email: scheduler vote-eligible users (same as the scheduler poll)
  - Discord: same channel as the scheduler poll, but preferably as separate messages per embedded poll (rather than overloading the scheduler poll card)
  - **Results to Discord:** Embedded poll results are posted to Discord **only when the parent session poll is finalized** (not when individual embedded polls are finalized). When the scheduler emits `POLL_FINALIZED`, the Discord handler should also post summaries for each embedded basic poll's results. This avoids spamming Discord during active scheduling.

Discord settings reality check:
- Questing group Discord settings currently expose toggles for scheduler poll notifications (finalization, all-votes-in, vote-submitted, slot-changes).
- Basic polls will need either:
  - a new toggle namespace (example: `group.discord.notifications.basicPolls`), or
  - reuse an existing toggle (not recommended; too coarse).

### Auto-Clear
When finalized:
- Clear reminders, "poll reopened", and "poll reset" notifications for that poll.
When reopened:
- Clear "finalized" notification for that poll.
When reset (`BASIC_POLL_RESET`):
- Clear reminders and any "incomplete" notices for that poll (voters need to re-vote).
When vote submitted (`BASIC_POLL_VOTE_SUBMITTED`):
- Clear the voter's own reminder notification for that poll (same pattern as scheduler `VOTE_SUBMITTED` clearing `VOTE_REMINDER`).

Required embedded-poll "incomplete" notices:
- When a required embedded poll is added or becomes required, emit participant-facing notices (in-app; optional email).
- When a participant submits a vote for that embedded poll, clear their "incomplete" notice for that poll.
- When the embedded poll becomes optional or is removed, clear related notices.

## Discord Voting (Integration Plan)

This repo already has a Discord bot architecture for scheduler polls using:
- Interactions + signature verification
- "Always defer + async worker" pattern (Cloud Tasks)
- Per-user identity linking

Basic poll voting should reuse the same primitives:
- A poll card posted to the linked group channel (or scheduler channel for embedded polls).
- "Vote" button opens an ephemeral selection UI.
- "Finalize" button (standalone group-linked polls only) allows the creator to finalize from Discord.
- Submit writes the vote doc (with `source = "discord"`).
- Edits should be allowed while the poll is `OPEN`.
- Once `FINALIZED`, voting UI should be disabled and the card should show finalized results.

Option notes on Discord:
- Discord poll cards should list option labels. If any option has a `note`, append a brief indicator (e.g., "ℹ️" or "(has details)") next to the label.
- Option notes are markdown and may be too long for a Discord embed. Do NOT inline full notes in the card. Instead, include a "View details on web" link pointing to the poll page where notes can be read in full.
- In the ephemeral voting UI (select menus), use the option's `label` as the select menu option text. Discord select menu option descriptions (max 100 chars) can show a truncated preview of the note if present.

Reality check (current codebase):
- Scheduler polls currently post and maintain a single "poll card" Discord message driven by Firestore triggers in `functions/src/triggers/scheduler.js`.
- That trigger's sync hash covers scheduler title/status/slots and participant counts; it does not account for additional embedded poll state.
- For embedded basic polls, we should plan for **separate Discord messages per embedded basic poll** (recommended),
  or explicitly extend the scheduler poll card format and sync hash to include embedded poll summaries (higher churn and more Discord UI constraints).

Discord UI limits (edge case):
- Discord select menus cap at 25 options. If a basic poll has > 25 choices:
  - paginate (similar to existing scheduler vote UI patterns), or
  - fall back to "Vote on web" for oversized polls.

Race conditions (edge case):
- A user may open an ephemeral voting UI and then the basic poll is removed, finalized, or edited before submission.
- On submission, the worker should:
  - re-fetch the current poll doc
  - reject with a clear message if the poll is gone/closed or option IDs no longer exist
  - avoid writing partial/invalid vote docs

Discord vote sessions (implementation detail):
- Current scheduler vote sessions use `discordVoteSessions/{discordUserId}:{schedulerId}` and store `{ feasibleSlotIds, preferredSlotIds, pageIndex }`.
- Basic poll vote sessions have a different shape depending on `voteType`. Proposed:
  - Session ID: `{discordUserId}:basicPoll:{basicPollId}`
  - Multiple-choice doc shape: `{ selectedOptionIds: [], otherText: null, pollId, parentType: "group"|"scheduler", parentId, interactionToken, createdAt, expiresAt }`
  - Ranked-choice doc shape: `{ rankings: [], currentStep: 0, pollId, parentType: "group"|"scheduler", parentId, interactionToken, createdAt, expiresAt }`
- Discord interaction custom IDs must distinguish basic poll actions from scheduler actions. Proposed prefix: `bp_vote:{pollId}` (vs existing `vote:{schedulerId}` for scheduler slots).
- For ranked-choice, additional custom ID prefixes: `bp_rank_select:{pollId}`, `bp_rank_undo:{pollId}`, `bp_rank_reset:{pollId}`, `bp_rank_submit:{pollId}`.
- Session TTL and cleanup should follow the same pattern as scheduler vote sessions (`VOTE_SESSION_TTL_MINUTES`).

### Write-In via Discord (Exploration)
If we decide to support write-in from Discord:
- Use a modal for "Other" input, then store `otherText`.
If we want to keep Discord simple:
- Allow only discrete option selection on Discord (no write-in).

## Deadline Auto-Finalization (Reality Check)
The design above describes deadline-driven finalization.

Current codebase reality:
- There are no general scheduled/background jobs for "finalize when deadline passes" (other than a Discord warmup schedule).
- Scheduler voting is primarily gated by UI (Firestore rules do not currently prevent vote writes when a scheduler is `FINALIZED`).

Implementation options for basic polls:
1. Rules-enforced close: in Firestore rules, block vote writes when closed/finalized or `deadlineAt != null && request.time >= deadlineAt`.
2. True auto-finalize: add a scheduled Cloud Function to transition `status` to `FINALIZED` and emit a notification event (requires billing + schedule + indexes).

v1 decision: **rules-enforced close** (option 1). Polls may remain `OPEN` after deadline until explicitly finalized, but vote writes are blocked by rules after deadline.

## Discord Poll Creation & Finalization

### `/poll-create` Command (Top-Level)

Creates a standalone group-linked basic poll directly from Discord. The command can only be run in a channel that is linked to a questing group.

#### Command Registration
Add to `functions/scripts/register-discord-commands.js`:
```
/poll-create
  title       (string, required)  — Poll title
  options     (string, required)  — Pipe-delimited options: "Cats | Dogs | Turtles"
  mode        (choice, optional)  — "multiple-choice" (default) | "ranked-choice"
  multi       (boolean, optional) — Allow multiple selections (multiple-choice only, default false)
  allow_other (boolean, optional) — Enable write-in "Other" (multiple-choice only, default false)
  deadline    (string, optional)  — Deadline as ISO date "2026-03-15" or relative "3d" / "1w"
```

Default member permissions: none required (authorization is checked server-side against QS group manager status, not Discord permissions).

#### Authorization & Validation Flow
The ingress layer defers immediately (ephemeral response, type 5 + flags 64). The worker then:

1. **Resolve Discord user → QS user** via `discordUserLinks/{discordUserId}`. If not linked → ephemeral error: "Link your Discord account to Quest Scheduler first."
2. **Find linked questing group** by querying groups where `discord.channelId == interaction.channelId`. If none → ephemeral error: "No Quest Scheduler group is linked to this channel. Use `/link-group` first."
3. **Check group manager status** via `isGroupManager(group, qsUserId)`. If not a manager → ephemeral error: "Only group managers can create polls. Ask the group owner to grant you permissions."
4. **Parse options** from pipe-delimited string. Trim whitespace, filter empty entries.
   - Validation: minimum 2 options, maximum 25 (Discord select menu limit; polls with more options should be created on the web).
   - If `mode = ranked-choice` and `allow_other = true` → ephemeral error: "Write-in is not supported for ranked-choice polls."
   - If `mode = ranked-choice` and `multi = true` → ignore `multi` silently (not applicable).
5. **Parse deadline** (if provided):
   - Accept ISO date format (`2026-03-15`) or relative shorthand (`3d`, `1w`, `2w`).
   - Convert to UTC timestamp. If the resulting timestamp is in the past → ephemeral error: "Deadline must be in the future."
   - If not provided → `deadlineAt = null`.
6. **Create poll doc** at `questingGroups/{groupId}/basicPolls/{pollId}` with:
   - `title`, `description: null`, `status: "OPEN"`, `creatorId: qsUserId`
   - `options`: generated with stable IDs, `order` matching input order, `note: null`
   - `settings`: `{ voteType, allowMultiple, maxSelections: null, allowWriteIn, deadlineAt }`
   - `source: "discord"`
   - `createdAt`, `updatedAt`: server timestamps
7. **Post poll card** to the channel (non-ephemeral `createChannelMessage`).
8. **Store Discord metadata** on the poll doc: `discord: { messageId, channelId, guildId }`.
9. **Edit ephemeral response** with success confirmation including a **Link button** (style 5) pointing to the web edit page: `{APP_URL}/groups/{groupId}/polls/{pollId}`. Message: "Poll created! See the poll card above. Click **Edit on Web** to add descriptions, option notes, or fine-tune settings."
10. **Emit `BASIC_POLL_CREATED` notification event** targeting group members.

#### Limitations (Discord-Created Polls)
- Option notes cannot be added from Discord (markdown editing requires the web UI).
- `maxSelections` cannot be set from Discord (would require an additional parameter). Default is unlimited when `multi = true`.
- Poll description cannot be set from the slash command (would be a large text block in a command parameter).
- All of these can be added by clicking **Edit on Web** — see "Seamless Discord-to-Web Handoff" below.

### Basic Poll Card

The poll card is a Discord embed message posted to the linked channel. It serves as the central interaction point for voting and (for creators) finalization.

#### Card Layout
```
Embed:
  Color:    Accent blue (open) / Green (finalized) / Gray (cancelled)
  Title:    "📊 {title}"
  Description: "{description}" or omitted if null
  Fields:
    - "Type"     : "Multiple Choice" | "Ranked Choice"     (inline)
    - "Status"   : "Open" | "Finalized"                    (inline)
    - "Options"  : numbered list of labels                  (block)
                   (append "ℹ️" if option has a note)
    - "Votes"    : "X/Y voted"                              (inline)
    - "Deadline" : "<t:{unix}:R>" or "None"                 (inline)
    - "Results"  : vote summary (only when finalized)       (block)
  Footer:   "View details on web: {url}"

Components (when OPEN):
  Row 1: [Vote (Primary)] [Finalize (Secondary)]

Components (when FINALIZED):
  Row 1: [Voting Closed (Disabled)] [View Results (Link)]
```

#### Card Sync
The poll card should be updated when the poll state changes. Use trigger-based sync (same reliability model as scheduler cards):
- Poll doc trigger: `questingGroups/{groupId}/basicPolls/{pollId}` for title/status/settings changes.
- Vote doc trigger: `questingGroups/{groupId}/basicPolls/{pollId}/votes/{uid}` for vote count/result changes.
- Both enqueue a shared sync worker that computes `discord.syncHash` and updates the Discord message only when hash changes.

#### Card Update Events
The card should be refreshed on:
- Poll created (initial post — handled by the creation flow)
- Vote submitted or cleared (vote count changed)
- Poll finalized (status + results)
- Poll reopened (status back to open)
- Poll edited on web (title, options, settings changed)
- Poll deleted (delete the Discord message)

### Discord Finalization Flow

The "Finalize" button on the poll card allows the poll creator (or any group manager) to finalize the poll directly from Discord.

#### Interaction Flow
1. User clicks **[Finalize]** on the poll card.
2. Ingress defers (type 6 — deferred update, since we'll update the card).
3. Worker:
   a. Resolve Discord user → QS user.
   b. Fetch poll doc and parent group doc.
   c. **Permission check**: verify `isGroupManager(group, qsUserId)`. If not → ephemeral error: "Only group managers can finalize polls."
   d. **Status check**: if poll is already `FINALIZED` → ephemeral error: "This poll is already finalized."
   e. **Ranked-choice tie check**: if `voteType = "RANKED_CHOICE"`, compute IRV result. If the final round is a tie → ephemeral error: "This poll has a tie at the final round. Please finalize on the web to pick a winner." (Discord cannot present the tie-breaking UI.)
   f. **Finalize**: update poll doc with `status: "FINALIZED"`, `finalizedAt`, `finalizedByUserId`.
   g. **Compute results**: tally votes (multiple-choice: count per option; ranked-choice: run IRV).
   h. **Update poll card** with finalized state and results summary (see "Results Display" below).
   i. **Post results message** as a new message in the channel (separate from the card, for visibility in chat flow).
   j. **Emit notification events**: `BASIC_POLL_FINALIZED` + `BASIC_POLL_RESULTS` targeting group members.

#### Results Display on Discord

**Multiple-choice results message:**
```
📊 **Poll Results: "{title}"**

🏆 **Pizza** — 4 votes (57%)
🥈 Subs — 2 votes (29%)
🥉 Salad — 1 vote (14%)

7 voters · Finalized by @username
View full results: {url}
```

**Ranked-choice results message:**
```
📊 **Poll Results: "{title}"**

🏆 **Curse of Strahd** wins after 3 rounds!

Round 1: Strahd (3), Annihilation (2), Avernus (2) — no majority
Round 2: Strahd (3), Annihilation (3) — Avernus eliminated
Round 3: Strahd (4), Annihilation (3) — majority reached

5 voters · 1 exhausted ballot · Finalized by @username
View full round-by-round breakdown: {url}
```

**Ranked-choice tie message** (if finalized from web after tie-breaking):
```
📊 **Poll Results: "{title}"**

🏆 **Curse of Strahd** (tie broken by @creator)

Tied options: Curse of Strahd, Tomb of Annihilation (after 4 rounds)
5 voters · Finalized by @username
View full results: {url}
```

#### Finalize Confirmation (Optional UX Enhancement)
For extra safety, the Finalize button could open an ephemeral confirmation:
- "Are you sure you want to finalize **{title}**? Voting will be closed."
- **[Confirm Finalize]** **[Cancel]**
- Custom IDs: `bp_finalize_confirm:{pollId}`, `bp_finalize_cancel:{pollId}`

v1 recommendation: skip the confirmation dialog. Polls can be reopened, so finalization is not destructive. Add confirmation later if users accidentally finalize.

### Reopen from Discord (Deferred)
v1: reopening is web-only. The web UI allows setting a new deadline and adjusting settings which is too complex for a Discord interaction. If needed later, add a **[Reopen]** button that appears on finalized cards, gated to group managers.

### New Custom ID Prefixes
Add to the worker's interaction routing:

| Custom ID Pattern | Handler | Description |
|---|---|---|
| `bp_vote:{pollId}` | `handleBasicPollVoteButton()` | Opens ephemeral voting UI |
| `bp_submit:{pollId}` | `handleBasicPollSubmitVote()` | Commits multiple-choice vote |
| `bp_clear:{pollId}` | `handleBasicPollClearVote()` | Deletes vote doc |
| `bp_finalize:{pollId}` | `handleBasicPollFinalize()` | Finalizes the poll |
| `bp_mc_select:{pollId}` | `handleBasicPollMCSelect()` | Multiple-choice option selection |
| `bp_rank_select:{pollId}` | `handleBasicPollRankSelect()` | Ranked-choice step selection |
| `bp_rank_undo:{pollId}` | `handleBasicPollRankUndo()` | Undo last ranked choice |
| `bp_rank_reset:{pollId}` | `handleBasicPollRankReset()` | Reset entire ranking |
| `bp_rank_submit:{pollId}` | `handleBasicPollRankSubmit()` | Submit final ranking |

### New Error Messages
Add to `functions/src/discord/error-messages.js`:

| Key | Message |
|---|---|
| `noLinkedGroupForPoll` | "No Quest Scheduler group is linked to this channel. Use `/link-group` first." |
| `notGroupManager` | "Only group managers can create or finalize polls." |
| `tooFewOptions` | "A poll needs at least 2 options." |
| `tooManyOptionsDiscord` | "Discord supports up to 25 options. Create polls with more options on the web." |
| `writeInNotRanked` | "Write-in is not supported for ranked-choice polls." |
| `deadlineInPast` | "Deadline must be in the future." |
| `pollAlreadyFinalized` | "This poll is already finalized." |
| `pollTieBreakWeb` | "This ranked-choice poll has a tie. Please finalize on the web to pick a winner." |
| `basicPollNotFound` | "This poll no longer exists. It may have been deleted." |
| `basicPollClosed` | "Voting is closed for this poll." |

### Command Registration Update
Add the new top-level command to `functions/scripts/register-discord-commands.js` alongside existing `link-group` and `unlink-group`:
```javascript
{
  name: "poll-create",
  description: "Create a poll for the group linked to this channel",
  options: [
    { name: "title",       type: 3, description: "Poll title",                          required: true },
    { name: "options",     type: 3, description: "Options separated by | (e.g. Cats | Dogs | Turtles)", required: true },
    { name: "mode",        type: 3, description: "Voting mode",
      choices: [
        { name: "Multiple Choice", value: "multiple-choice" },
        { name: "Ranked Choice",   value: "ranked-choice" },
      ]},
    { name: "multi",       type: 5, description: "Allow selecting multiple options (multiple-choice only)" },
    { name: "allow_other", type: 5, description: "Allow write-in Other option (multiple-choice only)" },
    { name: "deadline",    type: 3, description: "Deadline: ISO date (2026-03-15) or relative (3d, 1w)" },
  ],
}
```

Option type reference: 3 = String, 5 = Boolean.

## Discord Session Poll Creation (P3 — Post-Core)

This section is a fully designed but **deprioritized** feature. Implement after the core basic polls feature (Phases 1–11) is tested and validated on its own feature branch.

### `/session-create` Command (Top-Level)

Creates a session poll (scheduler) from Discord with an interactive date selection wizard. The command can only be run in a channel linked to a questing group. The resulting session poll is automatically linked to that group.

#### Command Registration
Add to `functions/scripts/register-discord-commands.js`:
```
/session-create
  title       (string, required)  — Session poll title
  description (string, optional)  — Brief description
```

Dates are selected interactively (not via command parameters) because Discord does not have a native date picker component.

#### Authorization Flow
1. **Resolve Discord user → QS user** via `discordUserLinks`. If not linked → error.
2. **Find linked questing group** by `discord.channelId`. If none → error: "No Quest Scheduler group is linked to this channel."
3. **Verify group membership** (not manager — any group member can create session polls, matching web behavior where anyone can create a scheduler). If not a member → error.
4. **Fetch user's session defaults** from `users/{qsUserId}.settings`:
   - `defaultStartTimes` (per-day: `{ 0: { time, durationMinutes }, ... }`)
   - `defaultStartTime` (simple mode fallback)
   - `defaultDurationMinutes` (global fallback: 240)
   - `timezone` / `timezoneMode` (user's preferred timezone)
5. **Show date selection wizard** (see below).

#### Date Selection Wizard (Week View)

Discord has no native calendar component, so the bot presents a **week-at-a-time button grid** in an ephemeral message. Each date is a toggle button; selected dates are tracked in the worker's session state.

**Layout:**
```
📅 Session Poll: "Friday Game Night"

Select dates for time slots. Each date uses your
default session time for that day of the week.
Your timezone: America/New_York

          Feb 10 – Feb 16, 2026

[Mon 10] [Tue 11] [Wed 12] [Thu 13] [Fri 14 ✓]
[Sat 15 ✓] [Sun 16]       [◀ Prev] [Next ▶]
[Create (2 dates)] [Edit on Web ↗] [Cancel]
```

**Component layout (3 of 5 Action Rows):**

| Row | Components | Notes |
|---|---|---|
| 1 | `[Mon]` `[Tue]` `[Wed]` `[Thu]` `[Fri]` | 5 date buttons (weekdays) |
| 2 | `[Sat]` `[Sun]` `[◀ Prev]` `[Next ▶]` | 2 date buttons + 2 navigation |
| 3 | `[Create ({n} dates)]` `[Edit on Web ↗]` `[Cancel]` | 1 Primary + 1 Link + 1 Danger |

Total: 14 buttons across 3 rows — well within Discord's 5-row, 25-button limit. Leaves 2 rows free for future expansion (e.g., duration override, description).

**Button styles:**

| State | Style | Example |
|---|---|---|
| Unselected future date | Secondary (gray) | `[Mon 10]` |
| Selected date | Success (green) | `[Fri 14 ✓]` |
| Past date | Secondary + disabled | `[Mon 3]` (grayed out) |
| Today | Primary (blue) if unselected | `[Tue 11]` |
| Navigation | Secondary | `[◀ Prev]` `[Next ▶]` |
| Create | Primary (disabled if 0 dates selected) | `[Create (3 dates)]` |
| Edit on Web | Link (style 5, opens URL) | `[Edit on Web ↗]` |
| Cancel | Danger (red) | `[Cancel]` |

**Embed content above buttons:**
- Title: session poll title
- Current week date range
- User's timezone
- Selected dates summary with default times:
  ```
  Selected:
  • Fri, Feb 14 → 6:00 PM – 10:00 PM
  • Sat, Feb 15 → 12:00 PM – 4:00 PM
  ```
  Times shown are computed from user defaults for each weekday.

**Interaction behavior:**
- **Date button click**: toggle selection state, update the ephemeral message via `UPDATE_MESSAGE` (type 7). The interaction token resets on every click, so there is no 15-minute timeout as long as the user keeps interacting.
- **Navigation buttons**: shift the displayed week forward/backward. Selected dates from other weeks are preserved in the session state. Past-only weeks disable all date buttons.
- **Create button**: disabled until at least 1 date is selected. On click → create the poll.
- **Edit on Web button**: creates a minimal scheduler in Firestore with the currently selected dates (or no dates if none selected), then opens the web edit page via Link button URL. If no dates are selected, creates the scheduler with just the title/description so the user can add slots on web.
- **Cancel button**: dismiss the ephemeral message, clean up session state.

#### Session State
Store the wizard state in Firestore during the interactive flow:
```
discordSessionCreateSessions/{discordUserId}:{channelId}: {
  title,
  description,
  groupId,
  qsUserId,
  selectedDates: ["2026-02-14", "2026-02-15"],  // ISO date strings
  currentWeekStart: "2026-02-10",                 // Monday of displayed week
  userDefaults: { ... },                          // cached session defaults
  userTimezone: "America/New_York",
  interactionToken,
  createdAt,
  expiresAt                                       // 15 min TTL, refreshed on each interaction
}
```

Session ID uses `{discordUserId}:{channelId}` to allow one active wizard per user per channel. Starting a new `/session-create` while a wizard is active replaces the old session.

#### Slot Generation
When the user clicks "Create", generate slots from selected dates + user defaults:

1. For each selected date string (e.g., `"2026-02-14"`):
   a. Determine the weekday (0-6, Sunday = 0).
   b. Look up user defaults: `getSessionDefaults(weekday)` → `{ time: "18:00", durationMinutes: 240 }`.
   c. Combine date + time in the user's timezone: `"2026-02-14T18:00:00"` in `America/New_York`.
   d. Convert to UTC: `fromZonedTime(localDateTime, userTimezone)`.
   e. Compute end time: `start + durationMinutes`.
2. Sort slots by start time.

Server-side implementation note: replicate the `getSessionDefaults(weekday)` logic from `web/src/hooks/useUserSettings.js` (lines 61-87) in a shared utility under `functions/src/utils/session-defaults.js`. The logic is simple: check `defaultStartTimes[weekday]` for the new format `{ time, durationMinutes }`, fall back to the old string format, then fall back to `defaultStartTime` + `defaultDurationMinutes`.

#### Poll Creation
After slot generation:

1. **Create scheduler doc** at `schedulers/{schedulerId}`:
   - `title`, `description`
   - `creatorId`: QS user ID
   - `creatorEmail`: QS user email
   - `status: "OPEN"`
   - `questingGroupId`: linked group ID
   - `participantIds: [creatorId]`
   - `pendingInvites: []`
   - `timezone`: user's timezone
   - `timezoneMode: "manual"`
   - `source: "discord"`
   - `allowLinkSharing: false`
   - `createdAt`, `updatedAt`: server timestamps
2. **Create slot subdocs** at `schedulers/{schedulerId}/slots/{slotId}`:
   - `start`: UTC ISO string
   - `end`: UTC ISO string
   - `stats: { feasible: 0, preferred: 0 }`
3. **Post poll card** to the channel (non-ephemeral) using the existing `buildPollCard()` pattern.
4. **Store Discord metadata** on the scheduler doc: `discord: { messageId, channelId, guildId, ... }`.
5. **Update ephemeral message** with confirmation:
   ```
   ✅ Session poll created: "Friday Game Night"

   📅 3 time slots:
   • Fri, Feb 14 at 6:00 PM – 10:00 PM EST
   • Sat, Feb 15 at 12:00 PM – 4:00 PM EST
   • Fri, Feb 21 at 6:00 PM – 10:00 PM EST

   Times based on your default session times.

   [Edit on Web ↗] to adjust times, add participants,
   or attach embedded polls.
   ```
   The **Edit on Web** button (Link, style 5) points to `{APP_URL}/scheduler/{schedulerId}/edit`.
6. **Emit `POLL_CREATED` notification event** targeting group members.
7. **Clean up session state** (delete the wizard session doc).

#### New Custom ID Prefixes
Add to the worker's interaction routing:

| Custom ID Pattern | Handler | Description |
|---|---|---|
| `sc_date:{weekday}:{dateStr}` | `handleSessionCreateDateToggle()` | Toggle a date selection |
| `sc_prev_week` | `handleSessionCreateWeekNav()` | Navigate to previous week |
| `sc_next_week` | `handleSessionCreateWeekNav()` | Navigate to next week |
| `sc_create` | `handleSessionCreateConfirm()` | Create the session poll |
| `sc_cancel` | `handleSessionCreateCancel()` | Cancel and clean up |

The "Edit on Web" button uses Discord's Link button type (style 5) which opens a URL directly — no custom ID or server handler needed.

#### New Error Messages
Add to `functions/src/discord/error-messages.js`:

| Key | Message |
|---|---|
| `notGroupMemberForCreate` | "You must be a member of the linked group to create a session poll." |
| `noDefaultsFound` | "Unable to load your session defaults. Please set them up in Quest Scheduler settings." |
| `noDateSelected` | "Select at least one date before creating the poll." |
| `sessionCreateExpired` | "Session creation expired. Run `/session-create` again." |

## Seamless Discord-to-Web Handoff

Both basic poll and session poll creation from Discord are intentionally limited — Discord's UI cannot support the full feature set (option notes, fine-grained time editing, embedded polls, participant management). The **Edit on Web** handoff provides a seamless path to the full editing experience.

### How It Works
1. The poll/scheduler is **created in Firestore immediately** when the user clicks "Create" in Discord. It is fully functional (status `OPEN`, accepting votes).
2. The ephemeral confirmation message and the poll card both include an **Edit on Web** Link button (Discord style 5) that opens the web edit page directly.
3. The web edit page loads the existing document from Firestore — all data entered in Discord (title, options, dates, settings) is already there.
4. The user can add what Discord cannot support, then save.

No draft state is needed. The poll exists and works immediately; web editing is optional enhancement, not a required step.

### What Carries Over from Discord

| Feature | Basic Polls | Session Polls |
|---|---|---|
| Title | ✅ | ✅ |
| Description | ❌ (not in command) | ✅ (optional param) |
| Options / Dates | ✅ (pipe-delimited) | ✅ (button-selected dates) |
| Vote type | ✅ (mode param) | N/A |
| Allow multiple | ✅ (multi param) | N/A |
| Allow write-in | ✅ (allow_other param) | N/A |
| Deadline | ✅ (deadline param) | ❌ (add on web) |
| Option notes | ❌ | N/A |
| Slot times | N/A | ✅ (from user defaults) |
| Group linkage | ✅ (from channel) | ✅ (from channel) |
| Discord card | ✅ (auto-posted) | ✅ (auto-posted) |

### What Can Only Be Set on Web

**Basic polls:**
- Option notes (markdown editor)
- Poll description
- `maxSelections` (for multi-select)
- Fine-tuning deadline
- Editing options after creation

**Session polls:**
- Adjusting individual slot times/durations
- Adding slots for times outside user defaults
- Adding explicit participants (non-group-members)
- Attaching embedded basic polls
- Calendar event settings
- Link sharing toggle

### URL Patterns
- Basic poll edit: `{APP_URL}/groups/{groupId}/polls/{pollId}` (the detail page with edit mode for managers)
- Session poll edit: `{APP_URL}/scheduler/{schedulerId}/edit` (existing `CreateSchedulerPage` in edit mode)

### Web Page Behavior on Load
- **Session poll edit page** (`CreateSchedulerPage` with `editId`): already loads the scheduler + slots from Firestore and populates the form. No changes needed — Discord-created schedulers load identically to web-created ones.
- **Basic poll detail page**: needs an "Edit" button/mode for group managers that enables editing title, description, options, notes, and settings. This page is new (part of the basic polls feature) and should support both read-only (voting/results) and edit modes.

### UX Considerations
- The **Edit on Web** button should always be visible in the ephemeral confirmation message, even if the user doesn't need it — it doubles as a "view your poll on the web" shortcut.
- The poll card's embed footer should include a "View on web: {url}" link (non-interactive text, since embeds support markdown links).
- If the user clicks "Edit on Web" in the date selection wizard *before* clicking "Create", the wizard should still create the scheduler with whatever dates are selected (or just the title if no dates), then redirect to the edit page. This avoids losing the user's work.

## Firestore Indexes

New indexes will be needed for:
- `questingGroups/{groupId}/basicPolls` — any filtered/sorted queries (e.g., by `status`, `createdAt`).
- `schedulers/{schedulerId}/basicPolls` — any filtered/sorted queries.
- Collection group queries on `votes` under `basicPolls` (if used for cleanup or aggregation).

Define these in `firestore.indexes.json` during implementation. Test with the emulator first — the emulator logs will surface missing index errors with direct links to create them.

## Library Dependencies

### Option Notes (Markdown Editing + Rendering)

**Recommended approach:** Plain `<textarea>` with Write/Preview tab toggle + `react-markdown` for rendering.

| Package | Purpose | Bundle (gzipped) | Notes |
|---|---|---|---|
| `react-markdown` | Render markdown to React components | ~14 kB | Most widely used React markdown renderer; confirmed React 19 compatible (v10.x) |
| `remark-gfm` | GFM support (tables, strikethrough, task lists) | ~5 kB | Plugin for react-markdown |
| `@tailwindcss/typography` | `prose` class for styled rendered output | 0 kB runtime (Tailwind plugin) | Already available in the Tailwind ecosystem; renders beautiful markdown with one class |

Why not a WYSIWYG editor:
- The modal context is small — a toolbar eats precious vertical space.
- The user base (~10 D&D players) already writes Discord markdown daily.
- Raw markdown is directly compatible with Discord notifications (no conversion layer).
- If users later want formatting buttons, `@uiw/react-md-editor` is a drop-in upgrade (same raw markdown storage).

Alternatives evaluated and deferred:
- `@uiw/react-md-editor` (~5 kB gzipped): Split-pane editor with toolbar. Good if users want buttons, but overkill for v1. Easy upgrade path.
- Milkdown (~40 kB+ gzipped): True WYSIWYG on ProseMirror. High setup complexity, overkill for option notes.

### Ranked Choice Results Animation

No new libraries required:
- **Framer Motion** (`motion` v12.x, already installed): `AnimatePresence` + `layout` + `staggerChildren` handles the round-by-round elimination reveal.
- **Optional nice-to-have:** `canvas-confetti` (~3 kB) for a winner celebration effect. Not a hard dependency.

### Drag-and-Drop (Ranked Choice Voting UI + Embedded Poll Reordering)

The ranked-choice voting UI and embedded poll reordering both need draggable reorderable lists. Evaluate during implementation:
- `@dnd-kit/core` + `@dnd-kit/sortable`: Most popular React DnD library, accessible, works with Framer Motion. Recommended.
- Native HTML drag-and-drop: Simpler but worse mobile/touch UX and accessibility.

Current repo note: `@dnd-kit/*` is not currently in `web/package.json`; add it explicitly when this work starts.

## Edge Case Reference Table

| Event | Votes | Notifications | Discord |
|---|---|---|---|
| Scheduler deleted | Delete all embedded poll docs + votes | Emit `POLL_DELETED` (existing); auto-clear all basic poll notifications for that scheduler | Delete/update Discord cards to "REMOVED" |
| Scheduler cancelled | No deletes; write blocked by rules + UI | Emit `POLL_CANCELLED` (existing) | Update scheduler card; embedded poll cards show "Closed" |
| Scheduler finalized | No deletes; scheduler slot voting closes; embedded voting follows each embedded poll status | Emit `POLL_FINALIZED` (existing) + `BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES` if applicable | Update scheduler card; post embedded poll results summaries |
| Scheduler reopened | No changes | Emit `POLL_REOPENED` (existing); clear `POLL_FINALIZED` notices | Update scheduler card back to open; embedded polls keep independent status |
| Scheduler cloned | Clone poll structure; votes follow clone setting | No extra notifications needed | New cards posted for new scheduler's embedded polls |
| Embedded poll added | None | If required: emit `BASIC_POLL_REQUIRED_CHANGED` to missing voters (server-side callable) | Post new Discord card |
| Embedded poll removed | Delete poll doc + votes | Emit `BASIC_POLL_REMOVED`; auto-clear related notices | Update card to "REMOVED" or delete |
| Embedded poll: optional→required | No deletes | Emit `BASIC_POLL_REQUIRED_CHANGED` (server-side callable with missing voter computation) | No Discord change needed |
| Embedded poll: required→optional | No deletes | Auto-clear "incomplete" notices | No Discord change needed |
| Participant added | None | They see existing embedded polls; no notification | N/A |
| Participant removed | Delete their embedded poll votes | Emit `POLL_INVITE_REVOKED` (existing); auto-clear their basic poll notices | N/A |
| `questingGroupId` changed | Delete votes from users only eligible via old group (not in `participantIds`) | Notify affected users | Treat embedded poll Discord messages as "moved" |
| Link sharing disabled | No deletes (existing participants remain) | None | N/A |
| Group member removed/leaves | Delete their votes from all embedded polls for schedulers linked to that group | Extend `removeGroupMemberFromPolls` to cover embedded basic poll votes | N/A |
| Group deleted | Delete all group-linked basic polls + votes via recursive delete callable | Emit `GROUP_DELETED` (existing) | N/A |
| User deleted | Delete their votes everywhere (extend `deleteUserAccount` for basic poll votes) | Existing cleanup applies | Clean up vote sessions |
| Basic poll (standalone) deleted | Delete poll doc + all vote docs | Emit `BASIC_POLL_REMOVED` | Update/delete Discord card |
| Group member removed (Mode A) | Delete their votes from `questingGroups/{gId}/basicPolls/*/votes/{uid}` | None (group removal notification covers it) | N/A |
| Standalone poll created (Discord) | None | Emit `BASIC_POLL_CREATED` to group members | Post poll card with Vote + Finalize buttons |
| Standalone poll created (web) | None | Emit `BASIC_POLL_CREATED` to group members | Post poll card via Firestore trigger (if Discord linked) |
| Standalone poll finalized (web) | No vote changes | Emit `BASIC_POLL_FINALIZED` + `BASIC_POLL_RESULTS` | Update poll card to finalized state; post results message via trigger |
| Standalone poll finalized (Discord) | No vote changes | Emit `BASIC_POLL_FINALIZED` + `BASIC_POLL_RESULTS` | Update poll card to finalized state; post results message inline |
| Standalone poll reopened | No vote changes | Emit `BASIC_POLL_REOPENED`; clear finalized notices | Update poll card back to "Open" with Vote + Finalize buttons |
| Session poll finalized (with embedded polls) | No vote changes | Emit `POLL_FINALIZED` (existing) | Post session results AND all embedded poll results summaries |
| Ranked-choice tie at final round | No vote changes | Include tie info in `BASIC_POLL_RESULTS` | Discord Finalize button → ephemeral error directing to web |
| Ranked-choice tie resolved (web) | No vote changes | Emit `BASIC_POLL_FINALIZED` + `BASIC_POLL_RESULTS` | Update poll card; post results with "tie broken by @creator" |
| `voteType` changed on poll with votes | Require vote reset (delete all vote docs) | Emit `BASIC_POLL_RESET` | Update Discord card to show "votes reset" |
| Poll edited on web (title, options) | No vote changes (unless unsafe edit triggers reset) | None | Update Discord card via Firestore trigger sync hash |
| Session poll created (Discord) | None | Emit `POLL_CREATED` to group members | Post scheduler poll card; ephemeral confirmation with Edit on Web link |
| Session poll created (Discord) → Edit on Web | None | None (already emitted on create) | Poll card already posted; web edit page loads existing data |
| Discord channel unlinked | No data changes | None | Poll cards (basic + session) remain in channel but become stale (no further syncing) |

## Open Questions (For Product Decision)
1. For group-linked polls, do we need an explicit "invitee subset" (within the group) or is "all members can vote" sufficient for v1?
2. For embedded polls marked `required`, do you want hard enforcement (server-side) immediately, or is a UI-only gate acceptable for v1?
3. For ranked-choice polls, should partial rankings be allowed by default, or should we require voters to rank all options? (Recommendation: allow partial — it's less friction and standard in most IRV implementations.)
4. For ranked-choice tie at the final round, should the creator pick the winner manually, or should we use backward tie-breaking all the way down? (Recommendation: declare tie + let creator pick — keeps the creator in control and avoids algorithmic surprises.)
5. For option notes, should there be a max character/size limit? (Recommendation: 2000 chars — enough for a paragraph or two, fits in a Firestore doc without bloating the options array, and matches Discord's message size conventions.)
6. For the IRV reveal animation, should it auto-play on page load or require a user action to start? (Recommendation: require a "Reveal results" button click — avoids spoiling the result for users who want to see it unfold.)
