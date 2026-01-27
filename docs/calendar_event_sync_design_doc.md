# Calendar Event Synchronization Design Doc

## Summary
Enable bidirectional synchronization between finalized Quest Scheduler polls and their linked Google Calendar events. When a linked calendar event is moved or its time/duration changes, the poll should enter a **Rescheduled** state (treated as a new winning slot), hide participant/vote details, and notify participants. If the event returns to its original time, the poll should restore its original winning slot and participant/vote state. If the calendar event is deleted, the poll should be marked **Cancelled**. Poll creators should also be able to cancel any poll manually and re-finalize later (creating a new calendar event).

## Goals
- Detect calendar event changes and update the poll deterministically.
- Rescheduled polls behave like a finalized poll with a new winning time, but show a **Rescheduled** label and hide participants/votes.
- Restoring the event to the original time restores participants and votes.
- Deleting the calendar event marks the poll as **Cancelled**.
- Add a general **Cancelled** poll state (manual or calendar-driven) and display it clearly in the Session Calendar.
- Trigger in-app and Discord notifications on reschedule/restore/cancel transitions.

## Non-Goals
- Full two-way sync of all event fields (title/description/attendees).
- Syncing non-finalized polls to calendar changes (only finalized polls with a linked event).
- Supporting non-creator calendar accounts without explicit linking and permissions.
- Handling recurring events (only single-instance events are supported).

## Current Behavior (Baseline)
- Finalizing a poll can create a Google Calendar event via `googleCalendarFinalizePoll` (`functions/src/legacy.js:572`).
- The poll stores `googleEventId` and `googleCalendarId` but does not listen for event changes.
- Reopen/edit/delete actions can optionally delete the linked calendar event.
- Poll status values are currently `OPEN`, `FINALIZED`, `ARCHIVED`.
- OAuth scopes include `calendar.events` which is sufficient for both creating events and setting up watches.

## Desired Behavior
1. **Event moved or time changed**
   - Treat as reschedule: create a new slot with the event's new time and mark it as the winning slot.
   - Mark poll as **Rescheduled** (still finalized, but visually distinct).
   - Hide participant/vote lists (display "Rescheduled").
   - Trigger notifications.

2. **Event restored to original time**
   - Restore original winning slot and original participant/vote state.
   - Remove the rescheduled state and rescheduled slot if it was calendar-managed.
   - Trigger notifications.

3. **Event deleted**
   - Mark poll as **Cancelled**.
   - Clear `googleEventId` (calendar link removed).
   - Keep the last finalized slot (if any) but show it as cancelled.
   - Trigger notifications.

4. **Manual cancel by creator**
   - Creator can cancel any poll (OPEN or FINALIZED).
   - If finalized, keep the winning slot but label as cancelled.
   - Allow re-finalization (same or different winning time) which re-creates the calendar event.

## Proposed Data Model Updates

### Scheduler document (new/extended fields)
```js
status: "OPEN" | "FINALIZED" | "CANCELLED" | "ARCHIVED",

calendarSync: {
  state: "OK" | "RESCHEDULED" | "CANCELLED" | "ERROR",
  lastSyncedAt: Timestamp,
  lastEventFingerprint: string,
  baseline: {
    startUtc: string, // ISO
    endUtc: string,   // ISO
    fingerprint: string,
  },
  rescheduled: {
    fromSlotId: string,
    toSlotId: string,
    at: Timestamp,
    snapshotId: string,
  },
  cancelled: {
    at: Timestamp,
    reason: "calendar_deleted" | "manual" | "other",
  },
  error: {
    at: Timestamp,
    code: string, // "token_expired" | "watch_failed" | "sync_failed"
    message: string,
  },
},
```

### Snapshot subcollection
Store the original poll state for restoration (participants + votes) without losing access controls:
```
/schedulers/{schedulerId}/calendarSyncSnapshots/{snapshotId}
  - createdAt: Timestamp
  - expiresAt: Timestamp  // 90 days from creation for cleanup
  - winningSlotId: string
  - participants: string[]
  - pendingInvites: string[]
  - votes: [{ uid, userEmail, userAvatar, votes, noTimesWork, source, lastVotedFrom }]
```

**Cleanup policy**: Snapshots older than 90 days should be deleted by a scheduled Cloud Function. Only the most recent snapshot per scheduler is needed for restore operations.

### Slot metadata
Add a flag to slots created from calendar reschedules:
```
slots/{slotId}
  source: "poll" | "calendar"
  createdBy: "calendar-sync" | null
```

### Event-to-Scheduler Index (NEW)
To efficiently find which scheduler corresponds to a changed calendar event, add a top-level collection:
```
/calendarEventIndex/{eventId}
  - schedulerId: string
  - calendarId: string
  - creatorId: string
  - createdAt: Timestamp
```

