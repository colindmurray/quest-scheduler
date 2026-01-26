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
| 1 | **Upgrade to Node.js 22** | P0 | [x] | None | Updated functions/package.json engines + firebase.json runtime. Validation: no automated tests. |
| 2 | **Enable Blaze billing** | P0 | [x] | None | Manual: enable Blaze billing in Firebase project. Validation: gcloud billingEnabled=true. |
| 3 | **Enable Cloud Tasks API** | P0 | [x] | #2 | Enabled via gcloud services. Validation: no automated tests. |
| 4 | **Create Cloud Tasks queue (region-aligned)** | P0 | [x] | #3 | Queue `processDiscordInteraction` exists in us-central1. Validation: no automated tests. |
| 5 | **Grant Cloud Tasks IAM** | P0 | [x] | #4 | Enqueuer + Run invoker granted to appspot SA. Validation: no automated tests. |
| 6 | **Install Discord dependencies** | P0 | [x] | #1 | Installed Discord dependencies in functions package. Validation: no automated tests. |
| 7 | **Create Discord Application** | P0 | [x] | None | Manual: create Discord application and capture IDs/tokens. Validation: app ID/token provided during setup. |
| 8 | **Configure Discord secrets** | P0 | [x] | #7 | Manual: store Discord secrets in Firebase Secret Manager. Validation: gcloud secrets list shows DISCORD_* entries. |
| 9 | **Split `functions/index.js`** | P0 | [x] | None | Split functions entry into functions/src modules with Discord scaffolding. Validation: no automated tests. |
| 10 | **Set up Cloud Tasks queue retry policy** | P0 | [x] | #4 | Manual: set Cloud Tasks queue retry/backoff policy. Validation: queue shows retryConfig in gcloud describe. |

### 1.2 Interaction Ingress Function

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 11 | **Create ingress Cloud Function** | P0 | [x] | #6, #9 | Added v2 ingress function at /discord/interactions. Validation: no automated tests. |
| 12 | **Preserve raw body for signature verification** | P0 | [x] | #11 | Ingress uses req.rawBody for signature verification. Validation: no automated tests. |
| 13 | **Implement signature verification** | P0 | [x] | #11, #8, #12 | Implemented verifyKey signature validation. Validation: no automated tests. |
| 14 | **Handle PING interaction** | P0 | [x] | #13 | PING interaction returns {type:1}. Validation: no automated tests. |
| 15 | **Implement deferred response** | P0 | [x] | #13 | Ingress defers with type 5 + ephemeral flags. Validation: no automated tests. |
| 16 | **Enqueue Cloud Task before response** | P0 | [x] | #10, #15 | Ingress enqueues Cloud Task before response. Validation: no automated tests. |
| 17 | **Trim task payload** | P0 | [x] | #16 | Trimmed interaction payload to essential fields. Validation: no automated tests. |
| 18 | **Register interactions endpoint URL** | P0 | [x] | #14, deploy | Manual: set Interactions Endpoint URL in Discord Developer Portal. Validation: /link-group command responds in Discord. |

### 1.3 Cloud Task Worker Function

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 19 | **Create worker task handler** | P0 | [x] | #9, #10 | Added processDiscordInteraction worker with onTaskDispatched. Validation: no automated tests. |
| 20 | **Implement Discord API client** | P0 | [x] | #6, #19 | Added Discord REST helpers for posting/editing messages. Validation: no automated tests. |
| 21 | **Route interactions by type/custom_id** | P0 | [x] | #19 | Worker routes by interaction type/custom_id. Validation: no automated tests. |

### 1.4 User Identity Linking (OAuth2)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 22 | **Create Discord OAuth start endpoint** | P0 | [x] | #8 | Implemented discordOAuthStart onCall endpoint. Validation: no automated tests. |
| 23 | **Register OAuth redirect URI** | P0 | [x] | #7 | Manual: register Discord OAuth redirect URI in Developer Portal. Validation: OAuth flow no longer shows invalid redirect. |
| 24 | **Create Discord OAuth callback** | P0 | [x] | #22, #23 | Implemented discordOAuthCallback handler. Validation: no automated tests. |
| 25 | **Create `discordUserLinks` collection** | P0 | [x] | #24 | discordUserLinks collection used for Discord->QS mapping. Validation: no automated tests. |
| 26 | **Update `users/{uid}` with discord info** | P0 | [x] | #24 | users/{uid}.discord updated on OAuth link. Validation: no automated tests. |
| 27 | **Store or discard Discord tokens securely** | P0 | [x] | #24 | Discord tokens discarded after /users/@me. Validation: no automated tests. |
| 28 | **Add Firestore rules for discord collections** | P0 | [x] | #25 | Firestore rules updated for Discord collections. Validation: no automated tests. |
| 29 | **Add "Link Discord" UI in Settings** | P0 | [x] | #22, #24 | Settings UI shows Discord link status + OAuth start. Validation: no automated tests. |

