# Display Names and Usernames Design

## Summary

Introduce a **public identifier** system that ensures every user has at least one publicly visible, unique identifier for blocking and identification purposes. Users choose one of three options as their public identifier: email, Discord username, or a custom Quest Scheduler username. This public identifier appears alongside the display name in UIs and is used for blocking. It does **not** affect invite resolution—invites work by any identifier the sender provides.

## Goals

- Ensure every user can be uniquely identified and blocked by other users.
- Respect user privacy by allowing choice of which identifier is public.
- Display both a friendly display name AND a unique identifier in UIs where appropriate.
- Support invites and blocking by email, Discord username, or Quest Scheduler username.
- Allow invites using ANY identifier, regardless of the recipient's public identifier setting.
- Work seamlessly with the UUID migration and Discord login features.

## Non-goals

- Replace display names with usernames (display names remain the primary visual identity).
- Force all users to create a Quest Scheduler username (email or Discord username are valid alternatives).
- Make display names unique (they remain non-unique, human-friendly names).

## Dependencies

This design depends on and builds upon:

1. **UUID Migration Plan** (`docs/uuid_migration_plan.md`) - Must be completed first
   - Provides UID-based blocked users structure
   - Adds `blockedUserId` field for UID-based blocking

2. **Discord Login Portal** (`docs/discord-login-portal.md`) - Must be completed second
   - Provides Discord identity fields in `usersPublic`
   - Adds `discordUserId`, `discordUsername`, `discordUsernameLower` fields
   - Establishes blocked users dual identifier pattern

## Design Overview

### The Problem

Currently, when a user receives a friend request or poll invite notification, they see the sender's display name (e.g., "Alex Chen"). If they want to block that user, they must enter an email address in the block dialog. But:

1. **Display names are not unique** - Multiple users could be "Alex Chen"
2. **Emails may not be visible** - Privacy-conscious users don't want their email shown to everyone
3. **No way to identify the sender** - The notification doesn't show a unique identifier

### The Solution: Public Identifier

Every user must have exactly one **public identifier** that is:
- **Unique** - No two users share the same public identifier
- **Visible** - Shown in UIs alongside display name
- **Usable for blocking** - Can be entered in the block dialog

Users choose one of three options:

| Type | Format | Example | Uniqueness |
|------|--------|---------|------------|
| Email | `email@domain.com` | `alex.chen@example.com` | Globally unique (Firebase Auth; always required at signup) |
| Discord Username | `username` | `dragonslayer42` | Unique among Discord users |
| Quest Scheduler Username | `@username` | `@questmaster` | Unique within Quest Scheduler |

### Display Format

The public identifier appears in parentheses after the display name:

```
{displayName} ({publicIdentifier})
```

Examples:
- `Alex Chen (alex.chen@example.com)` - Email is public
- `Alex Chen (dragonslayer42)` - Discord username is public
- `Alex Chen (@questmaster)` - QS username is public

If no display name is set, only the public identifier is shown:
- `alex.chen@example.com`
- `dragonslayer42`
- `@questmaster`

If display name equals the public identifier (edge case), show once:
- `@questmaster` (not `@questmaster (@questmaster)`)

### The `@` Prefix Convention

The `@` prefix is **required** for Quest Scheduler usernames to distinguish them from Discord usernames:
- `@questmaster` - Quest Scheduler username (prefix required)
- `dragonslayer42` - Discord username (no prefix)
- `alex.chen@example.com` - Email (no prefix, has `@` in domain)

**Why this works for disambiguation:**
- **Discord does not allow `@` in usernames** - it's reserved for the mention system (see [Discord username rules](https://support.discord.com/hc/en-us/articles/12620128861463-New-Usernames-Display-Names))
- Without the `@` requirement, `questmaster` could be ambiguous: is it a Discord user or a QS user?
- With the `@` requirement: `@questmaster` is always QS, `questmaster` is always Discord
- Emails are unambiguous because they contain `@` followed by a domain

**Input rules:**
- When entering a QS username (invites, blocking), users MUST include the `@` prefix
- If input is `questmaster` (no `@`), it's treated as a Discord username
- If input is `@questmaster`, it's treated as a QS username
- If input contains `@` in the middle (like `user@domain.com`), it's treated as email

This convention:
- Matches common username conventions (Twitter, GitHub, etc.)
- Eliminates ambiguity between QS and Discord usernames
- Allows auto-detection of identifier type from input

## Data Model

### User Profile (`users/{uid}`)

