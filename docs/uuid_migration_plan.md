# UUID Migration Plan

## Overview

This document outlines the plan to migrate from text-based identifiers (primarily email addresses) to UUIDs throughout the Quest Scheduler codebase. The goal is to ensure data consistency when user attributes (like email) change, while preserving functionality for invites to non-registered users.

## Problem Statement

The current system uses email addresses as identifiers in several places:
- Array membership checks (`participants[]`, `members[]`)
- Document IDs (friend requests, blocked users)
- Nested metadata keys (`pendingInviteMeta.{email}`)
- Query filters and Firestore security rules

**If a user's email changes, they lose access to:**
- Schedulers they're participating in
- Questing groups they belong to
- Friend requests (sent and received)
- Vote attribution

## Inventory of Problematic Identifiers

### Email-Based Identifiers

| Location | Current Pattern | Risk Level | Notes |
|----------|-----------------|------------|-------|
| `schedulers.participants[]` | Array of emails | 🔴 High | Membership check fails on email change |
| `schedulers.pendingInvites[]` | Array of emails | 🟡 Medium | Needed for non-registered users |
| `schedulers.pendingInviteMeta.{email}` | Email as key | 🟡 Medium | Metadata orphaned on email change |
| `schedulers.creatorEmail` | Email field | 🟢 Low | Display only, `creatorId` is authoritative |
| `questingGroups.members[]` | Array of emails | 🔴 High | Membership check fails on email change |
| `questingGroups.pendingInvites[]` | Array of emails | 🟡 Medium | Needed for non-registered users |
| `questingGroups.pendingInviteMeta.{email}` | Email as key | 🟡 Medium | Metadata orphaned on email change |
| `friendRequests/{id}` | ID = `friendRequest:{from}__{to}` | 🔴 High | Document orphaned on email change |
| `friendRequests.fromEmail` | Email field | 🔴 High | Query filter, breaks on change |
| `friendRequests.toEmail` | Email field | 🔴 High | Query filter, breaks on change |
| `votes/{uid}.userEmail` | Email field | 🟡 Medium | Attribution display only |
| `blockedUsers/{uid}/blockedUsers/{encodedEmail}` | Email as doc ID | 🟡 Medium | Block doesn't carry to new email |
| `bannedEmails/{encodedEmail}` | Email as doc ID | 🟢 Low | Intentionally email-based (ban the email) |
| Firestore rules | `userEmail() in data.participants` | 🔴 High | Security check fails on email change |

### Other Text-Based Identifiers

| Location | Current Pattern | Risk Level | Notes |
|----------|-----------------|------------|-------|
| `discordUserLinks/{discordUserId}` | Discord ID as doc ID | 🟢 Low | Discord IDs are immutable |
| `friendInviteCode` | UUID | ✅ Good | Already uses UUID |
| `notifications/{id}` | Deterministic from resource | 🟢 Low | Derived from resource ID |

## Design Constraints

### Must Preserve

1. **Invites to non-registered users** - Users without accounts must be invitable via email
2. **Pending invites visible on registration** - New users must see all pending invites immediately
3. **Existing data integrity** - Migration must not break current user access
4. **Firestore security** - Rules must continue to enforce access control

### Key Insight

**Email is necessary for non-registered users.** We cannot use a UID that doesn't exist yet. The solution is a **dual-identifier system**:
- Use email for pending invites (non-registered users)
- Use UID for confirmed participants (registered users)
- Resolve email → UID when user accepts invite or registers

### Future Compatibility: Discord Login

The Discord Login Portal feature (see `docs/discord-login-portal.md`) will add Discord username-based invites. Key compatibility notes:

1. **Email remains required** - Discord OAuth login requires verified email, so all users have an email address. The email-based `pendingInvites[]` system continues to work.

2. **Discord username invites require existing users** - Unlike email invites, Discord username invites only work for users who have already linked their Discord account to Quest Scheduler. No `pendingDiscordInvites[]` array is needed, and **Discord ID invites are not supported**.

