# Unified Notification Overhaul

## Summary
Design a unified notification system that covers in-app, email, and Discord delivery, supports automatic clearing of stale notifications, and reconciles notifications for users who create accounts after being invited. The system centralizes notification creation and routing so feature code only emits high-level events.

## Goals
- One event model for all notification channels (in-app, email, Discord).
- Automatic clearing of notifications when they become stale or invalid.
- Support for users invited before account creation (friend/group/poll invites).
- Real-time updates in the UI without page refresh (optional but supported).
- Simple, extensible API for feature code (emit events, not channel logic).
- Centralize business rules (recipient selection, filtering, dedupe, clearing).

## Naming Convention: POLL vs SESSION
The codebase currently mixes `POLL_*` and `SESSION_*` terminology. This design standardizes on `POLL_*` for all event types since "poll" better describes the voting/scheduling phase, while "session" refers to the finalized game session.

**Migration required:** Existing notification types in the current codebase include `FRIEND_REQUEST`, `FRIEND_ACCEPTED`, `GROUP_INVITE`, `GROUP_INVITE_ACCEPTED`, `GROUP_MEMBER_CHANGE`, `POLL_INVITE`, `SESSION_INVITE`, `SESSION_JOINED`, and `SESSION_FINALIZED`. These must be aliased to the new `*_SENT`/`*_ACCEPTED`/`*_DECLINED` and `POLL_*` equivalents during migration. The router should accept both during the transition period, and the UI must render both legacy + new types until migration is complete.

## Non-goals (initial)
- Push notifications (mobile) or SMS.
- Complex multi-tenant notification routing.
- Full audit/history UI (can be added later).

## Current State (abridged)
- In-app notifications are stored under `users/{uid}/notifications` with a handful of types.
- Email is sent by writing to the `mail` collection (Firestore Send Email extension).
- Discord alerts are sent from Cloud Functions triggers or callables.
- Notification logic is scattered across web and functions; some actions are only client-side.

## Proposed Architecture

### 0) Notification Settings Overhaul (Simple + Advanced)
Add a two-mode notification settings panel modeled after the existing session defaults (simple vs fine-grained).

**Simple mode**
- Single toggle: `Email notifications` (on/off).
- Intended behavior: turns email delivery on/off for all eligible events, while in-app notifications remain on for default actionability tiers.
- Defaults should favor actionable items; see “Actionability + Importance” below.

**Advanced mode**
- Per-event delivery selector with three options:
  - `Muted`
  - `In-app`
  - `In-app + Email`
- Applies to all personal notifications (poll lifecycle, friend requests, group invites, reminders).
- Discord notifications are *not* controlled here; they remain in Questing Group settings and apply to group-linked polls.

**Data model (proposed)**
```
users/{uid}.settings.notificationMode = "simple" | "advanced"
users/{uid}.settings.emailNotifications = true | false  // simple mode
users/{uid}.settings.notificationPreferences = {
  POLL_INVITE_SENT: "inApp" | "inApp+Email" | "muted",
  VOTE_SUBMITTED: "inApp" | "inApp+Email" | "muted",
  POLL_FINALIZED: "inApp" | "inApp+Email" | "muted",
  SLOT_CHANGED: "inApp" | "inApp+Email" | "muted",
  POLL_REOPENED: "inApp" | "inApp+Email" | "muted",
  POLL_CANCELLED: "inApp" | "inApp+Email" | "muted",
  FRIEND_REQUEST_SENT: "inApp" | "inApp+Email" | "muted",
  GROUP_INVITE_SENT: "inApp" | "inApp+Email" | "muted",
  ...
}
```

**Routing rule behavior**
- If `notificationMode = simple`, use `emailNotifications` for email gating and default to in-app for supported events.
- If `notificationMode = advanced`, per-event preferences drive channel selection.
- Discord delivery remains governed by questing group settings; do not override with personal settings.
- If a user has invite notifications disabled, do not send invite emails (same as simple mode email off).

**UI notes**
- Use a “Simple” toggle and a “Advanced” panel, similar to the existing session defaults UI.
- Advanced panel can be grouped (Polls, Social, Reminders).
- Keep event keys aligned with `eventType` for easy routing rules.

**Actionability + Importance**
All notifications are classified into:
- **Actionable** (user should do something)
- **Informative** (FYI)

Each also has an importance: **HIGH**, **MED**, **LOW**.

