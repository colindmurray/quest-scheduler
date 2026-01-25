# Discord Bot Feature - Implementation Task List

This task list is derived from the [Discord Bot Feature Design Doc](./discord-bot-feature-design-doc.md) and organized by priority and implementation sequence.

## Priority Legend
- **P0**: MVP Essential - Required for a working end-to-end experience
- **P1**: Important Post-MVP - High impact, should complete before wider release
- **P2**: Important Post-MVP - Valuable but slightly less critical than P1
- **P3**: Low Priority - Tech debt / code health improvements
- **P4**: Very Low Priority - Nice-to-have enhancements
- **P5**: Optional / Future - Can drop or defer indefinitely
- **Status**: `[ ]` not started, `[x]` completed and validated

---

## Section 1: MVP Essentials (P0)

Everything needed to get a fully working end-to-end experience that users can use immediately.

### 1.1 Infrastructure Setup

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 1 | **Upgrade to Node.js 22** | P0 | [ ] | None | Update `functions/package.json` (`"engines": { "node": "22" }`) and `firebase.json`. Required for `@discordjs/rest`. |
| 2 | **Enable Blaze billing** | P0 | [ ] | None | Required to deploy Cloud Functions 2nd gen and Cloud Tasks even if usage stays in free tier. |
| 3 | **Enable Cloud Tasks API** | P0 | [ ] | #2 | Enable in Google Cloud Console for your project. |
| 4 | **Create Cloud Tasks queue (region-aligned)** | P0 | [ ] | #3 | Create queue in the same region as Functions/Cloud Run to avoid cross-region latency. |
| 5 | **Grant Cloud Tasks IAM** | P0 | [ ] | #4 | Grant `cloudtasks.enqueuer` to ingress function SA; ensure worker is invokable by tasks (OIDC). |
| 6 | **Install Discord dependencies** | P0 | [ ] | #1 | `npm install discord-interactions @discordjs/rest discord-api-types` in `functions/`. |
| 7 | **Create Discord Application** | P0 | [ ] | None | Create app in Discord Developer Portal. Save Application ID, Public Key, Bot Token. |
| 8 | **Configure Discord secrets** | P0 | [ ] | #7 | Add to Firebase Secret Manager: `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`. |
| 9 | **Split `functions/index.js`** | P0 | [ ] | None | Create modular structure: `functions/src/discord/ingress.js`, `functions/src/discord/worker.js`, `functions/src/triggers/scheduler.js`. |
| 10 | **Set up Cloud Tasks queue retry policy** | P0 | [ ] | #4 | Configure retry/backoff policy for Discord interactions. |

### 1.2 Interaction Ingress Function

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 11 | **Create ingress Cloud Function** | P0 | [ ] | #6, #9 | `onRequest` handler at `/discord/interactions`. Must be 2nd gen for Cloud Tasks integration. |
| 12 | **Preserve raw body for signature verification** | P0 | [ ] | #11 | Ensure no body parser mutates `req.rawBody` before `verifyKey`. |
| 13 | **Implement signature verification** | P0 | [ ] | #11, #8, #12 | Use `verifyKey` from `discord-interactions`. MUST use `req.rawBody`. Return 401 on failure. |
| 14 | **Handle PING interaction** | P0 | [ ] | #13 | Return `{ type: 1 }` for Discord endpoint verification. This is synchronous, not deferred. |
| 15 | **Implement deferred response** | P0 | [ ] | #13 | Return `{ type: 5 }` for most interactions; set `flags: 64` only for ephemeral flows. Use `type: 6` for update-only component interactions when appropriate. |
| 16 | **Enqueue Cloud Task before response** | P0 | [ ] | #10, #15 | Enqueue task with minimal interaction payload BEFORE calling `res.json()`. |
| 17 | **Trim task payload** | P0 | [ ] | #16 | Keep task payload minimal to stay under 100KB and reduce latency. |
| 18 | **Register interactions endpoint URL** | P0 | [ ] | #14, deploy | Set Interactions Endpoint URL in Discord Developer Portal after deploying. |

### 1.3 Cloud Task Worker Function

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 19 | **Create worker task handler** | P0 | [ ] | #9, #10 | `onTaskDispatched` function to process enqueued interactions. |
| 20 | **Implement Discord API client** | P0 | [ ] | #6, #19 | Initialize `@discordjs/rest` with bot token. Create helper for editing original response. |
| 21 | **Route interactions by type/custom_id** | P0 | [ ] | #19 | Dispatch to appropriate handler based on interaction type and `custom_id`. |