3. **Data model after both migrations:**
   ```javascript
   schedulers/{id}: {
     // Confirmed participants (UID-based, from this migration)
     participantIds: ["uid_alice", "uid_bob"],

     // Pending email invites (kept from this migration)
     pendingInvites: ["charlie@example.com"],
     pendingInviteMeta: { "charlie@example.com": {...} }

     // No pendingDiscordInvites - Discord invites resolve to existing users only
   }
   ```

4. **Order of implementation** - This UUID migration can be completed first. The Discord login feature will add Discord identity fields to `usersPublic` for username lookups.

## Migration Strategy

### Phase 1: Add UID-Based Fields (Additive, Non-Breaking)

Add new UID-based fields alongside existing email fields. No removal of old fields yet.

#### Schedulers Collection

```javascript
// Before
{
  participants: ["alice@example.com", "bob@example.com"],
  pendingInvites: ["charlie@example.com"],
  pendingInviteMeta: {
    "charlie@example.com": { invitedByEmail, invitedByUserId, invitedAt }
  }
}

// After (Phase 1)
{
  // NEW: UID-based membership (authoritative for registered users)
  participantIds: ["uid_alice", "uid_bob"],

  // KEEP: Email-based for non-registered users only
  pendingInvites: ["charlie@example.com"],
  pendingInviteMeta: {
    "charlie@example.com": { invitedByEmail, invitedByUserId, invitedAt }
  },

  // DEPRECATED: Keep for backward compatibility during migration
  participants: ["alice@example.com", "bob@example.com"]
}
```

#### Questing Groups Collection

```javascript
// After (Phase 1)
{
  // NEW: UID-based membership
  memberIds: ["uid_alice", "uid_bob"],

  // KEEP: Email-based for pending invites
  pendingInvites: ["charlie@example.com"],
  pendingInviteMeta: { ... },

  // DEPRECATED: Keep for backward compatibility
  members: ["alice@example.com", "bob@example.com"]
}
```

#### Friend Requests Collection

```javascript
// Before: Document ID = friendRequest:{fromEmail}__{toEmail}

// After (Phase 1): Document ID = auto-generated or UUID
{
  id: "uuid-or-auto",

  // NEW: UID-based (null if not registered)
  fromUserId: "uid_alice",
  toUserId: null,  // Charlie hasn't registered yet

  // KEEP: Email-based for queries and non-registered users
  fromEmail: "alice@example.com",
  toEmail: "charlie@example.com",

  status: "pending"
}
```

#### Blocked Users Collection

```javascript
// Before: blockedUsers/{uid}/blockedUsers/{encodedEmail}

// After (Phase 1): blockedUsers/{uid}/blockedUsers/{autoId}
{
  // NEW: UID if known
  blockedUserId: "uid_bob",  // null if user doesn't exist

  // KEEP: Email for lookup and non-registered users
  email: "bob@example.com",

  blockedAt: timestamp

  // Future extensions (added by later features):
  // discordUserId: null,      // Added by Discord login portal
  // discordUsernameLower: null, // Added by Discord login portal
  // qsUsernameLower: null,    // Added by display-names-and-usernames
}
```

**Note:** This structure is designed to be extensible. The Discord login portal and display-names-and-usernames features will add additional identifier fields for blocking by Discord username and Quest Scheduler username.

#### Votes Collection

```javascript
// Already uses UID as document ID: votes/{voterId}
// Just add redundant UID field for consistency

{
  oderId: "uid_alice",  // NEW: explicit UID field
  userEmail: "alice@example.com",  // KEEP: for display/backward compat
  // ... vote data
}
```

### Phase 2: Update Application Code

#### 2.1 Update Write Operations

When a user accepts an invite or is added as participant:

```javascript
// When registered user accepts scheduler invite
async function acceptSchedulerInvite(schedulerId, user) {
  const schedulerRef = doc(db, "schedulers", schedulerId);

  await updateDoc(schedulerRef, {
    // Add to new UID array
    participantIds: arrayUnion(user.uid),

    // Remove from pending (email-based)
    pendingInvites: arrayRemove(user.email),

    // DEPRECATED: Also update old array during transition
    participants: arrayUnion(user.email),

    // Clean up metadata
    [`pendingInviteMeta.${user.email}`]: deleteField()
  });
}
```

#### 2.2 Update Read Operations / Queries

```javascript
// Query schedulers where user is participant
function userSchedulersQuery(user) {
  return query(
    collection(db, "schedulers"),
    where("participantIds", "array-contains", user.uid)
  );
}

// Query pending invites (still email-based for non-registered)
function pendingInvitesQuery(email) {
  return query(
    collection(db, "schedulers"),
    where("pendingInvites", "array-contains", email)
  );
}
```

#### 2.3 Update Firestore Security Rules

```javascript
// Before
function isSchedulerParticipant() {
  return userEmail() in resource.data.participants;
}

// After (Phase 2)
function isSchedulerParticipant() {
  return request.auth.uid in resource.data.participantIds
      || userEmail() in resource.data.pendingInvites;  // Allow pending to view
}
```

### Phase 3: Data Migration Script

Run a one-time migration to populate new UID fields from existing email data.

```javascript
// Migration script (run once)
async function migrateSchedulersToUids() {
  const schedulers = await db.collection("schedulers").get();

  for (const doc of schedulers.docs) {
    const data = doc.data();
    const participantIds = [];

    for (const email of data.participants || []) {
      const uid = await findUserIdByEmail(email);
      if (uid) {
        participantIds.push(uid);
      } else {
        // User doesn't exist - move to pendingInvites
        console.log(`User ${email} not found, keeping in pendingInvites`);
      }
    }

    await doc.ref.update({ participantIds });
  }
}

async function migrateQuestingGroupsToUids() {
  // Similar pattern for questing groups
}

async function migrateFriendRequests() {
  // For each friend request with email-based ID:
  // 1. Create new document with auto-generated ID
  // 2. Populate fromUserId/toUserId where possible
  // 3. Keep email fields for queries
  // 4. Delete old email-based document
  // 5. Update any notifications referencing old ID
}

async function migrateBlockedUsers() {
  // For each blocked user document with email-based ID:
  // 1. Look up blockedUserId from email
  // 2. Create new document with auto-generated ID
  // 3. Keep email field
  // 4. Delete old document
}
```

### Phase 4: Deprecate Email-Based Fields

After migration is complete and verified:

1. **Remove deprecated array reads** - Stop reading `participants[]`, use `participantIds[]`
2. **Remove deprecated array writes** - Stop writing to `participants[]`
3. **Update Firestore rules** - Remove email-based checks
4. **Clean up old data** - Remove deprecated fields from documents

```javascript
// Final cleanup (optional, can leave for audit trail)
async function removeDeprecatedFields() {
  const schedulers = await db.collection("schedulers").get();
  for (const doc of schedulers.docs) {
    await doc.ref.update({
      participants: deleteField()  // Remove deprecated array
    });
  }
}
```

## Handling Non-Registered User Invites

### The Challenge

When inviting `charlie@example.com` who doesn't have an account:
- We can't store a UID (doesn't exist)
- We must store the email so Charlie sees the invite when they register

### The Solution: Email-Based Pending, UID-Based Confirmed

```
INVITE FLOW:

  [Invite sent to charlie@example.com]
              │
              ▼
  pendingInvites: ["charlie@example.com"]  ← Email-based
              │
              │ (Charlie registers & accepts)
              ▼
  participantIds: ["uid_charlie"]  ← UID-based
  pendingInvites: []  ← Removed
```

### Registration Hook

When a new user registers, automatically resolve pending invites:

```javascript
// In AuthProvider or onUserCreate Cloud Function
async function onUserRegistered(user) {
  // Create user profile
  await ensureUserProfile(user);

  // Note: No need to "convert" pending invites here.
  // The queries for pending invites are email-based,
  // so the user will see them automatically.
  // Conversion to UID happens when they ACCEPT the invite.
}
```

### Accept Invite Flow

```javascript
async function acceptSchedulerInvite(schedulerId, user) {
  const batch = writeBatch(db);
  const schedulerRef = doc(db, "schedulers", schedulerId);

  batch.update(schedulerRef, {
    // Convert to UID-based membership
    participantIds: arrayUnion(user.uid),

    // Remove from email-based pending
    pendingInvites: arrayRemove(user.email),
    [`pendingInviteMeta.${user.email}`]: deleteField()
  });

  await batch.commit();
}
```

## Friend Request Migration Details

Friend requests require special handling because document IDs are currently email-based.

### Current State

```
Document ID: friendRequest:alice%40example.com__bob%40example.com
{
  fromEmail: "alice@example.com",
  toEmail: "bob@example.com",
  fromUserId: "uid_alice",
  toUserId: null,  // Bob hasn't registered
  status: "pending"
}
```

### Target State

```
Document ID: auto-generated UUID
{
  fromEmail: "alice@example.com",  // KEEP for queries
  toEmail: "bob@example.com",      // KEEP for queries
  fromUserId: "uid_alice",
  toUserId: null,
  status: "pending"
}
```

### Migration Steps

1. **Update code to generate new IDs**
   ```javascript
   // Before
   const requestId = `friendRequest:${encodeURIComponent(`${fromEmail}__${toEmail}`)}`;

   // After
   const requestId = doc(collection(db, "friendRequests")).id;  // Auto-generated
   ```

2. **Update queries to use fields, not document ID**
   ```javascript
   // Queries already use fields, not document ID - no change needed
   where("toEmail", "==", email)
   where("fromEmail", "==", email)
   ```

3. **Migrate existing documents**
   ```javascript
   async function migrateFriendRequestIds() {
     const requests = await db.collection("friendRequests").get();

     for (const doc of requests.docs) {
       if (doc.id.startsWith("friendRequest:")) {
         // Old format - migrate
         const data = doc.data();
         const newRef = db.collection("friendRequests").doc();  // New auto-ID

         await db.runTransaction(async (t) => {
           t.set(newRef, { ...data, id: newRef.id });
           t.delete(doc.ref);

           // Update any notifications referencing old ID
           const notifications = await db.collectionGroup("notifications")
             .where("metadata.requestId", "==", doc.id)
             .get();

           for (const notif of notifications.docs) {
             t.update(notif.ref, { "metadata.requestId": newRef.id });
           }
         });
       }
     }
   }
   ```

## Blocked Users Migration

### Current State

```
Collection: users/{uid}/blockedUsers/{encodeEmailId(email)}
{
  email: "spammer@example.com",
  blockedAt: timestamp
}
```

### Target State

```
Collection: users/{uid}/blockedUsers/{autoId}
{
  email: "spammer@example.com",      // KEEP for lookup
  blockedUserId: "uid_spammer",      // NEW: null if user doesn't exist
  blockedAt: timestamp
}
```

### Queries After Migration

```javascript
// Check if user is blocked (by UID if known, email as fallback)
async function isUserBlocked(blockerUid, targetUid, targetEmail) {
  const blockedRef = collection(db, "users", blockerUid, "blockedUsers");

  // Try UID first
  if (targetUid) {
    const uidQuery = query(blockedRef, where("blockedUserId", "==", targetUid));
    const uidResult = await getDocs(uidQuery);
    if (!uidResult.empty) return true;
  }

  // Fall back to email
  const emailQuery = query(blockedRef, where("email", "==", targetEmail));
  const emailResult = await getDocs(emailQuery);
  return !emailResult.empty;
}
```