Defaults in **Simple mode**:
- Enable **HIGH + MED Actionable** notifications.
- Enable **HIGH Informative** notifications.
- Disable **LOW Actionable** and **MED/LOW Informative** by default.

Advanced mode exposes all categories.

**Default classification (proposed)**
- Actionable HIGH (default ON in simple mode)
  - `POLL_INVITE_SENT` (recipient must accept/decline)
  - `GROUP_INVITE_SENT` (recipient must accept/decline)
  - `FRIEND_REQUEST_SENT` (recipient must accept/decline)
  - `POLL_READY_TO_FINALIZE` (creator should finalize)
- Actionable MED (default ON in simple mode)
  - `POLL_REOPENED` (participants should re-vote)
  - `SLOT_CHANGED` (participants should review votes)
  - `VOTE_REMINDER` (participant should vote) [rate-limited]
- Actionable LOW (default OFF)
  - `DISCORD_NUDGE_SENT` (creator-initiated info, not required)
- Informative HIGH (default ON in simple mode)
  - `POLL_FINALIZED` (participants should know schedule)
  - `POLL_CANCELLED` (participants should know cancellation)
  - `POLL_DELETED` (participants should know removal; short TTL)
  - `GROUP_MEMBER_REMOVED` (member kicked from group)
  - `GROUP_DELETED` (group no longer exists)
- Informative MED (default OFF)
  - `VOTE_SUBMITTED` (activity noise unless creator prefers)
  - `POLL_ALL_VOTES_IN` (participant opt-in)
  - `POLL_INVITE_ACCEPTED` (creator FYI)
  - `POLL_INVITE_DECLINED` (creator FYI)
  - `POLL_RESTORED` (FYI)
  - `GROUP_INVITE_ACCEPTED` (group owner FYI)
  - `FRIEND_REQUEST_ACCEPTED` (requester FYI)
- Informative LOW (default OFF)
  - `GROUP_MEMBER_LEFT` (owner FYI when member leaves voluntarily)
  - `POLL_INVITE_REVOKED` (FYI that invite was withdrawn)

Notes:
- `POLL_READY_TO_FINALIZE` is derived when a poll is open, not finalized/cancelled, and all required participants have submitted votes (or explicitly marked unavailable). "Required" means accepted/active participants (exclude pending invites that have not accepted; treat declined invites as non-required).
- When `POLL_READY_TO_FINALIZE` fires, an optional participant-facing `POLL_ALL_VOTES_IN` notification may be emitted for opt-in users.
- Auto-clear updates must be chunked to respect Firestore batch limits (500 writes per batch).
- Creator/participant context matters; routing rules should be role-aware.
- These defaults are intended for Simple mode; Advanced mode can override any event.

### 1) Notification Events (single source of truth)
A single "Notification Event" is emitted whenever something important happens (poll created, vote submitted, poll finalized, invite sent, etc.).

Events are stored in a central collection:
```
notificationEvents/{eventId}
```
`notificationEvents` should be server-only (no client reads) to protect payload data.
Writes should be server-only via Cloud Functions (preferred: callable `emitNotificationEvent`). If direct client writes are allowed during migration, enforce Firestore rules that `request.auth.uid == actor.uid`, `source == "web"`, `eventType` is allowlisted, and status/error fields are immutable.
Each event includes:
- `eventType`: string (ex: `POLL_INVITE_SENT`, `VOTE_SUBMITTED`, `POLL_FINALIZED`)
- `createdAt`, `createdBy` (uid/email), `source` (web, functions, discord)
- `resource`: `{ type: "poll"|"group"|"friend"|"user", id, title }`
- `payload`: event-specific fields (inviter, inviteeEmail, slot info, etc.)
  - **Payload snapshots required:** include any user-visible strings (poll title, group name, actor display name) needed for rendering so the router does not need to fetch deleted resources. The router should not fetch resources for template data; only fetch for recipient resolution if required.
- `channels`: optional override (default routing uses rules)
- `dedupeKey`: optional (ex: `poll:${pollId}:vote`) for coalescing
- `status`: `queued|processing|processed|partial|failed` with `error` for visibility

This is the only write features should do to trigger notifications.

### 2) Central Notification Router (Cloud Functions)
A single router function (or a small set) processes `notificationEvents` and emits:
- In-app notifications: `users/{uid}/notifications/{notificationId}`
- Email: `mail` collection writes
- Discord: message creation via bot