### 1.4 User Identity Linking (OAuth2)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 22 | **Create Discord OAuth start endpoint** | P0 | [ ] | #8 | `onCall` function to generate Discord OAuth URL with state parameter. Scope: `identify` only. |
| 23 | **Register OAuth redirect URI** | P0 | [ ] | #7 | Add the callback URL in Discord Developer Portal and config. |
| 24 | **Create Discord OAuth callback** | P0 | [ ] | #22, #23 | `onRequest` handler to exchange code for tokens, extract Discord user ID, store link. |
| 25 | **Create `discordUserLinks` collection** | P0 | [ ] | #24 | Store `{ qsUserId, linkedAt }` keyed by `discordUserId` for fast lookup. |
| 26 | **Update `users/{uid}` with discord info** | P0 | [ ] | #24 | Store `discord: { userId, username, linkedAt, linkSource: "oauth" }`. |
| 27 | **Store or discard Discord tokens securely** | P0 | [ ] | #24 | If future API calls are needed, encrypt and store in `userSecrets/{uid}`; otherwise discard after `GET /users/@me`. |
| 28 | **Add Firestore rules for discord collections** | P0 | [ ] | #25 | `discordUserLinks` and `discordLinkCodes`: `allow read, write: if false` (admin SDK only). |
| 29 | **Add "Link Discord" UI in Settings** | P0 | [ ] | #22, #24 | Button to initiate OAuth flow, show linked username, unlink option. |

### 1.5 Group-Channel Linking

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 30 | **Create link code generation endpoint** | P0 | [ ] | #9 | `onCall` function for group admins to generate one-time link code. Store hashed in `discordLinkCodes`. |
| 31 | **Register `/qs link-group` slash command** | P0 | [ ] | #7 | Use Discord API to register command with `code` option. Use guild commands for dev; switch to global for release. |
| 32 | **Set `default_member_permissions`** | P0 | [ ] | #31 | Restrict `/qs link-group` to Manage Channels/Administrator by default. |
| 33 | **Implement link-group handler in worker** | P0 | [ ] | #19, #30 | Validate code, check Discord permissions, store link in `questingGroups/{id}.discord`. |
| 34 | **Add "Connect Discord" UI in Group Settings** | P0 | [ ] | #30 | Show link code with instructions, display linked channel name when connected. |

### 1.6 Poll Card Posting

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 35 | **Create Firestore trigger for scheduler creation** | P0 | [ ] | #9 | `onDocumentCreated` for `schedulers/{id}`. Check if linked group, enqueue post task. |
| 36 | **Implement poll card message builder** | P0 | [ ] | #20 | Build embed with title, description, slot count, status. Use `<t:unix:F>` for times. |
| 37 | **Add "Vote" button to poll card** | P0 | [ ] | #36 | Action row with button, `custom_id: "vote_btn:{schedulerId}"`. |
| 38 | **Post poll card via Discord API** | P0 | [ ] | #36, #37 | `POST /channels/{channelId}/messages`. Store `messageId` in `schedulers/{id}.discord`. |

### 1.7 Voting UI

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 39 | **Implement "Vote" button handler** | P0 | [ ] | #21 | Triggered when user clicks Vote. Lookup user link, fetch poll slots. |
| 40 | **Build voting UI components** | P0 | [ ] | #39 | Two select menus: Preferred (max 25), Feasible (max 25). Pre-populate with existing votes. |
| 41 | **Handle select menu interactions** | P0 | [ ] | #40 | Persist selections on each menu change (required because submit does not include menu values). |
| 42 | **Persist pagination state** | P0 | [ ] | #41 | Store per-user selections in short-lived Firestore doc (TTL ~15 minutes). |
| 43 | **Add Submit button** | P0 | [ ] | #40 | `custom_id: "submit_vote:{schedulerId}"`. |
| 44 | **Edit deferred response with voting UI** | P0 | [ ] | #40, #43 | `PATCH /webhooks/{appId}/{token}/messages/@original` with components. |

### 1.8 Vote Submission

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 45 | **Implement submit handler** | P0 | [ ] | #21 | Extract selected slot IDs from interaction data. |
| 46 | **Load persisted selections** | P0 | [ ] | #45, #42 | Read per-user selection state from Firestore if submit payload has no menu values. |
| 47 | **Validate vote data** | P0 | [ ] | #45 | Check slots exist, poll not finalized, user is participant. |
| 48 | **Enforce Preferred => Feasible rule** | P0 | [ ] | #47 | Auto-add preferred slots to feasible set on write. |
| 49 | **Write votes to Firestore** | P0 | [ ] | #48 | Update `schedulers/{id}/votes/{userId}`. Set `source: "discord"`. |
| 50 | **Confirm vote submission** | P0 | [ ] | #49 | Edit ephemeral message to "Votes saved!" |