### 1.5 Group-Channel Linking

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 30 | **Create link code generation endpoint** | P0 | [x] | #9 | Added onCall link code generator for groups. Validation: no automated tests. |
| 31 | **Register `/qs link-group` slash command** | P0 | [x] | #7 | Script added (functions/scripts/register-discord-commands.js); run to register commands. Validation: command visible in guild. |
| 32 | **Set `default_member_permissions`** | P0 | [x] | #31 | Script sets default_member_permissions=Manage Channels; run registration. Validation: applied during command registration. |
| 33 | **Implement link-group handler in worker** | P0 | [x] | #19, #30 | Worker handles /qs link-group and stores questingGroups.discord. Validation: no automated tests. |
| 34 | **Add "Connect Discord" UI in Group Settings** | P0 | [x] | #30 | Group Settings UI exposes Discord link code + status. Validation: no automated tests. |

### 1.6 Poll Card Posting

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 35 | **Create Firestore trigger for scheduler creation** | P0 | [x] | #9 | Firestore trigger posts Discord poll card on scheduler create. Validation: no automated tests. |
| 36 | **Implement poll card message builder** | P0 | [x] | #20 | Poll card builder added (embeds + timestamps). Validation: no automated tests. |
| 37 | **Add "Vote" button to poll card** | P0 | [x] | #36 | Vote button added to poll card. Validation: no automated tests. |
| 38 | **Post poll card via Discord API** | P0 | [x] | #36, #37 | Discord API posts poll card + stores message IDs. Validation: no automated tests. |

### 1.7 Voting UI

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 39 | **Implement "Vote" button handler** | P0 | [x] | #21 | Vote button handler implemented. Validation: no automated tests. |
| 40 | **Build voting UI components** | P0 | [x] | #39 | Voting UI components built with select menus. Validation: no automated tests. |
| 41 | **Handle select menu interactions** | P0 | [x] | #40 | Select menu interactions persist state. Validation: no automated tests. |
| 42 | **Persist pagination state** | P0 | [x] | #41 | discordVoteSessions stores per-user selections with TTL. Validation: no automated tests. |
| 43 | **Add Submit button** | P0 | [x] | #40 | Submit button wired for vote flow. Validation: no automated tests. |
| 44 | **Edit deferred response with voting UI** | P0 | [x] | #40, #43 | Deferred response edited with voting UI. Validation: no automated tests. |

### 1.8 Vote Submission

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 45 | **Implement submit handler** | P0 | [x] | #21 | Submit handler implemented. Validation: no automated tests. |
| 46 | **Load persisted selections** | P0 | [x] | #45, #42 | Submit loads persisted selections from Firestore. Validation: no automated tests. |
| 47 | **Validate vote data** | P0 | [x] | #45 | Vote validation checks poll state + slots. Validation: no automated tests. |
| 48 | **Enforce Preferred => Feasible rule** | P0 | [x] | #47 | Preferred => Feasible enforced on write. Validation: no automated tests. |
| 49 | **Write votes to Firestore** | P0 | [x] | #48 | Votes stored in schedulers/{id}/votes/{uid} with source. Validation: no automated tests. |
| 50 | **Confirm vote submission** | P0 | [x] | #49 | Ephemeral confirmation on submit. Validation: no automated tests. |

### 1.9 Poll Updates & Finalization

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 51 | **Create Firestore trigger for scheduler updates** | P0 | [x] | #9 | Firestore trigger updates Discord card on scheduler updates. Validation: no automated tests. |
| 52 | **Update poll card on changes** | P0 | [x] | #51, #36 | Poll card edits on changes with Discord API. Validation: no automated tests. |
| 53 | **Handle poll finalization** | P0 | [x] | #52 | Finalized status disables vote + shows winning slot. Validation: no automated tests. |

### 1.10 Basic Error Handling

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 54 | **Handle unlinked user error** | P0 | [x] | #39 | Unlinked user error handled with settings link. Validation: no automated tests. |
| 55 | **Handle poll not found error** | P0 | [x] | #39 | Poll not found errors handled. Validation: no automated tests. |
| 56 | **Handle generic errors** | P0 | [x] | #19 | Worker catch-all error response added. Validation: no automated tests. |

### 1.11 Critical Security & Integrity (P0)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 57 | **Validate `application_id` on interactions** | P0 | [x] | #13 | Validate application_id in ingress/worker. Validation: no automated tests. |
| 58 | **Validate guild/channel matches linked group** | P0 | [x] | #39 | Guild/channel validation for vote interactions. Validation: no automated tests. |
| 59 | **Check user is poll participant** | P0 | [x] | #47 | Participant check enforced on vote actions. Validation: no automated tests. |
| 60 | **Implement idempotency for interactions** | P0 | [x] | #49 | Idempotency via discordInteractionIds lock. Validation: no automated tests. |
| 61 | **Handle 15-minute token expiry** | P0 | [x] | #19 | Token expiry check skips edits after 15 minutes. Validation: no automated tests. |
| 62 | **Protect `discord` user fields in rules** | P0 | [x] | #28 | Firestore rules protect users.discord from client writes. Validation: no automated tests. |

---

## Section 2: Important Post-MVP Tasks (P1, P2)

High bang-for-buck features that should be completed before releasing to users beyond your personal D&D group.