The router handles:
- Recipient resolution (by uid, by email, by group membership)
- Channel routing rules (e.g., Discord only for questing groups with bot linked)
- Filtering (user preferences, block lists, settings)
- Dedupe (avoid duplicates across events)
- Auto-clear mappings (insert “clear” actions for existing notifications)
- Preference resolution (simple vs advanced settings)
- **Client-originated events must be validated** (actor must match auth; event type must be allowed). Prefer a callable for complex validation, or strict Firestore rules if allowing direct writes.

### 3) In-app Notification Storage
Keep `users/{uid}/notifications/{notificationId}` as the UI source of truth.

Suggested fields:
- `type`: string (same as eventType or a UI subtype)
- `title`, `body`, `actionUrl`
- `read`, `dismissed`, `createdAt`
- `autoCleared`: boolean
- `resource`: `{ type, id }`
- `actor`: `{ uid, email, displayName }`
- `autoClear`: `{ when: [conditions], supersedes: [notificationIds or dedupeKey] }`
- `dedupeKey`: matches event-level dedupeKey

### 4) Auto-Clearing Engine
Auto-clearing is handled by the router when it processes events. For each event, it can:
- Create new notifications
- Dismiss stale notifications based on rules (set `dismissed: true`) and mark them `autoCleared: true` so they disappear from the drawer

Rules are centralized in a map:
```
notificationRules.ts
- eventType -> {
    inApp: {...},
    email: {...},
    discord: {...},
    autoClear: {...}
  }
```
**Complete auto-clear rules:**

Poll lifecycle:
- `POLL_FINALIZED` clears:
  - `POLL_INVITE_SENT`, `VOTE_REMINDER`, `SLOT_CHANGED`, `POLL_REOPENED`, `POLL_READY_TO_FINALIZE` for that poll (all participants)
- `POLL_REOPENED` clears:
  - `POLL_FINALIZED` for that poll (all participants)
- `POLL_CANCELLED` clears:
  - `POLL_INVITE_SENT`, `VOTE_REMINDER`, `SLOT_CHANGED`, `POLL_FINALIZED`, `POLL_REOPENED`, `POLL_READY_TO_FINALIZE` for that poll (all participants)
- `POLL_DELETED` clears:
  - All poll-related notifications for that poll (all participants)
- `VOTE_SUBMITTED` clears:
  - `VOTE_REMINDER` for that poll (voter only)

Invite acceptance/decline (per-user clearing):
- `POLL_INVITE_ACCEPTED` clears:
  - `POLL_INVITE_SENT` for that poll (accepting user only)
- `POLL_INVITE_DECLINED` clears:
  - `POLL_INVITE_SENT` for that poll (declining user only)
- `POLL_INVITE_REVOKED` clears:
  - `POLL_INVITE_SENT` for that poll (revoked user only)
- `FRIEND_REQUEST_ACCEPTED` clears:
  - `FRIEND_REQUEST_SENT` for that request (recipient only)
- `FRIEND_REQUEST_DECLINED` clears:
  - `FRIEND_REQUEST_SENT` for that request (recipient only)
- `GROUP_INVITE_ACCEPTED` clears:
  - `GROUP_INVITE_SENT` for that group (accepting user only)
- `GROUP_INVITE_DECLINED` clears:
  - `GROUP_INVITE_SENT` for that group (declining user only)

Group lifecycle:
- `GROUP_DELETED` clears:
  - `GROUP_INVITE_SENT`, `GROUP_INVITE_ACCEPTED` for that group (all affected users)

Auto-clear can be implemented as a batch update against notification collectionGroup queries with `resource.id == resourceId` + `type in [...]`. For per-user clears, add `userId` to the query.

### 5) Handling Pre-Account Invites
For invite flows that target email before account creation:
- The event payload can include `recipientEmail` for routing, but avoid storing raw emails in `pendingNotifications`.
- Router attempts to resolve to existing user ID. If not found:
  - Store a "pending recipient" record:
    `pendingNotifications/{emailHash}/events/{eventId}`
- `emailHash` should be SHA-256 of `normalizeEmail(email)` (trim + lowercase) to reduce PII exposure.
- On user creation and first login, reconcile (Auth onCreate or user doc onCreate; plus a callable on first login to catch any missed cases):
  - Resolve email -> uid, then materialize in-app notifications
  - Mark pending items as processed