## Unrelated Hotfixes (Block Behavior Alignment)

These are not part of the UID migration itself, but should be fixed alongside the migration because they touch identifier lookups and access rules.

### 1) Group invite blocking
- **Current state:** Group invites are not blocked; only friend + poll invites use block checks.
- **Fix:** Apply block checks to questing group invites so blocked users cannot invite you to groups.

### 2) Blocked request handling ("black hole")
- **Behavior:** Once you block a user, any **future** friend/group/poll requests from them should be silently ignored (no notification, no email).
- **No auto-removals:** Blocking should **not** automatically remove existing friendships, group memberships, or poll participation.
- **Manual cleanup:** Users can unfriend or leave groups/polls manually if they want.

### 3) Penalty rule (invite allowance)
- The invite‑allowance penalty should **only** apply if the blocked user had **already sent** a pending request to the blocker (friend, poll invite, or group invite) at the time of blocking.
- Blocking someone without any prior request should **not** penalize them.

## Implementation Phases

### Phase 1: Foundation (Non-Breaking)
- [ ] Add `participantIds` field to scheduler writes
- [ ] Add `memberIds` field to questing group writes
- [ ] Update friend request creation to use auto-generated IDs
- [ ] Update blocked user creation to use auto-generated IDs
- [ ] Add `voterId` field to vote writes
- [ ] Deploy and verify no regressions

### Phase 2: Dual-Read (Transition)
- [ ] Update scheduler queries to prefer `participantIds`, fall back to `participants`
- [ ] Update group queries to prefer `memberIds`, fall back to `members`
- [ ] Update Firestore rules to check both UID and email arrays
- [ ] Deploy and verify both old and new data works

### Phase 3: Data Migration
- [ ] Run `migrateSchedulersToUids()` script
- [ ] Run `migrateQuestingGroupsToUids()` script
- [ ] Run `migrateFriendRequestIds()` script
- [ ] Run `migrateBlockedUsers()` script
- [ ] Verify all existing users retain access

### Phase 4: Deprecation (Breaking for Old Clients)
- [ ] Remove email array writes from scheduler operations
- [ ] Remove email array writes from group operations
- [ ] Update Firestore rules to UID-only checks
- [ ] Remove deprecated field reads
- [ ] (Optional) Clean up deprecated fields from documents

## Rollback Plan

If issues arise during migration:

1. **Phase 1-2**: Simply revert code changes. Data is backward compatible.
2. **Phase 3**: Restore Firestore from backup before migration script ran.
3. **Phase 4**: Cannot easily rollback. Ensure thorough testing before this phase.

## Testing Checklist

### Pre-Migration
- [ ] Existing users can access their schedulers
- [ ] Existing users can access their questing groups
- [ ] Pending friend requests are visible
- [ ] New invites to non-registered users work

### Post-Migration
- [ ] All above still work
- [ ] New users see pending invites on registration
- [ ] Accepting invites converts email → UID correctly
- [ ] Email changes (if ever allowed) don't break access
- [ ] Firestore rules correctly enforce access via UID

## Open Questions

1. **Should we allow email changes?** If not, this migration is lower priority.
2. **Backfill timing**: Run migration during low-traffic period?
3. **Notification cleanup**: Should old notification IDs be updated or left as-is?
4. **Audit trail**: Keep deprecated fields for debugging, or clean up completely?

## References

- [Login and Registration Flow Redesign](./login-and-registration-flow-redesign.md)
- [Discord Login Portal Design](./discord-login-portal.md) - Adds Discord OAuth login and Discord-based invites (compatible with this migration)
- [Display Names and Usernames](./display-names-and-usernames.md) - Public identifier system for blocking (builds on this migration's blocked users structure)
- [Firestore Security Rules](../firestore.rules)
- [Friends Data Layer](../web/src/lib/data/friends.js)
- [Questing Groups Data Layer](../web/src/lib/data/questingGroups.js)