```javascript
{
  // Existing fields
  email: "alex.chen@example.com",
  displayName: "Alex Chen",

  // NEW: Quest Scheduler username (optional, unique if set)
  qsUsername: "questmaster",  // Stored without @, displayed with @

  // NEW: Public identifier choice
  publicIdentifierType: "qsUsername" | "discordUsername" | "email",

  // From Discord Login Portal (if Discord linked)
  discord: {
    id: "123456789",
    username: "dragonslayer42",
    globalName: "DragonSlayer"
  }
}
```

### Public Profile (`usersPublic/{uid}`)

```javascript
{
  // Existing fields
  email: "alex.chen@example.com",  // Always stored for lookup (public identifier only affects display)
  displayName: "Alex Chen",

  // NEW: Quest Scheduler username (if set)
  qsUsername: "questmaster",
  qsUsernameLower: "questmaster",  // Lowercase for lookups

  // From Discord Login Portal
  discordUsername: "dragonslayer42",
  discordUsernameLower: "dragonslayer42",  // For invite/block lookups

  // NEW: Public identifier type
  publicIdentifierType: "qsUsername" | "discordUsername" | "email",

  // NEW: Computed public identifier value (for display)
  publicIdentifier: "@questmaster"  // Includes @ prefix if QS username
}
```

### Username Lookup Collection (NEW)

```javascript
// qsUsernames/{usernameLower}
{
  uid: "uid_alex",
  username: "questmaster",  // Original case
  createdAt: timestamp
}
```

This collection enables:
- Uniqueness validation (check if document exists)
- Username → UID resolution for blocking
- Case-insensitive lookups

### Blocked Users (`users/{uid}/blockedUsers/{blockId}`)

Building on UUID migration and Discord login portal:

```javascript
{
  // From UUID migration
  blockedUserId: "uid_spammer",  // Primary identifier (if known)
  email: "spammer@example.com",  // Kept for lookup

  // From Discord login portal
  discordUserId: "discord_123",
  discordUsernameLower: "spammer",

  // NEW: Quest Scheduler username
  qsUsernameLower: "spammer123",

  blockedAt: timestamp
}
```

## Username Validation Rules

### Quest Scheduler Username

- **Length**: 3-20 characters
- **Characters**: Lowercase letters, numbers, underscores
- **Pattern**: Must start with a letter
- **Reserved**: Cannot be reserved words (admin, support, help, etc.)
- **Regex**: `^[a-z][a-z0-9_]{2,19}$`

```javascript
const QS_USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;
const RESERVED_USERNAMES = ['admin', 'support', 'help', 'system', 'quest', 'scheduler'];

function isValidQsUsername(username) {
  if (!QS_USERNAME_REGEX.test(username)) return false;
  if (RESERVED_USERNAMES.includes(username)) return false;
  return true;
}
```

### Discord Username (Reference)

From Discord login portal doc:
- 2-32 characters
- Lowercase letters, numbers, underscores, periods
- No leading/trailing/consecutive periods

### Email

Standard email format, validated by Firebase Auth.

## Public Identifier Selection

### Default Assignment

When a user first signs up, assign a default public identifier:

| Sign-up Method | Default Public Identifier |
|----------------|---------------------------|
| Google OAuth | Email |
| Email/Password | Email |
| Discord OAuth | Discord username |

### User Can Change

In Settings, users can change their public identifier to any of:
1. **Email** - Always available (all accounts have email per Discord login portal decision)
2. **Discord Username** - Available if Discord is linked
3. **Quest Scheduler Username** - Available if they create one

### Enforcement

At least one must be public. The system enforces this by:
1. Requiring a default on account creation
2. Preventing removal of the only public identifier
3. Requiring a replacement before switching away from current

## UI Display Rules

### Where to Show Full Format (displayName + identifier)

High-importance contexts where blocking may be needed:
- Friend request notifications: `"Alex Chen (@questmaster) sent you a friend request"`
- Poll invite notifications: `"Alex Chen (@questmaster) invited you to a poll"`
- Group invite notifications: `"Alex Chen (@questmaster) invited you to a group"`
- Block confirmation dialog: `"Block Alex Chen (@questmaster)?"`
- Friend request sender in Friends & Groups page
- Poll participant list (on hover or in details view)

### Where to Show Display Name Only

Low-importance or space-constrained contexts:
- Group member chips (tooltip shows full format)
- Poll voter names in results
- Calendar event attendees
- Notification badges (just the name)

### Where to Show Identifier Only