This unifies friend, group, and poll invites for pre-account users.

### 6) Real-time UI (optional but supported)
Keep the existing real-time listener on `users/{uid}/notifications` in the web app.
The router writes in-app notifications server-side, so the UI updates live without refresh.

## Event Types and Routing (complete)

### Poll Lifecycle Events
| Event | Recipients | In-App | Email | Discord |
|-------|-----------|--------|-------|---------|
| `POLL_CREATED` | Creator (confirmation) | Optional | No | Yes (posts poll card) |
| `POLL_INVITE_SENT` | Invitee | Yes | Gated | No |
| `POLL_INVITE_ACCEPTED` | Creator | Yes | Gated | No |
| `POLL_INVITE_DECLINED` | Creator | Yes | Gated | No |
| `POLL_INVITE_REVOKED` | Former invitee | Yes | No | No |
| `VOTE_SUBMITTED` | Creator | Yes | Gated | Gated (group setting) |
| `VOTE_REMINDER` | Non-voters | Yes | Gated | No (use nudge) |
| `POLL_READY_TO_FINALIZE` | Creator | Yes | Gated | Gated (group setting) |
| `POLL_ALL_VOTES_IN` | Participants (opt-in) | Yes | No | No |
| `POLL_FINALIZED` | All participants | Yes | Gated | Gated (group setting) |
| `POLL_REOPENED` | All participants | Yes | Gated | Gated (group setting) |
| `POLL_CANCELLED` | All participants | Yes | Gated | Gated (group setting) |
| `POLL_RESTORED` | All participants | Yes | No | No |
| `POLL_DELETED` | All participants | Yes (short TTL) | No | Yes (updates embed) |
| `SLOT_CHANGED` | All participants | Yes | Gated | Gated (group setting) |
| `DISCORD_NUDGE_SENT` | Non-voters (Discord) | No | No | Yes (rate-limited) |

**Gated = subject to notification settings (simple/advanced preferences + email toggle).** If invite notifications are muted, no invite emails are sent.

### Social Events
| Event | Recipients | In-App | Email | Discord |
|-------|-----------|--------|-------|---------|
| `FRIEND_REQUEST_SENT` | Target user | Yes | Gated | No |
| `FRIEND_REQUEST_ACCEPTED` | Requester | Yes | Gated | No |
| `FRIEND_REQUEST_DECLINED` | — | — (clears only) | No | No |
| `FRIEND_REMOVED` | — | No (silent) | No | No |
| `GROUP_INVITE_SENT` | Invitee | Yes | Gated | No |
| `GROUP_INVITE_ACCEPTED` | Inviter/owner | Yes | Gated | No |
| `GROUP_INVITE_DECLINED` | — | — (clears only) | No | No |
| `GROUP_MEMBER_REMOVED` | Removed member | Yes | No | No |
| `GROUP_MEMBER_LEFT` | Owner (FYI) | Yes | No | No |
| `GROUP_DELETED` | All members | Yes | No | No |

### Discord-Specific Routing
Discord notifications are controlled at the **questing group level**, not user level:
- `questingGroups/{groupId}.discord.notifications.voteSubmitted` (default: false)
- `questingGroups/{groupId}.discord.notifications.allVotesIn` (default: false)
- `questingGroups/{groupId}.discord.notifications.slotChanges` (default: true)
- `questingGroups/{groupId}.discord.notifications.finalizationEvents` (default: true)

The router checks:
1. Is the poll linked to a questing group? (`scheduler.questingGroupId`)
2. Is that group linked to Discord? (`questingGroup.discord.channelId` and `guildId` exist)
3. Is the specific notification type enabled in group settings?
4. For mentions: use `questingGroup.discord.notifyRoleId` ("none" | "everyone" | role ID)

### Rate Limiting
| Event | Limit | Scope |
|-------|-------|-------|
| `DISCORD_NUDGE_SENT` | 8 hours cooldown | Per poll |
| `VOTE_REMINDER` | 1 per day | Per user per poll |

Rate limit state is stored in:
- `schedulers/{pollId}.discord.nudgeLastSentAt` (Discord nudge)
- Per-recipient vote reminder state (preferred). If using `notificationEvents` dedupeKey, ensure TTL is configured and not relied on for strict timing.

