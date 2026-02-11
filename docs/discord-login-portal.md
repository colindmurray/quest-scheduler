---
created: 2026-01-27
lastUpdated: 2026-02-11
summary: "Design for Discord OAuth as a first-class login provider and account-linking constraints."
category: DESIGN_DOC
status: STALE
implementationStatus: COMPLETE
note: "Discord login flow is implemented (auth entrypoint, callback token exchange, finish route, and unlink guard), but this design doc's baseline sections are now dated."
changelog:
  - "2026-02-11: Reclassified implementationStatus to COMPLETE after codebase verification of Discord login/link/unlink flows."
  - "2026-01-28: uuid: phase4 uid-only participants/members"
  - "2026-01-27: docs: clarify discord email requirement"
  - "2026-01-27: chore: save work in progress"
---

> [!WARNING]
> This document is marked **stale**. Verify against current code and newer docs before relying on it.

# Discord Login Portal Design

## Summary

Add Discord OAuth login as a first-class auth provider without replacing Google or Email/Password. Discord login should automatically link the Discord profile to the user's settings, and the account must not allow unlinking Discord unless another login method (Google or Email/Password) is linked. Use Discord branding assets correctly and avoid imitating Discord's UI look and feel.

## Goals

- Add a Discord login option on the `/auth` page alongside Google and Email/Password.
- Automatically link the Discord profile on first Discord login.
- Allow linking Google and Email/Password later in Settings.
- Block Discord unlink if it is the only login method.
- Use Discord branding assets and colors correctly, without imitating Discord's UI.
- Use Discord OAuth email scope only for **login flow** (account creation). Email is **not required** when linking Discord to an existing account.
- Allow friend, questing group, and scheduler invites by Discord username (auto-detected) **only for existing users who have linked Discord**. No legacy tags or Discord IDs.
- Defer final display rules to Phase 3 (`docs/display-names-and-usernames.md`); Phase 2 should prefer displayName but may still show email in some contexts.

## Non-goals

- Replace existing Google or Email/Password auth flows.
- Redesign the entire auth UI.
- Change Discord bot install flows (separate from login).

## References