### 1.9 Poll Updates & Finalization

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 51 | **Create Firestore trigger for scheduler updates** | P0 | [ ] | #9 | `onDocumentUpdated` for `schedulers/{id}`. Detect title/slots/status changes. |
| 52 | **Update poll card on changes** | P0 | [ ] | #51, #36 | Edit existing Discord message with new content. Use `lastSyncedHash` to skip no-ops. |
| 53 | **Handle poll finalization** | P0 | [ ] | #52 | Update card to show winning slot, disable Vote button, show "Finalized" status. |

### 1.10 Basic Error Handling

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 54 | **Handle unlinked user error** | P0 | [ ] | #39 | Show ephemeral message with link to settings page. |
| 55 | **Handle poll not found error** | P0 | [ ] | #39 | Show "Poll no longer exists" message. |
| 56 | **Handle generic errors** | P0 | [ ] | #19 | Catch-all error handler in worker. Edit response with friendly message. |

### 1.11 Critical Security & Integrity (P0)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 57 | **Validate `application_id` on interactions** | P0 | [ ] | #13 | Reject if it doesn't match the configured Discord app. |
| 58 | **Validate guild/channel matches linked group** | P0 | [ ] | #39 | Ensure interaction comes from the linked channel for the poll. |
| 59 | **Check user is poll participant** | P0 | [ ] | #47 | Verify linked user's email is in participants list. |
| 60 | **Implement idempotency for interactions** | P0 | [ ] | #49 | Store processed `interaction_id` briefly to prevent duplicate writes. |
| 61 | **Handle 15-minute token expiry** | P0 | [ ] | #19 | Skip edits if token is expired; log warning. |
| 62 | **Protect `discord` user fields in rules** | P0 | [ ] | #28 | Add `discord` to protected user fields to prevent client writes. |

---

## Section 2: Important Post-MVP Tasks (P1, P2)

High bang-for-buck features that should be completed before releasing to users beyond your personal D&D group.

### 2.1 Enhanced Voting UX (P1)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 63 | **Add "Clear my votes" button** | P1 | [ ] | #40 | Writes empty vote set, clears `noTimesWork` flag. |
| 64 | **Add "None work for me" button** | P1 | [ ] | #40 | Sets `noTimesWork: true`, clears slot votes. Distinct from clearing votes. |

### 2.2 Pagination for Large Polls (P1)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 65 | **Detect polls with >25 slots** | P1 | [ ] | #39 | Check slot count before building UI. |
| 66 | **Implement pagination UI** | P1 | [ ] | #65 | "Next Page" / "Previous Page" buttons. Store page state in short-lived Firestore doc (TTL). |
| 67 | **Merge selections across pages** | P1 | [ ] | #66 | Combine all page selections on final submit. |

### 2.3 User-Friendly Error Messages (P1)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 68 | **Create error message constants** | P1 | [ ] | #56 | Centralized, actionable error messages (see design doc table). |
| 69 | **Handle "poll finalized" error** | P1 | [ ] | #47 | "Voting is closed for this session." |
| 70 | **Handle "stale slots" error** | P1 | [ ] | #47 | "Poll was updated. Please tap Vote again." |
| 71 | **Handle "not authorized" error** | P1 | [ ] | #54 | "You're not a participant. Ask the organizer to invite you." |

### 2.4 Debouncing & Performance (P1)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 72 | **Implement `lastSyncedHash` check** | P1 | [ ] | #52 | Hash title + slots + status. Skip Discord update if unchanged. |
| 73 | **Add Cloud Tasks delay for debouncing** | P1 | [ ] | #51 | Use `scheduleDelaySeconds: 5` to coalesce rapid edits. |
| 74 | **Prevent infinite trigger loops** | P1 | [ ] | #51 | Skip trigger if only `discord.*` fields changed. |

### 2.5 Unlink Functionality (P2)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 75 | **Implement user unlink** | P2 | [ ] | #29 | Remove `users/{uid}.discord`, delete `discordUserLinks/{discordUserId}`, and purge stored Discord tokens in `userSecrets/{uid}` (if any). |
| 76 | **Register `/qs unlink-group` command** | P2 | [ ] | #31 | Allow group admins to disconnect channel. |
| 77 | **Implement unlink-group handler** | P2 | [ ] | #76 | Remove `questingGroups/{id}.discord`. Optionally edit poll cards to show "Disconnected". |

### 2.6 Security Hardening (P2)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 78 | **Rate limit link code generation** | P2 | [ ] | #30 | Max 5 codes per user per hour. |
| 79 | **Rate limit link code attempts** | P2 | [ ] | #33 | Max 5 attempts per code. Delete on success or expiration. |
| 80 | **Validate Discord admin permissions** | P2 | [ ] | #33 | Check user has Manage Channels or Administrator in guild. |