## API for Feature Code (simple and centralized)
Provide a single helper:
```
emitNotificationEvent({
  eventType,
  resource,
  actor,
  payload,
  channels, // optional override
  dedupeKey, // optional for coalescing
  recipients, // optional explicit list; otherwise derived from rules
});
```
Feature code should only call this helper, not send email or Discord directly.

### Coalescing & Deduplication
Use `dedupeKey` to prevent duplicate notifications and optionally coalesce rapid events:

| Pattern | Purpose |
|---------|---------|
| `poll:${pollId}:invite:${email}` | One invite notification per user per poll |
| `poll:${pollId}:vote:${voterId}` | Latest vote supersedes prior vote notifications |
| `friend:${requestId}` | One friend request notification per request |
| `group:${groupId}:invite:${email}` | One group invite per user per group |

**Coalescing window:** For high-frequency events (e.g., rapid slot changes), batching within a time window requires a delayed processor (Cloud Tasks or a scheduled sweeper). Initial scope should process immediately and use `dedupeKey` to suppress duplicates; defer Cloud Tasks unless volume demands it.

### Recipient Filtering
The router applies these filters before delivery:
1. **Block list:** Skip if recipient has blocked the actor
2. **User exists:** For in-app, user must have an account (or use pending queue)
3. **Preferences:** Check user's notification preferences (simple/advanced mode)
4. **Self-send:** Never notify user of their own actions
5. **Group membership:** For group events, verify user is still a member
6. **Poll participation:** For poll events, verify user is still a participant

## Data Model (proposed)

`notificationEvents/{eventId}`
- `eventType`
- `resource` `{ type, id, title }`
- `actor` `{ uid, email, displayName }`
- `payload` `{ ... }`
- `dedupeKey`
- `createdAt`, `createdBy`
- `expiresAt` (optional; Firestore TTL target, e.g. 90 days after `createdAt`)
- `source`
- `status` + `error`
- `attempts`, `nextRetryAt`

`users/{uid}/notifications/{notificationId}`
- `type`
- `title`, `body`, `actionUrl`
- `read`, `dismissed`, `createdAt`
- `autoCleared`
- `resource` `{ type, id }`
- `actor` `{ uid, email, displayName }`
- `dedupeKey`

`pendingNotifications/{emailHash}/events/{eventId}`
- `emailHash` (doc id; SHA-256 of normalized email)
- `eventType`
- `payload`
- `createdAt`

## Error Handling & Retries

### Event Processing States
- `queued`: Event created, awaiting processing
- `processing`: Router is actively handling the event
- `processed`: All channels succeeded
- `partial`: Some channels succeeded, others failed
- `failed`: All channels failed

### Retry Strategy
- **In-app notifications:** No retry (Firestore writes are reliable)
- **Email:** Retry up to 3 times with exponential backoff (1s, 5s, 30s)
- **Discord:** Retry up to 2 times with 2s delay; if bot is disconnected, mark event `partial`, log error, and skip further retries

### Partial Failure Handling
If email fails but in-app succeeds:
1. Mark event as `partial` with `error: { email: "reason" }`
2. Do not retry in-app (already succeeded)
3. Retry email according to strategy
4. After max retries, leave as `partial` for monitoring

### Monitoring
- Alert on events stuck in `queued` for > 1 minute
- Track `partial` and `failed` rates per event type
- Dashboard for event processing latency

## Retention
- Dismissed in-app notifications should be deleted after 20 days (scheduled cleanup or Firestore TTL).
- `notificationEvents` should expire via Firestore TTL using `expiresAt` (default 90 days).

## Template Management

### Template Structure
Templates live in `functions/src/notifications/templates/`:
```
templates/
  inApp/
    POLL_INVITE_SENT.js
    POLL_FINALIZED.js
    ...
  email/
    POLL_INVITE_SENT.js  // exports { subject, text, html }
    POLL_FINALIZED.js
    ...
```

Each template exports a function: `(event, recipient) => { title, body, actionUrl }` for in-app, or `{ subject, text, html }` for email.

### Template Variables
Templates receive the full event payload plus resolved recipient data:
- `actor`: `{ uid, displayName, email }`
- `resource`: `{ type, id, title }`
- `recipient`: `{ uid, displayName, email }`
- `payload`: event-specific fields