This index is created when a poll is finalized with a calendar event and deleted when the event is unlinked.

### Calendar Watch Registry (NEW)
Track active watch channels per user/calendar combination:
```
/calendarWatches/{watchId}
  - channelId: string       // UUID we generate
  - calendarId: string      // e.g., "primary" or calendar email
  - userId: string          // Creator's user ID
  - resourceId: string      // Google-assigned resource ID
  - expiration: Timestamp   // When the watch expires
  - syncToken: string       // For incremental sync
  - lastSyncAt: Timestamp
  - createdAt: Timestamp
  - status: "active" | "expired" | "error"
```

## Calendar Sync Architecture

### High-level approach
- Use **Google Calendar push notifications** to receive real-time updates when events change.
- Maintain a watch per calendar ID (not per event) and use sync tokens to pull incremental updates.
- **Important**: Push notifications are not 100% reliable (Google documentation explicitly states some messages may be dropped). Implement a periodic polling fallback.

### OAuth Scope Requirements
The current OAuth flow requests `https://www.googleapis.com/auth/calendar.events` which provides sufficient access for:
- Creating/updating/deleting events
- Setting up watch channels via `events.watch`
- Listing events with sync tokens

### Components

#### 1. Finalize hook (server-side)
Location: Extend `googleCalendarFinalizePoll` in `functions/src/legacy.js`

When a poll is finalized with calendar creation:
- Store baseline event fingerprint in `calendarSync.baseline`
- Create entry in `calendarEventIndex` collection
- Ensure a calendar watch exists for the selected calendar (create if needed)
- Store initial sync token

#### 2. Webhook endpoint (NEW)
Location: `functions/src/calendar-sync.js`

```
POST /calendarWebhook
```

**Security**: Validate requests using:
- `X-Goog-Channel-ID` header matches a known channel in `calendarWatches`
- `X-Goog-Channel-Token` header matches expected token (stored during watch creation)

Flow:
1. Receives Google Calendar push notification (headers only, no body)
2. Validates channel ID and token
3. Looks up watch metadata by `X-Goog-Channel-ID`
4. Enqueues a Cloud Task to `processCalendarSync` with the calendar/user info
5. Returns 200 immediately (Google expects fast response)

#### 3. Sync worker (NEW)
Location: `functions/src/calendar-sync.js`

Cloud Task: `processCalendarSync`

Flow:
1. Retrieve user's refresh token from `userSecrets`
2. Call `events.list` with stored `syncToken` to get only changed events
3. Handle 410 GONE: clear sync token, perform full sync, store new token
4. For each changed event:
   - Look up scheduler via `calendarEventIndex`
   - If event deleted or status `cancelled`: mark poll cancelled
   - If start/end differ from baseline: trigger reschedule
   - If start/end match baseline and poll is rescheduled: trigger restore
5. Update `calendarSync.lastSyncedAt` and `lastEventFingerprint`
6. Store new sync token

**Sync Token Constraint**: Google's sync tokens are incompatible with `timeMin`/`timeMax` filters. The sync worker must process all changed events in the calendar and filter by our `calendarEventIndex`.

#### 4. Watch renewal scheduler (NEW)
Location: `functions/src/calendar-sync.js`

Scheduled Cloud Function running daily:
1. Query `calendarWatches` for watches expiring within 48 hours
2. For each expiring watch:
   - Stop the old watch via `channels.stop`
   - Create a new watch with fresh channel ID
   - Update `calendarWatches` document
3. Log any failures for monitoring

#### 5. Polling fallback (NEW)
Location: `functions/src/calendar-sync.js`

Scheduled Cloud Function running every 6 hours:
1. Query all schedulers with `status: "FINALIZED"` and `googleEventId != null`
2. Group by `creatorId` to batch API calls
3. For each creator, fetch their calendar events and check for changes
4. Process any changes that were missed by push notifications

This ensures eventual consistency even if push notifications fail.

### Fingerprint definition (time-based only)
Only consider changes that affect time:
```
fingerprint = `${startUtc}|${endUtc}|${allDayFlag}`
```
If the fingerprint changes from baseline, treat as a reschedule.

## Reschedule Flow
1. Create a new slot from the event's start/end times with `source: "calendar"`.
2. Create a snapshot of current poll state in `calendarSyncSnapshots`.
3. Update scheduler atomically:
   - `winningSlotId = newSlotId`
   - `calendarSync.state = "RESCHEDULED"`
   - `calendarSync.rescheduled = { fromSlotId, toSlotId, snapshotId, at }`
4. Trigger notifications (in-app + Discord).
5. UI hides participant/vote details and displays "Rescheduled."

## Restore Flow
1. Event fingerprint returns to baseline.
2. Read snapshot from `calendarSyncSnapshots`.
3. Restore `winningSlotId` to original slot.
4. Delete the calendar-created slot.
5. Update scheduler:
   - `calendarSync.state = "OK"`
   - Clear `calendarSync.rescheduled`