### 2.7 Web UI Enhancements (P2)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 81 | **Show Discord sync status on poll page** | P2 | [ ] | #38 | Indicator showing "Posted to Discord" with link to message. |
| 82 | **Add "View in Discord" link** | P2 | [ ] | #81 | Use stored `discord.messageUrl`. |
| 83 | **Show Discord vote source** | P2 | [ ] | #49 | Indicate which votes came from Discord vs web in vote summary. |

---

## Section 3: Low Priority Post-MVP Tasks (P3, P4, P5)

Tech debt, code health, and future enhancements that won't block a robust MVP.

### 3.1 Operational Excellence (P3)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 84 | **Add structured logging** | P3 | [ ] | #19, #11 | Log interaction types, user IDs, timing, errors in structured format. |
| 85 | **Set up monitoring alerts** | P3 | [ ] | #84 | Alert on high error rates, signature verification failures, rate limits. |
| 86 | **Add latency tracking** | P3 | [ ] | #84 | Track time from interaction receipt to response edit. |
| 87 | **Implement graceful degradation** | P3 | [ ] | #56 | Store `discord.pendingSync` when Discord API unavailable. Retry later. |

### 3.2 Large Poll Optimizations (P3)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 88 | **"Vote on Web" fallback** | P3 | [ ] | #65 | For polls with >10 dates or >100 slots, show single "Vote on Web" button instead of pagination. |
| 89 | **Pagination state TTL cleanup** | P3 | [ ] | #66 | Use Firestore TTL or scheduled function to clean up expired pagination state docs. |

### 3.3 Alternative Linking Methods (P4)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 90 | **Register `/qs link` user command** | P4 | [ ] | #31 | Alternative to OAuth: generate code in Discord, enter in web. |
| 91 | **Implement slash-based user linking** | P4 | [ ] | #90 | Less seamless than OAuth but works for users who prefer it. |

### 3.4 Code Quality (P4)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 92 | **Add TypeScript types** | P4 | [ ] | #9 | Type definitions for Discord interactions, Firestore schemas. |
| 93 | **Add unit tests for worker handlers** | P4 | [ ] | #19 | Mock Discord API, test vote logic, error handling. |
| 94 | **Add integration tests** | P4 | [ ] | #93 | End-to-end tests with Firebase emulator. |

### 3.5 Future Features (P5)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 95 | **Thread linking support** | P5 | [ ] | #33 | Allow linking threads instead of channels. Requires additional permissions. |
| 96 | **Multi-channel support** | P5 | [ ] | #33 | Allow one group to link multiple channels (different servers). |
| 97 | **DM voting flows** | P5 | [ ] | MVP | Allow voting via DM with the bot. Out of scope for Phase 1. |
| 98 | **Create poll from Discord** | P5 | [ ] | MVP | `/qs create-poll` command. Listed as non-goal for this phase. |
| 99 | **Finalize poll from Discord** | P5 | [ ] | MVP | `/qs finalize` command. Listed as non-goal for this phase. |
| 100 | **Discord bot verification** | P5 | [ ] | Wide release | Required to scale past 100 servers. Complete verification checklist in Developer Portal. |

---

## Implementation Order Summary

### Phase 1: MVP (Tasks 1-62)
**Goal**: Working end-to-end experience for your D&D group.

```
Week 1: Infrastructure (1-10) → Ingress Function (11-18)
Week 2: Worker Function (19-21) → User Linking (22-29)
Week 3: Group Linking (30-34) → Poll Card (35-38)
Week 4: Voting UI (39-44) → Vote Submission (45-50)
Week 5: Poll Updates (51-53) → Basic Errors (54-56) → Security & Integrity (57-62)
```

### Phase 2: Pre-Release Polish (Tasks 63-83)
**Goal**: Ready for friends and wider D&D community.

```
Enhanced UX (63-64) → Pagination (65-67) → Error Messages (68-71)
Debouncing (72-74) → Unlink (75-77) → Security (78-80) → Web UI (81-83)
```

### Phase 3: Long-term (Tasks 84-100)
**Goal**: Production-grade quality and future growth.

```
Operational (84-87) → Large Polls (88-89) → Alt Linking (90-91)
Code Quality (92-94) → Future Features (95-100)
```

---

## Quick Reference: MVP Critical Path

The minimum tasks to get a vote working end-to-end:

1. Infrastructure: 1-10
2. Ingress: 11-18
3. Worker: 19-21
4. User Link: 22-29
5. Group Link: 30-34
6. Poll Card: 35-38
7. Voting: 39-50
8. Updates: 51-53
9. Errors: 54-56
10. Security & Integrity: 57-62

**Total MVP tasks: 62**