When display name would be redundant or space is critical:
- Block input autocomplete suggestions
- Username search results
- Settings page "Your public identifier" display

### Component Implementation

```jsx
// UserIdentity component
function UserIdentity({ user, showIdentifier = true, className }) {
  const { displayName, publicIdentifier, publicIdentifierType } = user;

  // If display name equals public identifier, show once
  const isDuplicate = displayName === publicIdentifier ||
    (publicIdentifierType === 'qsUsername' && displayName === `@${user.qsUsername}`);

  if (!displayName || isDuplicate) {
    return <span className={className}>{publicIdentifier}</span>;
  }

  if (!showIdentifier) {
    return <span className={className}>{displayName}</span>;
  }

  return (
    <span className={className}>
      {displayName} <span className="text-muted-foreground">({publicIdentifier})</span>
    </span>
  );
}
```

## Invite Identifier Resolution

### Overview

Users can send invites (friend requests, group invites, poll invites) using **any** of the three identifier types, regardless of what the recipient has set as their public identifier. The system resolves the identifier to find the user.

**Key principle:** You can always look someone up by their email, Discord username, or QS username—these are all valid ways to find a user. The "public identifier" setting only controls what is *displayed* next to their name, not what identifiers can be used to find them.

### Identifier Resolution by Type

| Input Format | Example | Resolution | Non-Existent Behavior |
|--------------|---------|------------|----------------------|
| Email | `alice@example.com` | Query `usersPublic` by email | **Allow** - creates pending invite |
| Discord username | `dragonslayer42` | Query `usersPublic` by `discordUsernameLower` | **Error** - "Discord user not found" |
| QS username | `@questmaster` | Lookup `qsUsernames/{usernameLower}` | **Error** - "Username not found" |

### Why Email Allows Non-Existent Users

Email is the only identifier that supports **pending invites** to non-registered users:
- Anyone with an email address can be invited, even if they don't have a Quest Scheduler account
- The invite is stored in `pendingInvites[]` and resolved when they register
- This is core functionality that must be preserved

### Why Usernames Require Existing Users

Discord usernames and QS usernames only work for users who already have accounts:
- **Discord username**: Only exists if user has linked Discord to their QS account
- **QS username**: Only exists if user has created a QS username in settings
- There's no way to "hold" an invite for a username that doesn't exist yet

### Error Messages

```javascript
const INVITE_ERRORS = {
  discord_not_found: "No Quest Scheduler user found with Discord username '{username}'. They may not have linked their Discord account yet. Try inviting by email instead.",
  qs_not_found: "No user found with username @{username}. Check the spelling or try inviting by email.",
  legacy_discord_tag: "Legacy Discord tags are no longer supported. Please use their current Discord username or email.",
  discord_id_unsupported: "Discord IDs are not supported. Ask for their Discord username or email.",
  email_invalid: "Please enter a valid email address.",
  self_invite: "You cannot invite yourself.",
  already_member: "This user is already a member.",
  already_invited: "This user already has a pending invite."
};
```

### Input Auto-Detection (Invites)

The same `detectIdentifierType()` function is used for invites:

```javascript
function detectIdentifierType(input) {
  const trimmed = input.trim();

  // Quest Scheduler username (starts with @)
  if (trimmed.startsWith('@')) {
    return { type: 'qsUsername', value: trimmed.slice(1).toLowerCase() };
  }

  // Email (contains @ not at start, has domain)
  if (trimmed.includes('@') && !trimmed.startsWith('@') && trimmed.includes('.')) {
    return { type: 'email', value: trimmed.toLowerCase() };
  }

  // Discord ID (long numeric IDs) is not supported
  if (/^\d{17,20}$/.test(trimmed)) {
    return { type: 'discordId', value: trimmed };
  }

  // Legacy Discord tag (name#1234) is no longer supported
  if (/^.+#\d{4}$/.test(trimmed)) {
    return { type: 'legacyDiscordTag', value: trimmed };
  }

  // Discord username (no @, matches Discord rules: a-z, 0-9, _, .)
  if (/^[a-z0-9_.]{2,32}$/i.test(trimmed)) {
    return { type: 'discordUsername', value: trimmed.toLowerCase() };
  }

  return { type: 'unknown', value: trimmed };
}
```

**Important:** The `@` prefix is **required** to identify a QS username. Without it, `questmaster` is assumed to be a Discord username, not a QS username.

**Implementation requirement:** This parser must live in a shared utility module and be reused by **all** invite + block forms to avoid inconsistent validation.

### Invite Resolution Flow