6. Trigger notifications.

Note: Participant/vote data is preserved in the scheduler document throughout; the snapshot is for reference and validation.

## Cancel Flow (Calendar Deletion)
1. When event is deleted (404/410 or status `cancelled`), update scheduler:
   - `status = "CANCELLED"`
   - `calendarSync.state = "CANCELLED"`
   - `calendarSync.cancelled = { at, reason: "calendar_deleted" }`
   - `googleEventId = null`
2. Delete entry from `calendarEventIndex`.
3. Trigger notifications.
4. UI displays cancelled badge and removes calendar link.

## Manual Cancel Flow
- Add a creator-only "Cancel Poll" action.
- For finalized polls, keep the winning slot but show status as cancelled.
- For open polls, lock the poll and show cancelled state.
- Re-finalizing should:
  - set `status = "FINALIZED"`
  - clear `calendarSync.cancelled`
  - create a new calendar event and baseline snapshot
  - create new `calendarEventIndex` entry

## UI/UX Updates

### Status Badge Updates Required
Update status badge rendering in all these locations:

1. **SessionCard.jsx** (`web/src/features/dashboard/components/SessionCard.jsx:146-156`)
   - Add `CANCELLED` badge (red/rose styling)
   - Add `RESCHEDULED` indicator when `calendarSync?.state === "RESCHEDULED"`

2. **DashboardCalendar.jsx** (`web/src/features/dashboard/components/DashboardCalendar.jsx:63,143`)
   - Show cancelled events with strikethrough and muted color
   - Show rescheduled indicator

3. **MobileAgendaView.jsx** (`web/src/features/dashboard/components/MobileAgendaView.jsx:77`)
   - Add `CANCELLED` and `RESCHEDULED` badge variants

4. **SchedulerPage.jsx** (`web/src/features/scheduler/SchedulerPage.jsx:1381-1386`)
   - Add `CANCELLED` badge in header
   - Show reschedule info panel when applicable

### Badge Styling
```jsx
// Cancelled badge
<span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
  Cancelled
</span>

// Rescheduled badge
<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
  Rescheduled
</span>
```

### Session Calendar Styling
- Cancelled events: muted background, strikethrough title, 50% opacity
- Rescheduled events: amber border or indicator icon

### Rescheduled Poll Info Panel
For rescheduled polls, show an info panel on SchedulerPage:
```
⚠️ Calendar Event Updated
The calendar event was moved to a new time. Participant availability is hidden until the event is restored or a new poll is created.

New time: [formatted datetime]
Original time: [formatted datetime]

[Restore Original Time] [Accept New Time]
```

### Error State UI
When `calendarSync.state === "ERROR"`:
- Show warning banner to creator
- "Calendar sync paused. Re-link your calendar in Settings to resume."
- Link to Settings page

## Notifications

### In-app
Add new notification types to `web/src/lib/data/notifications.js`:
- `SESSION_RESCHEDULED` - "Session '[title]' has been rescheduled to [new time]"
- `SESSION_RESTORED` - "Session '[title]' has been restored to its original time"
- `SESSION_CANCELLED` - "Session '[title]' has been cancelled"

### Discord
Update `functions/src/discord/poll-card.js`:

1. **buildPollCard** changes:
   - Add `CANCELLED` and `RESCHEDULED` status handling
   - Show new time for rescheduled polls

2. **Transition notifications** (one-time messages):
   - Reschedule: "@everyone Session '[title]' has been rescheduled to [new time]"
   - Restore: "Session '[title]' has been restored to [original time]"
   - Cancel: "@everyone Session '[title]' has been cancelled"

3. **Sync hash update** (`computeSchedulerSyncHash` in `functions/src/triggers/scheduler.js:41-64`):
   - Include `calendarSync.state` in hash computation
   - This ensures Discord embeds update when sync state changes

## Permissions & Security

### Webhook Validation
All incoming Google Calendar webhooks must be validated:
1. Check `X-Goog-Channel-ID` exists in `calendarWatches` collection
2. Verify `X-Goog-Channel-Token` matches stored token
3. Reject requests that fail validation (return 401)

### Token Management
- Only creator's linked Google Calendar can drive sync
- If refresh token is invalid (401/403 from Google):
  - Set `calendarSync.state = "ERROR"`
  - Set `calendarSync.error = { code: "token_expired", ... }`
  - Stop the calendar watch
  - Surface warning to creator in Settings and poll UI
- When creator re-links calendar, clear error state and re-establish watch