- [Discord Brand Guidelines](https://discord.com/branding) - Logo usage rules, legal constraints, "do not imitate look and feel" requirement.
- [discord/discord-oauth2-example](https://github.com/discord/discord-oauth2-example) - Official example showing `identify` enables `/users/@me` without email, and `email` scope adds the email field.
- [Discord OAuth2 Docs](https://discord.com/developers/docs/topics/oauth2) - Authorization Code Grant flow, token endpoint requires `application/x-www-form-urlencoded`.
- [Discord Support: New Usernames & Display Names](https://support.discord.com/hc/en-us/articles/12620128861463) - Canonical username character and length rules.
- [UUID Migration Plan](./uuid_migration_plan.md) - Email → UID migration for participants/members. This Discord feature is designed to be compatible with that migration.
- [Display Names and Usernames](./display-names-and-usernames.md) - Public identifier system for blocking. Builds on this feature's Discord identity fields.

## Current State (Codebase Analysis)

### Authentication (`web/src/lib/auth.js`)
- Firebase Auth configured with Google + Email/Password providers.
- `signInWithGoogle()` uses popup flow with `GoogleAuthProvider`.
- `signInWithGoogleIdToken()` supports Google Identity Services (GIS) credential flow.
- `linkGoogleAccount()` uses `linkWithPopup` for account linking.
- No `signInWithCustomToken` currently exported (needed for Discord login).

### Discord OAuth Linking (`functions/src/discord/oauth.js`)
- **`discordOAuthStart`** (callable function, lines 18-50):
  - **Requires authentication** - throws `"unauthenticated"` if `!request.auth`.
  - Scope is `identify` only (no email). This is fine because **linking does not require Discord email**.
  - Stores state in `oauthStates/{state}` with `uid`, `provider: "discord"`, 10-minute TTL.
  - Returns `{ authUrl }` for client redirect.
- **`discordOAuthCallback`** (HTTP endpoint, lines 52-163):
  - **Critical:** Line 75 validates `stateData.provider !== "discord" || !stateData.uid` - both conditions must pass.
  - Validates state, exchanges code for token using **`application/x-www-form-urlencoded`** (correct).
  - Fetches `/users/@me` with Bearer token.
  - Checks duplicate via `discordUserLinks/{discordId}`.
  - Stores link in `users/{uid}.discord` and `discordUserLinks/{discordId}`.
  - Redirects to `/settings?discord=linked`.

### Discord Unlink (`functions/src/discord/unlink.js`)
- **No safety check** - allows unlink unconditionally.
- Deletes `users/{uid}.discord`, `discordUserLinks/{discordId}`, and `userSecrets/{uid}.discord`.

### Settings Page (`web/src/features/settings/SettingsPage.jsx`)
- **Sign-in methods section** (lines 447-474): Uses `user?.providerData` to detect password and Google providers. Discord via custom token **will not appear here** since `providerData` only shows native Firebase providers.
- **Discord section** (lines 627-658): Separate from sign-in methods. Shows "Linked as {name}" badge.
- "Unlink Discord" button has no disabled state for safety.
- "Link Discord" button calls `startDiscordOAuth()` from `web/src/lib/data/discord.js`.

### Auth Page (`web/src/features/auth/AuthPage.jsx`)
- Google sign-in via GIS button (primary) or popup fallback.
- Email/Password form with login/register tabs.
- **No Discord login option**.

### Routing (`web/src/App.jsx`)
- `/auth` wrapped in `RedirectWhenSignedIn` (auto-redirects logged-in users to `/dashboard`).
- No `/auth/discord/finish` route exists.

### Firestore Rules (`firestore.rules`)
- `users/{uid}.discord` is protected (server-write only via `protectedFields`).
- `discordUserLinks` and `oauthStates` are server-only collections.
- **Critical email dependencies:**
  - `userEmail()` (line 14) returns `request.auth.token.email` - **users without email will fail many access checks**.
  - `isEmailVerified()` (lines 8-11) requires `email_verified == true` OR `sign_in_provider == 'google.com'` - **custom token users satisfy neither**.
  - Pending invites and friend request rules still use `userEmail()`; group membership and scheduler participation now rely on `memberIds` / `participantIds` (UID-based).

### User Profile (`web/src/lib/data/users.js`)
- `ensureUserProfile()` syncs Firebase Auth user to Firestore.
- `defaultDisplayName()` (lines 18-22) returns `displayName`, then `email`, then `"User"` - **Discord users without email get generic "User" name**.
- Friend/group/scheduler invites and notifications currently prefer email display in multiple places.

## Design Overview

Introduce a **separate Discord login flow** that does not require prior authentication. This coexists with the existing linking flow:

| Flow | Purpose | Auth Required | Endpoint Type |
|------|---------|---------------|---------------|
| **Existing: Link** | Add Discord to existing account | Yes | Callable + HTTP callback |
| **New: Login** | Sign in/up via Discord | No | HTTP start + HTTP callback |

The login callback will:
1. Exchange the code for an access token.
2. Fetch the Discord user from `/users/@me` with scopes `identify email`.
3. Resolve or create a Firebase user.
4. Create/refresh Firestore profile docs.
5. Link Discord to the user profile.
6. Mint and return a Firebase custom token for frontend sign-in.

### Why a Custom Token Flow?

Discord is not a native Firebase Auth provider. The standard approach is:
1. Backend exchanges Discord code and fetches user info.
2. Backend calls `admin.auth().createCustomToken(uid)`.
3. Frontend calls `signInWithCustomToken(auth, token)`.

## Discord OAuth Login Flow (Proposed)

### Callback Reuse Strategy

Discord requires redirect URIs to be pre-registered. Rather than registering a second callback, we will **reuse the existing callback** and distinguish flows via the `state` record's `intent` field:

- `intent: "link"` - existing flow, requires `uid` in state.
- `intent: "login"` - new flow, no `uid`, returns custom token.

**Important:** The current callback (line 75) checks `stateData.provider !== "discord" || !stateData.uid`. For login flow compatibility, we must either:
1. Add `provider: "discord"` to login state records, OR
2. Modify callback guard to: `stateData.provider !== "discord" || (stateData.intent !== "login" && !stateData.uid)`

Option 1 is simpler and recommended.

### 1. Login Start Endpoint (new, public HTTP)

**Route:** `GET /discordOAuthLoginStart`

```
Query params:
  - returnTo (optional): path to redirect after login (whitelist validated)

Response: 302 redirect to Discord authorize URL
```

**Implementation:**
1. Generate random 16-byte hex state.
2. Store in `oauthStates/{state}`:
   ```javascript
   {
     provider: "discord",  // Required for callback compatibility
     intent: "login",
     returnTo: validatedReturnTo || "/dashboard",
     createdAt: serverTimestamp(),
     expiresAt: now + 10 minutes
   }
   ```
3. Redirect to Discord (login flow uses email scope):
   ```
   https://discord.com/oauth2/authorize
     ?client_id={DISCORD_CLIENT_ID}
     &response_type=code
     &scope=identify%20email
     &state={state}
     &redirect_uri={callback_url}
     &prompt=consent
   ```

### 2. Callback Endpoint (modified existing)

**Route:** `GET /discordOAuthCallback` (same URL, modified logic)

**New logic branch when `intent === "login"`:**

1. **Validate state** - same as existing (check exists, not expired, delete after use).
2. **Exchange code for token** - same as existing (form-urlencoded POST).
3. **Fetch Discord user** - same endpoint, but now returns email fields:
   ```javascript
   // Response with email scope:
   {
     id: "123456789",
     username: "user",
     global_name: "User Name",
     email: "user@example.com",  // only with email scope
     verified: true              // may be present; treat as optional
   }
   ```
4. **Validate email requirement:**
   ```javascript
   // Email is REQUIRED for Discord login
   const discordEmail = userJson.verified === true ? userJson.email : null;
   if (!discordEmail) {
     // No verified email - reject login
     return res.redirect(`${APP_URL}/auth?error=email_required`);
   }
   ```
5. **Resolve Firebase user:**
   ```javascript
   // Priority order:
   // 1. Existing link: discordUserLinks/{discordId} → use qsUserId
   // 2. Email match: find user by verified email, attach Discord
   // 3. Create new user (with verified email)
   ```
6. **Update Firestore:**
   - Set `users/{uid}.discord` and `users/{uid}.authProviders.discord = true`.
   - Set `discordUserLinks/{discordId}`.
   - Set `users/{uid}.email` and `usersPublic/{uid}.email` (verified email is guaranteed by step 4).
   - Set `users/{uid}.displayName` to `userJson.global_name || userJson.username` if not already set.
7. **Mint custom token:**
   ```javascript
   const customToken = await admin.auth().createCustomToken(uid);
   ```
8. **Redirect to frontend finish route:**
   ```
   /auth/discord/finish?token={customToken}&returnTo={returnTo}
   ```

### 3. Frontend Finish Route (new)

**Route:** `/auth/discord/finish`

**Implementation (`web/src/features/auth/DiscordFinishPage.jsx`):**
```javascript
useEffect(() => {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  const returnTo = params.get("returnTo") || "/dashboard";

  if (!token) {
    navigate("/auth?error=missing_token");
    return;
  }

  signInWithCustomToken(auth, token)
    .then(() => navigate(returnTo, { replace: true }))
    .catch(() => navigate("/auth?error=discord_failed"));
}, []);
```

**Routing update (`web/src/App.jsx`):**
```jsx
<Route path="/auth/discord/finish" element={<DiscordFinishPage />} />
```

Note: This route should NOT be wrapped in `RedirectWhenSignedIn` since it needs to complete the sign-in.

## Email Handling

### Decision: Verified email is REQUIRED for Discord login (new account only)

**Email is required for all accounts.** Discord OAuth **login** will fail if Discord does not provide a verified email address. This ensures:
- Compatibility with the UUID migration plan (see `docs/uuid_migration_plan.md`)
- All Firestore rules that depend on `userEmail()` continue to work
- Email-based pending invites work for all users
- Friend requests, group invites, and scheduler invites function correctly

**If Discord does not provide a verified email, the login callback must:**
1. Reject the login attempt
2. Redirect to `/auth?error=email_required`
3. Display: "Discord login requires a verified email address. Please verify your email in Discord settings, or use Google or email/password sign-in."

**The current Firestore rules depend heavily on email:**
- Group membership checks use `userEmail() in data.members`
- Scheduler participant checks use `userEmail() in data.participants`
- Pending invite checks use `userEmail() in data.pendingInvites`
- Friend requests use `request.auth.token.email`

### Discord email scope behavior

Per the [discord-oauth2-example](https://github.com/discord/discord-oauth2-example):
- `identify` scope: `/users/@me` returns `id`, `username`, `global_name`, and other basic fields.
- `identify email` scope: additionally returns the `email` field.
  
Treat `verified` as optional; if it is not present, assume the email is unverified.

### Verification requirement

**Only use Discord email if `verified: true` when the field is present.**

Discord allows unverified email addresses. Using unverified emails could enable account hijacking (attacker sets victim's email on their Discord, then logs in to claim the account).

```javascript
// In callback:
const discordEmail = userJson.verified === true ? userJson.email : null;
```

### Firebase Auth emailVerified

The Firestore rules `isEmailVerified()` function (line 8-11) checks:
```javascript
request.auth.token.email_verified == true || request.auth.token.firebase.sign_in_provider == 'google.com'
```

Custom token users don't satisfy either condition by default. **We must set `emailVerified` in Firebase Auth** when creating/updating users from Discord **during the login flow**:

```javascript
// When creating new user:
const userRecord = await admin.auth().createUser({
  uid: generatedUid,  // or let Firebase generate
  email: discordEmail,
  emailVerified: userJson.verified === true,  // Treat missing/false as unverified
  displayName: userJson.global_name || userJson.username
});

// When updating existing user with Discord email:
await admin.auth().updateUser(uid, {
  email: discordEmail,
  emailVerified: userJson.verified === true
});
```

### Email collision handling

When Discord login provides an email and `verified: true` that matches an existing user:

1. **If that user has no Discord linked:** Attach Discord to that account (auto-link).
2. **If that user has a different Discord linked:** Reject with error "This email is associated with another account that has a different Discord linked. Please log in with your existing method."

## Account Linking Rules

### Provider tracking (`users/{uid}.authProviders`)

Firebase Auth's `providerData` is unreliable for custom-token users (shows `providerId: "custom"`). Track providers explicitly in Firestore:

```javascript
users/{uid}: {
  authProviders: {
    discord: true,   // Set by Discord OAuth flows
    google: true,    // Set by ensureUserProfile when Google provider detected
    password: true   // Set by ensureUserProfile when password provider detected
  }
}
```

**Population strategy:**
1. **New Discord logins:** Set `authProviders.discord = true` in callback.
2. **Existing users:** Update `ensureUserProfile()` to sync `authProviders` from `user.providerData` on each login.
3. **Linking actions:** Update relevant flag when linking Google or adding password.

**DisplayName fallback for Discord users:**

Update `ensureUserProfile()` to use Discord profile info when available:
```javascript
// In ensureUserProfile, after fetching user doc:
const discordName = userData.discord?.globalName || userData.discord?.username;
const displayName = userData.displayName || publicData.displayName ||
  defaultDisplayName({ email, displayName: user.displayName }) ||
  discordName || "User";
```

This ensures Discord-only users without email get their Discord name instead of generic "User".

### Linking additional providers (Settings page)

| Provider | Current State | Action Needed |
|----------|---------------|---------------|
| Google | `linkGoogleAccount()` exists | Add UI, update `authProviders.google` |
| Password | Not implemented | Add `linkWithCredential(EmailAuthProvider.credential(email, password))` |

## Discord-based Invites (New Requirement)

### Identifier auto-detection (friend, questing group, scheduler invites)
Invites should accept **one input field** and auto-detect:
1. **Email** (standard email format) → email invite flow.
2. **Discord Username** (lowercase, 2–32 chars, letters/numbers/underscore/period; no leading/trailing or consecutive periods).

**Not supported:**
- **Discord User ID** (long numeric IDs) - users rarely know these; use username instead.
- **Legacy Discord tags** (`name#1234`) - reject with: **"Legacy Discord tags are no longer supported. Please use their current Discord username or email."**

If a Discord username does **not** resolve to a QS user, show: **"No Quest Scheduler user found with that Discord username. They may not have linked their Discord account. Try inviting by email instead."**

**Future extension:** The [Display Names and Usernames](./display-names-and-usernames.md) feature adds a fourth identifier type: **Quest Scheduler username** (`@username`). The `@` prefix is required to distinguish QS usernames from Discord usernames (Discord does not allow `@` in usernames). Without the `@` prefix, input like `magitf` is assumed to be a Discord username.

### Invite behavior by identifier type
- **Email input:** existing behavior (email invite + email notification). Works for non-registered users (creates pending invite).
- **Discord Username input:** resolve to a QS user via `usersPublic.discordUsernameLower`. **Only works if the user already has a QS account with Discord linked.** If found, treat as normal invite (in-app notification + email). If not found, reject with error message.

### Abuse mechanics (applies to email + Discord identifier invites)
- **Blacklist input:** accept email or Discord username (auto-detected). If a username is provided, resolve to a QS user before blocking. (Future: [Display Names and Usernames](./display-names-and-usernames.md) adds `@username` for QS usernames.)
- **Blocked-user enforcement:** check blocks by **email** and by **discordUserId** (when linked). (Future: also check by `qsUsernameLower`.)
- **Invite allowance penalty:** apply the penalty **only** when the blocked user had **already sent** a pending request to the blocker (friend, poll, or group invite) at the time of blocking. Blocking without prior requests does **not** penalize the blocked user.
- **Black-hole behavior:** once blocked, new friend/group/poll requests from that user should be silently ignored (no notifications or emails).
- **No auto-removals:** blocking does not remove existing friendships, group memberships, or poll participation (manual cleanup only).

### Shared identifier validation (required)
All invite and block forms must use a **single shared identifier parser + validator** to prevent inconsistent rules across the app.

## Display Name + Privacy (New Requirement)

### Display name rules
- **Discord login:** set `displayName` to `global_name` if present, else `username`.
- **Google login:** set `displayName` to the Google profile name (never email).
- **Email/password login:** leave `displayName` unset. UI falls back to email until user edits.

### UI display rules (Phase 2)
- Prefer `displayName` where possible, but defer final identifier formatting to Phase 3.
- Do **not** prepend `@` or show discriminator numbers; render plain text.

### Unlink safety rule

**Constraint:** User may only unlink Discord if `authProviders.google === true` OR `authProviders.password === true`.

**Backend enforcement (`functions/src/discord/unlink.js`):**
```javascript
// Before unlinking:
const userDoc = await admin.firestore().collection("users").doc(uid).get();
const providers = userDoc.data()?.authProviders || {};
const hasOtherProvider = providers.google === true || providers.password === true;

if (!hasOtherProvider) {
  throw new HttpsError(
    "failed-precondition",
    "Cannot unlink Discord: no other login method available. Link Google or set a password first."
  );
}
```

**Frontend enforcement (`SettingsPage.jsx`):**
```jsx
const canUnlinkDiscord = authProviders?.google || authProviders?.password;

<button
  disabled={!canUnlinkDiscord || discordUnlinking}
  title={canUnlinkDiscord ? "" : "Add another login method before unlinking Discord"}
>
  Unlink Discord
</button>
{!canUnlinkDiscord && (
  <p className="text-xs text-amber-500">
    Link Google or add a password before unlinking Discord.
  </p>
)}
```

## Data Model Updates

### New field: `users/{uid}.authProviders`

```javascript
{
  discord: boolean,  // true if Discord linked
  google: boolean,   // true if Google provider in Firebase Auth
  password: boolean  // true if password provider in Firebase Auth
}
```

### Updated: `oauthStates/{state}`

```javascript
// Existing (link flow):
{
  uid: string,
  provider: "discord",
  createdAt: Timestamp,
  expiresAt: Timestamp
}

// New (login flow):
{
  provider: "discord",  // Required for callback guard compatibility
  intent: "login",
  returnTo: string,
  createdAt: Timestamp,
  expiresAt: Timestamp
}
```

**Note:** The existing callback (line 75) checks `provider !== "discord"`, so login states must include `provider: "discord"` to pass validation.

### New fields: `usersPublic/{uid}` for Discord identity resolution
```javascript
{
  discordUsername: string | null,        // original case from Discord
  discordUsernameLower: string | null    // lowercase for invite/block lookups
}
```

**Note:** `discordGlobalName` is not stored in usersPublic. During Discord login, we use `global_name || username` to pre-fill the user's `displayName` field, but we don't persist the Discord global name separately.

### New invite fields (dual identifier)

#### Friend requests (`friendRequests/{id}`)
```javascript
{
  fromEmail: string | null,
  toEmail: string | null,
  fromDiscordUserId: string | null,
  toDiscordUserId: string | null,
  // existing fields...
}
```

#### Questing groups (`questingGroups/{groupId}`)
No new invite fields needed. Discord username invites resolve to existing users only.

#### Schedulers (`schedulers/{id}`)
No new invite fields needed. Discord username invites resolve to existing users only.

### Blocked users (extends UUID migration schema)
```javascript
// blockedUsers/{uid}/blockedUsers/{blockId}
{
  // From UUID migration:
  blockedUserId: string | null,  // Primary identifier (UID if known)
  email: string | null,          // For lookup and non-registered users

  // Added by this feature:
  discordUsernameLower: string | null,  // For Discord username blocking

  // Future: qsUsernameLower (added by display-names-and-usernames feature)
}
```

### Firestore rules update

Add `authProviders` to protected fields in `users/{uid}`:

```javascript
// In isValidUserUpdate():
let protectedFields = ['inviteAllowance', 'suspended', 'suspendedAt', 'discord', 'authProviders'];
```

## UI/Branding Requirements

Per [Discord Brand Guidelines](https://discord.com/branding):

**Allowed:**
- Use official Discord logo/wordmark from branding page (unmodified).
- Use Blurple (#5865F2) as accent color on integration buttons.
- Indicate "Sign in with Discord" or "Connect Discord".

**Forbidden:**
- Modify, recolor, or distort the Discord logo.
- Imitate Discord's overall look and feel (colors, typography, layout).
- Imply official partnership ("Official Discord Login", "Discord Verified").

### Button implementation

**Option A: Blurple background with white text (recommended)**
```jsx
<button
  onClick={handleDiscordLogin}
  className="flex items-center gap-2 rounded-full bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752C4]"
>
  <img src="/assets/discord-mark-white.svg" alt="" className="h-5 w-5" />
  Sign in with Discord
</button>
```
*Requires white Discord logo (download from Discord branding site).*

**Option B: White/light background with Blurple logo**
```jsx
<button
  onClick={handleDiscordLogin}
  className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
>
  <img src="/assets/Discord-Symbol-Blurple.svg" alt="" className="h-5 w-5" />
  Sign in with Discord
</button>
```

### Available assets

Located in `web/public/assets/`:

| File | Description | Use Case |
|------|-------------|----------|
| `Discord-Symbol-Blurple.svg` | Discord icon only (Blurple #5865F2) | Buttons on light backgrounds |
| `Discord-Symbol-Blurple.png` | Discord icon only (Blurple, PNG) | Fallback if SVG issues |
| `Discord-Logo-With-Text-Blurple.svg` | Icon + "Discord" text (Blurple) | Marketing pages, larger displays |
| `Discord-Logo-With-Text-Blurple.png` | Icon + "Discord" text (Blurple, PNG) | Fallback if SVG issues |

For white logos on Blurple backgrounds, download from [discord.com/branding](https://discord.com/branding).

## Error Handling

| Scenario | Response |
|----------|----------|
| State missing/invalid/expired | Redirect to `/auth?error=invalid_state` |
| Discord token exchange failed | Redirect to `/auth?error=discord_failed` |
| Discord user fetch failed | Redirect to `/auth?error=discord_failed` |
| **Discord has no verified email** | Redirect to `/auth?error=email_required` |
| Discord already linked to different user | Redirect to `/auth?error=discord_in_use` |
| Email collision with different Discord | Redirect to `/auth?error=email_conflict` |
| Custom token mint failed | Redirect to `/auth?error=server_error` |
| Frontend `signInWithCustomToken` failed | Show toast, stay on `/auth` |

Display user-friendly messages on `/auth` page based on `error` query param.

**Error messages:**
- `email_required`: "Discord login requires a verified email address. Please verify your email in Discord settings, or use Google or email/password sign-in."

## Security Considerations

1. **CSRF protection:** Always use and validate `state` parameter.
2. **State single-use:** Delete state record immediately after validation.
3. **State TTL:** 10-minute expiration prevents stale state attacks.
4. **Secrets server-side:** Discord client secret never exposed to frontend.
5. **Open redirect prevention:** Whitelist `returnTo` paths (must start with `/` and not contain `//`).
6. **Email verification:** Only trust Discord emails where `verified: true` when the flag is present.
7. **Token in URL:** Custom token in redirect URL is short-lived and single-use. Alternative: store token in server session and retrieve via authenticated call.

## Implementation Checklist

### Phase 1: Backend
- [ ] Add `discordOAuthLoginStart` HTTP function.
- [ ] Modify `discordOAuthCallback` to handle `intent: "login"`.
- [ ] Add custom token minting with `admin.auth().createCustomToken()`.
- [ ] Add `authProviders` field updates in callback.
- [ ] Update `discordUnlink` with safety check.
- [ ] Update Firestore rules for `authProviders` protection.
- [ ] Extend invite functions to accept email or Discord username (friends, groups, schedulers).
- [ ] Update invite abuse-limit checks to include Discord username invites.
- [ ] Update blocked-user checks to resolve by email **and** discordUserId for Discord-based invites.

### Phase 2: Frontend Auth
- [ ] Create `DiscordFinishPage.jsx` component.
- [ ] Add `/auth/discord/finish` route to `App.jsx`.
- [ ] Add `signInWithCustomToken` to `web/src/lib/auth.js`.
- [ ] Add Discord login button to `AuthPage.jsx`.
- [ ] Add error display for Discord auth failures.
- [ ] Set displayName on Discord login (global_name → username).
- [ ] Ensure Google login always sets displayName from Google profile name (never email).

### Phase 3: Settings Updates
- [ ] Update `ensureUserProfile` to populate `authProviders` from Firebase `providerData`.
- [ ] Update `ensureUserProfile` to use Discord `global_name`/`username` as displayName fallback (instead of email or "User").
- [ ] **Extend existing "Sign-in methods" section** (lines 447-474) to include Discord status using `authProviders.discord` from Firestore (since `providerData` won't show Discord for custom-token users).
- [ ] Move Discord link/unlink UI from separate Discord section into unified Sign-in methods section.
- [ ] Add unlink safety check UI (disable button, show hint).
- [ ] Add "Link Google" action if not linked.
- [ ] Add "Add Password" action if not set.
- [ ] Update invite UI fields to auto-detect email / Discord username.
- [ ] Update all user-facing labels to prefer `displayName` over email.
- [ ] Update blacklist input to accept email or Discord username (auto-detected).

### Phase 4: Testing & Polish
- [ ] Test: Discord login creates new account.
- [ ] Test: Discord login finds existing linked account.
- [ ] Test: Discord login auto-links via email match when `verified: true`.
- [ ] Test: Discord login rejected when Discord has no verified email (shows `email_required` error).
- [ ] Test: Email collision with different Discord shows error.
- [ ] Test: Unlink blocked when Discord is only provider.
- [ ] Test: Unlink allowed after adding Google/password.
- [x] Download and add official Discord logo asset (Blurple versions in `web/public/assets/`).
- [ ] Test: Invite by Discord username resolves to existing user and sends email.
- [ ] Test: Invite by Discord username for non-linked user shows error message.
- [ ] Test: Legacy Discord tag (`name#1234`) is rejected with helpful error.
- [ ] Test: Blacklist by Discord username blocks Discord-based invites and applies invite-allowance penalty.

## Decisions Made

1. **Email requirement: DECIDED - Option A (Require verified email)**
   - Discord OAuth login requires Discord to provide a verified email address
   - If no verified email, login fails with helpful error message
   - This maintains compatibility with UUID migration plan and existing Firestore rules
   - See "Email Handling" section for implementation details

## Open Questions

1. **CTA priority:** Should Discord be primary (above Google) or secondary on `/auth`?

2. **Auto-link confirmation:** When Discord email matches existing account, auto-link silently or show confirmation?

3. **Token delivery:** Keep token in URL redirect, or use server session + fetch pattern for extra security?

4. **Existing link flow update:** Should we also add `intent: "link"` to existing `discordOAuthStart` state records for consistency, or leave the existing flow unchanged?
### Linking flow does NOT require Discord email

If a user is already signed in (Google or email/password) and links Discord:
- **Do not require Discord email**.
- The link flow can remain `identify`-only.
- The user's existing email stays authoritative.
This preserves the ability to link Discord even if the Discord account has no verified email.