### Adding a New Notification Type
1. Add event type to `NOTIFICATION_EVENTS` enum
2. Create templates in `templates/inApp/` and `templates/email/`
3. Add routing rule in `notificationRules.ts`
4. Add auto-clear rules if applicable
5. Add to actionability classification
6. Update Settings UI if user-configurable
7. Write tests for routing and template rendering

## Migration Strategy
1) Add router + event collection (keep legacy paths intact).
2) Update UI to render both legacy + new notification types.
3) Update a single flow (ex: poll invite) to emit event instead of direct actions.
4) Validate output equals current behavior.
5) Incrementally move vote, finalize, reopen, slot changes, etc.
6) Remove legacy direct sends once all paths emit events.
7) Deprecate legacy notification type aliases after 2 release cycles.

## Testing Strategy
- Unit tests for routing rules and auto-clear logic.
- Integration tests: emit event -> verify in-app + email + discord outputs.
- Emulator E2E for poll flow (create, invite, vote, finalize, reopen).
- Rules tests for new collections (notificationEvents, pendingNotifications).

## Edge Cases

### User Account Lifecycle
- **Account deleted:** Clear all pending notifications for that user; do not send new ones
- **Account banned:** Treat as deleted for notification purposes
- **Email changed:** Update `pendingNotifications` email hash on email change

### Resource Lifecycle
- **Poll deleted while invites pending:** `POLL_DELETED` event triggers auto-clear of all related notifications
- **Group deleted while invites pending:** `GROUP_DELETED` event triggers auto-clear
- **Creator leaves/is removed from poll:** Transfer ownership or cancel poll (separate feature)

### Timing Edge Cases
- **Vote submitted after finalization:** Ignore (poll is closed)
- **Invite sent to existing participant:** Ignore (already participating)
- **Friend request to existing friend:** Ignore (already friends)

## Open Questions
- **History preservation:** Do we want to preserve notification history for analytics? (Recommend: yes, in a separate `notificationHistory` collection, not user subcollection)
- **Batch notifications:** Should we offer daily/weekly digest emails as an alternative to per-event emails? (Future consideration)
- **Discord embed updates:** For `POLL_DELETED`, do we need to store Discord message IDs to edit/remove existing embeds?
- **Block list storage:** Confirm canonical block list location and router access patterns.
- **Email templates:** Are there existing templates to consolidate, or is `functions/src/notifications/templates/` new?

## Suggested Next Steps
1. Confirm event list + naming consistency + routing rules (this document)
2. Define Firestore security rules for `notificationEvents` and `pendingNotifications` (server-only writes, allowlisted event types)
3. Implement callable `emitNotificationEvent` helper in functions (and a thin web wrapper to call it)
4. Ship UI support for both legacy + new notification types before enabling the router
5. Build router function with initial rule set + legacy alias acceptance
6. Port email/in-app templates to a centralized template module
7. Add retention policy (`expiresAt` + Firestore TTL) for `notificationEvents`
8. Migrate poll invite flow end-to-end
9. Migrate remaining flows incrementally
10. Build notification settings UI (simple/advanced toggle)
11. Remove legacy direct notification sends after validation

## Appendix: Current vs New Type Mapping

| Current Code | New Event Type | Notes |
|--------------|---------------|-------|
| `FRIEND_REQUEST` | `FRIEND_REQUEST_SENT` | Rename for consistency |
| `FRIEND_ACCEPTED` | `FRIEND_REQUEST_ACCEPTED` | Rename for consistency |
| `POLL_INVITE` | `POLL_INVITE_SENT` | Rename for consistency |
| `SESSION_INVITE` | `POLL_INVITE_SENT` | Alias during migration |
| `SESSION_JOINED` | `POLL_INVITE_ACCEPTED` | Rename; clarify meaning |
| `SESSION_FINALIZED` | `POLL_FINALIZED` | Rename for consistency |
| `VOTE_SUBMITTED` | `VOTE_SUBMITTED` | Keep as-is |
| `VOTE_REMINDER` | `VOTE_REMINDER` | Keep as-is |
| `GROUP_INVITE` | `GROUP_INVITE_SENT` | Rename for consistency |
| `GROUP_INVITE_ACCEPTED` | `GROUP_INVITE_ACCEPTED` | Keep as-is |
| `GROUP_MEMBER_CHANGE` | `GROUP_MEMBER_REMOVED` / `GROUP_MEMBER_LEFT` | Split by `metadata.action` |