### Firestore Rules Updates
Add rules for new collections:
```
match /calendarEventIndex/{eventId} {
  allow read: if false; // Server-only
  allow write: if false;
}

match /calendarWatches/{watchId} {
  allow read: if false; // Server-only
  allow write: if false;
}

match /schedulers/{schedulerId}/calendarSyncSnapshots/{snapshotId} {
  allow read: if canReadScheduler();  // Same as parent scheduler
  allow write: if false; // Server-only
}
```

## Edge Cases

### Event changed to all-day
Treat as rescheduled (time change). The fingerprint will differ because `allDayFlag` changes.

### Event moved to another calendar
Treat as deletion from our perspective. The old event is removed, and we can't track the new one without the user re-linking.

### Manual poll reopen or edit
Should clear `calendarSync.rescheduled` state and delete any calendar-created slots.

### Multiple rapid calendar edits
Use event `updated` timestamp to apply only the latest change. The sync worker should compare `updated` timestamps and skip processing if we've already processed a newer version.

### Creator unlinks calendar
- Stop the calendar watch
- Set `calendarSync.state = "ERROR"` with `code: "calendar_unlinked"`
- Poll remains in current state but won't receive further updates

### Watch creation fails
- Log error for monitoring
- Poll finalization should still succeed (calendar event created)
- Rely on polling fallback until watch can be established

### Recurring events (NOT SUPPORTED)
If user creates a recurring event from a finalized poll:
- Only the first instance is tracked
- Changes to the series or other instances are not detected
- Document this limitation in user-facing help

### Rate limiting
Google Calendar API limit: 1,000,000 queries/day. Monitor usage and implement exponential backoff for 429 responses.

## Observability

### Logging
Log all state transitions with structured data:
```js
logger.info("Calendar sync: poll rescheduled", {
  schedulerId,
  eventId,
  oldFingerprint,
  newFingerprint,
  userId: creatorId,
});
```

### Metrics to track
- Watch channel creations/renewals/failures per day
- Sync operations per day (push vs polling)
- State transitions (reschedule/restore/cancel) per day
- Error rates by type (token expired, sync failed, etc.)

### Admin/Debug Tools
- Add `calendarSync.lastSyncedAt` visibility in admin console
- Add ability to manually trigger sync for a specific scheduler
- Add watch health dashboard showing expiring/errored watches

## Migration Plan

### Phase 1: Data model
1. Deploy new Firestore collections (calendarEventIndex, calendarWatches)
2. Update Firestore rules
3. Backfill `calendarEventIndex` for existing finalized polls with `googleEventId`

### Phase 2: Backend
1. Deploy webhook endpoint (inactive)
2. Deploy sync worker (inactive)
3. Deploy watch renewal scheduler
4. Deploy polling fallback

### Phase 3: Activate sync
1. Enable webhook endpoint
2. Create watches for existing calendars with finalized polls
3. Monitor for issues

### Phase 4: Frontend
1. Deploy UI updates for CANCELLED/RESCHEDULED states
2. Add manual cancel action for creators
3. Add error state UI

## Open Questions (Resolved)

1. **Should rescheduled polls keep access control from original participants even if they're hidden?**
   - **Answer: Yes.** Access control remains unchanged; only the display is affected.

2. **Should title/description changes trigger updates?**
   - **Answer: No.** Only time-based changes trigger reschedule to minimize noise.

3. **When rescheduling, should we always delete the calendar-created slot on restore?**
   - **Answer: Yes.** Clean up calendar-created slots on restore to avoid clutter.

## Appendix: Google Calendar API Reference

### Events: watch
```
POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/watch

Request body:
{
  "id": "unique-channel-id",
  "type": "web_hook",
  "address": "https://questscheduler.cc/api/calendarWebhook",
  "token": "secret-validation-token",
  "params": {
    "ttl": "604800"  // 7 days in seconds
  }
}

Response:
{
  "kind": "api#channel",
  "id": "unique-channel-id",
  "resourceId": "google-assigned-resource-id",
  "resourceUri": "...",
  "expiration": "1706400000000"  // Unix ms
}
```

### Push notification headers
```
X-Goog-Channel-ID: unique-channel-id
X-Goog-Channel-Token: secret-validation-token
X-Goog-Resource-ID: google-assigned-resource-id
X-Goog-Resource-State: sync | exists | not_exists
X-Goog-Message-Number: 1
```

Note: Push notifications have **no request body**. They only signal that something changed; you must call `events.list` with a sync token to get actual changes.

### Events: list with syncToken
```
GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?syncToken={token}

Response includes nextSyncToken for subsequent requests.
On 410 GONE, perform full sync without syncToken.
```

Sources:
- [Push notifications | Google Calendar](https://developers.google.com/workspace/calendar/api/guides/push)
- [Events: watch | Google Calendar](https://developers.google.com/workspace/calendar/api/v3/reference/events/watch)
- [Synchronize resources efficiently | Google Calendar](https://developers.google.com/workspace/calendar/api/guides/sync)