### 2.1 Enhanced Voting UX (P1)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 63 | **Add "Clear my votes" button** | P1 | [x] | #40 | Writes empty vote set, clears `noTimesWork` flag. Validation: no automated tests. |
| 64 | **Add "None work for me" button** | P1 | [x] | #40 | Sets `noTimesWork: true`, clears slot votes. Distinct from clearing votes. Validation: no automated tests. |

### 2.2 Pagination for Large Polls (P1)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 65 | **Detect polls with >25 slots** | P1 | [x] | #39 | Check slot count before building UI. Validation: no automated tests. |
| 66 | **Implement pagination UI** | P1 | [x] | #65 | "Next Page" / "Previous Page" buttons. Store page state in short-lived Firestore doc (TTL). Validation: no automated tests. |
| 67 | **Merge selections across pages** | P1 | [x] | #66 | Combine all page selections on final submit. Validation: no automated tests. |

### 2.3 User-Friendly Error Messages (P1)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 68 | **Create error message constants** | P1 | [x] | #56 | Centralized, actionable error messages (see design doc table). Validation: no automated tests. |
| 69 | **Handle "poll finalized" error** | P1 | [x] | #47 | "Voting is closed for this session." Validation: no automated tests. |
| 70 | **Handle "stale slots" error** | P1 | [x] | #47 | "Poll was updated. Please tap Vote again." Validation: no automated tests. |
| 71 | **Handle "not authorized" error** | P1 | [x] | #54 | "You're not a participant. Ask the organizer to invite you." Validation: no automated tests. |

### 2.4 Debouncing & Performance (P1)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 72 | **Implement `lastSyncedHash` check** | P1 | [x] | #52 | Hash title + slots + status. Skip Discord update if unchanged. Validation: no automated tests. |
| 73 | **Add Cloud Tasks delay for debouncing** | P1 | [x] | #51 | Use `scheduleDelaySeconds: 5` to coalesce rapid edits. Validation: no automated tests. |
| 74 | **Prevent infinite trigger loops** | P1 | [x] | #51 | Skip trigger if only `discord.*` fields changed. Validation: no automated tests. |

### 2.5 Unlink Functionality (P2)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 75 | **Implement user unlink** | P2 | [x] | #29 | Remove `users/{uid}.discord`, delete `discordUserLinks/{discordUserId}`, and purge stored Discord tokens in `userSecrets/{uid}` (if any). Validation: no automated tests. |
| 76 | **Register `/qs unlink-group` command** | P2 | [x] | #31 | Allow group admins to disconnect channel. Validation: no automated tests. |
| 77 | **Implement unlink-group handler** | P2 | [x] | #76 | Remove `questingGroups/{id}.discord`. Optionally edit poll cards to show "Disconnected". Validation: no automated tests. |

### 2.6 Security Hardening (P2)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 78 | **Rate limit link code generation** | P2 | [x] | #30 | Max 5 codes per user per hour. Validation: no automated tests. |
| 79 | **Rate limit link code attempts** | P2 | [x] | #33 | Max 5 attempts per code. Delete on success or expiration. Validation: no automated tests. |
| 80 | **Validate Discord admin permissions** | P2 | [x] | #33 | Check user has Manage Channels or Administrator in guild. Validation: no automated tests. |

### 2.7 Web UI Enhancements (P2)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 81 | **Show Discord sync status on poll page** | P2 | [x] | #38 | Indicator showing "Posted to Discord" with link to message. Validation: no automated tests. |
| 82 | **Add "View in Discord" link** | P2 | [x] | #81 | Use stored `discord.messageUrl`. Validation: no automated tests. |
| 83 | **Show Discord vote source** | P2 | [x] | #49 | Indicate which votes came from Discord vs web in vote summary. Validation: no automated tests. |

### 2.8 Reopen & Closed Poll Messaging (P1)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 84 | **Hide voting UI when poll is closed** | P1 | [x] | #53 | Closed poll responses clear components so buttons/selects disappear. Validation: no automated tests. |
| 85 | **Notify Discord on poll reopen** | P1 | [x] | #51 | Post @ mention when a finalized poll is reopened. Validation: no automated tests. |

---

## Section 3: Low Priority Post-MVP Tasks (P3, P4, P5)

Tech debt, code health, and future enhancements that won't block a robust MVP.

### 3.1 Operational Excellence (P3)

| # | Task | Priority | Status | Dependencies | Notes |
| --- | ------ | ---------- | --- | -------------- | ------- |
| 84 | **Add structured logging** | P3 | [x] | #19, #11 | Log interaction types, user IDs, timing, errors in structured format. Validation: no automated tests. |
| 85 | **Set up monitoring alerts** | P3 | [ ] | #84 | Alert on high error rates, signature verification failures, rate limits. |
| 86 | **Add latency tracking** | P3 | [x] | #84 | Track time from interaction receipt to response edit. Validation: no automated tests. |
| 87 | **Implement graceful degradation** | P3 | [x] | #56 | Store `discord.pendingSync` when Discord API unavailable. Retry later. Validation: no automated tests. |

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