```javascript
async function resolveInviteTarget(identifier) {
  const { type, value } = detectIdentifierType(identifier);

  switch (type) {
    case 'email':
      // Email can invite non-registered users (pending invite)
      const emailQuery = query(
        collection(db, 'usersPublic'),
        where('email', '==', value)
      );
      const emailResult = await getDocs(emailQuery);
      if (!emailResult.empty) {
        // Existing user
        return {
          uid: emailResult.docs[0].id,
          exists: true,
          ...emailResult.docs[0].data()
        };
      }
      // Non-existent - will create pending invite
      return { uid: null, email: value, exists: false };

    case 'qsUsername':
      const usernameDoc = await getDoc(doc(db, 'qsUsernames', value));
      if (!usernameDoc.exists()) {
        throw new Error(INVITE_ERRORS.qs_not_found.replace('{username}', value));
      }
      const qsUserData = await getDoc(doc(db, 'usersPublic', usernameDoc.data().uid));
      return {
        uid: usernameDoc.data().uid,
        exists: true,
        ...qsUserData.data()
      };

    case 'discordUsername':
      const discordQuery = query(
        collection(db, 'usersPublic'),
        where('discordUsernameLower', '==', value)
      );
      const discordResult = await getDocs(discordQuery);
      if (discordResult.empty) {
        throw new Error(INVITE_ERRORS.discord_not_found.replace('{username}', value));
      }
      return {
        uid: discordResult.docs[0].id,
        exists: true,
        ...discordResult.docs[0].data()
      };

    case 'legacyDiscordTag':
      throw new Error(INVITE_ERRORS.legacy_discord_tag);

    case 'discordId':
      throw new Error(INVITE_ERRORS.discord_id_unsupported);

    default:
      throw new Error(INVITE_ERRORS.email_invalid);
  }
}
```

### UI Guidance

The invite input field should provide helpful hints:

```
┌─────────────────────────────────────────────────────────────┐
│ Invite by email, Discord username, or @username            │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Examples: alice@example.com, dragonslayer42, @questmaster               │
└─────────────────────────────────────────────────────────────┘
```

When an error occurs:
```
┌─────────────────────────────────────────────────────────────┐
│ Invite by email, Discord username, or @username            │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ dragonslayer42                                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ⚠️ No Quest Scheduler user found with Discord username     │
│    'dragonslayer42'. Try inviting by email instead.                │
└─────────────────────────────────────────────────────────────┘
```

## Blocking Workflow

### Current Flow (Problems)

1. User sees notification: "Alex Chen invited you to a poll"
2. User wants to block Alex Chen
3. User opens block dialog, must enter email address
4. User doesn't know Alex Chen's email
5. **User cannot block the harasser**

### New Flow (Solution)

1. User sees notification: "Alex Chen (@questmaster) invited you to a poll"
2. User clicks "Block" on the notification (or opens block dialog)
3. Block dialog pre-fills `@questmaster` if initiated from notification
4. User confirms block
5. **Harasser is blocked**

### Block Input Auto-Detection

The block input field accepts any of three formats:

```javascript
function detectIdentifierType(input) {
  const trimmed = input.trim();

  // Quest Scheduler username (starts with @)
  if (trimmed.startsWith('@')) {
    return { type: 'qsUsername', value: trimmed.slice(1).toLowerCase() };
  }

  // Email (contains @ not at start)
  if (trimmed.includes('@') && !trimmed.startsWith('@')) {
    return { type: 'email', value: trimmed.toLowerCase() };
  }

  // Discord ID (long numeric IDs) is not supported
  if (/^\d{17,20}$/.test(trimmed)) {
    return { type: 'discordId', value: trimmed };
  }

  // Legacy Discord tag (name#1234) is no longer supported
  if (/^.+#\d{4}$/.test(trimmed)) {
    return { type: 'legacyDiscordTag', value: trimmed };
  }

  // Discord username (no @, alphanumeric with _ and .)
  if (/^[a-z0-9_.]{2,32}$/i.test(trimmed)) {
    return { type: 'discordUsername', value: trimmed.toLowerCase() };
  }

  return { type: 'unknown', value: trimmed };
}
```

### Block Resolution

When blocking by identifier, resolve to UID if possible:

```javascript
async function resolveBlockTarget(identifier) {
  const { type, value } = detectIdentifierType(identifier);

  switch (type) {
    case 'email':
      // Query usersPublic by email
      const emailQuery = query(
        collection(db, 'usersPublic'),
        where('email', '==', value)
      );
      const emailResult = await getDocs(emailQuery);
      if (!emailResult.empty) {
        return { uid: emailResult.docs[0].id, ...emailResult.docs[0].data() };
      }
      // Not found - block by email only (might be non-registered)
      return { uid: null, email: value };

    case 'qsUsername':
      // Lookup in qsUsernames collection
      const usernameDoc = await getDoc(doc(db, 'qsUsernames', value));
      if (usernameDoc.exists()) {
        const userData = await getDoc(doc(db, 'usersPublic', usernameDoc.data().uid));
        return { uid: usernameDoc.data().uid, ...userData.data() };
      }
      throw new Error('Username not found');

    case 'discordUsername':
      // Query usersPublic by discordUsernameLower
      const discordQuery = query(
        collection(db, 'usersPublic'),
        where('discordUsernameLower', '==', value)
      );
      const discordResult = await getDocs(discordQuery);
      if (!discordResult.empty) {
        return { uid: discordResult.docs[0].id, ...discordResult.docs[0].data() };
      }
      throw new Error('Discord username not found');

    case 'legacyDiscordTag':
      throw new Error(INVITE_ERRORS.legacy_discord_tag);

    case 'discordId':
      throw new Error('Discord IDs are not supported. Ask for their Discord username or email.');

    default:
      throw new Error('Invalid identifier format');
  }
}
```

**Implementation requirement:** Use the same shared identifier parser from invites.

### Block Behavior Rules
- **Black-hole behavior:** once blocked, new friend/group/poll requests from that user are silently ignored.
- **Penalty rule:** invite‑allowance penalty applies **only** if the blocked user already sent a pending request to the blocker (friend, poll, or group invite).
- **No auto-removals:** blocking does not remove existing friendships, group memberships, or poll participation (manual cleanup only).

## Settings Page Updates

### New Section: "Your Identity"

```
┌─────────────────────────────────────────────────────────────┐
│ Your Identity                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Display Name                                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Alex Chen                                      [Edit]│ │
│ └─────────────────────────────────────────────────────────┘ │
│ Your display name is shown to other users.                  │
│                                                             │
│ Quest Scheduler Username                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ @questmaster                                           [Edit]│ │
│ └─────────────────────────────────────────────────────────┘ │
│ ✓ Available                                                 │
│                                                             │
│ Public Identifier                                           │
│ Others can see this to identify you and use it to block.    │
│                                                             │
│ ○ Email: alex.chen@example.com                           │
│ ● Quest Scheduler Username: @questmaster                         │
│ ○ Discord Username: dragonslayer42 (requires Discord link)          │
│                                                             │
│ Preview: Alex Chen (@questmaster)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Username Editing

When user edits their QS username:
1. Validate format (regex)
2. Check uniqueness (query `qsUsernames` collection)
3. Show availability status in real-time
4. On save: create/update `qsUsernames/{usernameLower}` document

## Firestore Rules Updates

### Username Collection

```javascript
match /qsUsernames/{usernameLower} {
  // Anyone can read (for availability checks)
  allow read: if isSignedIn();

  // Server-only writes (via callable function)
  allow write: if false;
}
```

### Protected Fields

Add `qsUsername` and `publicIdentifierType` to protected fields if they should only be set via server:

```javascript
// Actually, these can be client-writable with validation
// The uniqueness check happens via the qsUsernames collection
```

## Migration Strategy

### Existing Users

When this feature launches:
1. **Default public identifier**: Set to `email` for all existing users
2. **No QS username**: Users don't have QS usernames until they create one
3. **Discord users**: If Discord is linked, they can switch to Discord username

### Migration Script

```javascript
async function migrateExistingUsersPublicIdentifier() {
  const users = await db.collection('users').get();

  for (const doc of users.docs) {
    const data = doc.data();

    // Skip if already has publicIdentifierType
    if (data.publicIdentifierType) continue;

    // Default to email
    await doc.ref.update({
      publicIdentifierType: 'email'
    });

    // Update usersPublic
    await db.collection('usersPublic').doc(doc.id).update({
      publicIdentifierType: 'email',
      publicIdentifier: data.email
    });
  }
}
```

## Implementation Checklist

### Phase 1: Data Model (Foundation)

- [ ] Add `qsUsernames/{usernameLower}` collection
- [ ] Add `qsUsername`, `publicIdentifierType`, `publicIdentifier` fields to `users/{uid}`
- [ ] Add `qsUsername`, `qsUsernameLower`, `publicIdentifierType`, `publicIdentifier` fields to `usersPublic/{uid}`
- [ ] Add `qsUsernameLower` field to `blockedUsers` documents
- [ ] Update Firestore rules for `qsUsernames` collection
- [ ] Create callable function for username registration (uniqueness check)

### Phase 2: Settings Page

- [ ] Add "Your Identity" section to Settings
- [ ] Add QS username input with real-time availability check
- [ ] Add public identifier radio selection
- [ ] Add preview of how name will appear
- [ ] Validate username format client-side
- [ ] Wire up callable function for username save

### Phase 3: Display Updates

- [ ] Create `UserIdentity` component
- [ ] Update friend request notifications to show full format
- [ ] Update poll invite notifications to show full format
- [ ] Update group invite notifications to show full format
- [ ] Update Friends & Groups page to show identifiers
- [ ] Update poll participant lists (hover/details)

### Phase 4: Invite Updates

- [ ] Update friend invite input to accept email/Discord username/QS username
- [ ] Update group invite input to accept email/Discord username/QS username
- [ ] Update poll invite input to accept email/Discord username/QS username
- [ ] Add `detectIdentifierType()` utility function
- [ ] Add `resolveInviteTarget()` function with error handling
- [ ] Show appropriate error messages for non-existent Discord/QS usernames
- [ ] Add input placeholder text with examples (email, Discord username, @username)
- [ ] Ensure `@` prefix is required for QS usernames (no ambiguity)

### Phase 5: Blocking Updates

- [ ] Update block input to accept email/Discord username/QS username
- [ ] Reuse `detectIdentifierType()` from invite updates
- [ ] Update block resolution to query by all identifier types
- [ ] Pre-fill block dialog when initiated from notification
- [ ] Update block confirmation to show full format

### Phase 6: Migration & Testing

- [ ] Run migration script for existing users (set default publicIdentifierType)
- [ ] Test: User can set QS username
- [ ] Test: Username uniqueness enforced
- [ ] Test: Public identifier displays correctly in notifications
- [ ] Test: Invite by email to non-existent user creates pending invite
- [ ] Test: Invite by email to existing user works
- [ ] Test: Invite by Discord username to existing user works
- [ ] Test: Invite by Discord username to non-existent user shows error
- [ ] Test: Invite by @username to existing user works
- [ ] Test: Invite by @username to non-existent user shows error
- [ ] Test: Input without @ is treated as Discord username, not QS username
- [ ] Test: Block by email works
- [ ] Test: Block by Discord username works
- [ ] Test: Block by QS username works
- [ ] Test: Notifications show full format (displayName + identifier)

## Foundation Requirements for Earlier Docs

### UUID Migration Plan (Phase 1)

The blocked users migration should include a placeholder for `qsUsernameLower`:

```javascript
// blockedUsers/{uid}/blockedUsers/{blockId}
{
  blockedUserId: "uid_bob",
  email: "bob@example.com",
  // Placeholder for future features:
  // discordUserId: null,     // Added by Discord login
  // qsUsernameLower: null,   // Added by display names feature
  blockedAt: timestamp
}
```

**Recommendation**: No changes needed to UUID migration plan. The structure is extensible.

### Discord Login Portal (Phase 2)

The blocked users section already includes `discordUserId` and `discordUsernameLower`.

**Recommendation**: Add a note that `qsUsernameLower` will be added by the display names feature:

```javascript
// blockedUsers/{uid}/blockedUsers/{blockId}
{
  email: string | null,
  discordUserId: string | null,
  discordUsernameLower: string | null,
  // Future: qsUsernameLower (added by display-names-and-usernames feature)
}
```

## Open Questions

1. **Username changes**: Should users be able to change their QS username? If so, how often? (Suggestion: Allow changes, but rate-limit to prevent abuse)

2. **Username recycling**: When a user deletes their account, should their username become available? (Suggestion: Yes, after a cooling period)

3. **Display name as fallback**: If a user has no display name and their public identifier is their email, should we derive a display name from the email? (e.g., "Alex Chen" from "alex.chen@example.com")

4. **Notification format**: Should the identifier always be shown, or only when display name is generic/common? (Suggestion: Always show for actionable notifications)

## References

- [UUID Migration Plan](./uuid_migration_plan.md) - Blocked users UID-based structure
- [Discord Login Portal](./discord-login-portal.md) - Discord identity fields and dual-identifier blocking
- [Login and Registration Flow Redesign](./login-and-registration-flow-redesign.md) - Account creation flows
