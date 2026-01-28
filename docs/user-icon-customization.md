# User Icon Customization

## Overview

This document describes how Quest Scheduler handles user profile pictures (avatars) across different authentication providers and custom uploads.

## Current State

- **Google users**: Firebase Auth stores `photoURL` from Google at 96x96px resolution and we sync it into `users`/`usersPublic`.
- **Email/password users**: No avatar, UI shows placeholder letter icon.
- **Discord users**: Discord login/linking is supported, but we do **not** currently persist Discord avatars. The UI still reads from `usersPublic.photoURL`.

## Avatar Sources (Priority Order)

**When `avatarSource` is set**, use the requested source. **Otherwise** fall back to this priority order:

1. **Custom upload** (user-provided)
2. **Discord avatar** (if linked)
3. **Google avatar** (if linked)
4. **Default letter avatar** (fallback)

**Important (current app behavior)**: The UI reads `usersPublic.photoURL` today. To add custom/Discord avatars without a UI refactor, update `photoURL` whenever a higher-priority source is chosen or refreshed. If you add per-source fields (`customAvatarUrl`, `discordAvatarHash`, etc.), the avatar resolver must consult those fields or write the resolved URL back to `photoURL`.

---

## Discord Avatar Integration

### How It Works

When a user authenticates via Discord OAuth2 with the `identify` scope, the API returns:

```json
{
  "id": "123456789012345678",
  "username": "questmaster",
  "avatar": "a1b2c3d4e5f6...",  // avatar hash (null if no custom avatar)
  "global_name": "Quest Master"
}
```

### Constructing Avatar URLs

**Custom avatar:**
```
https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.{ext}?size=256
```
Where `ext` is `gif` if the hash starts with `a_` (animated), otherwise `png` (or `webp`).

**Default avatar (when `avatar` is null):**
```
https://cdn.discordapp.com/embed/avatars/{index}.png
```
Where `index = (user_id >> 22) % 6` (values 0-5, each a different color)

### Supported Sizes

Discord CDN supports: 16, 32, 64, 128, 256, 512, 1024

### Staleness Concern

When a user changes their Discord avatar, the old URL returns **404**. Solutions:

| Approach | Pros | Cons |
|----------|------|------|
| Store URL directly | Simple | Breaks when user changes avatar |
| Store `discordUserId` + `avatarHash` | Can detect staleness | Requires re-fetching on login |
| Copy to Firebase Storage | Never stale | Storage cost, sync complexity |

**Recommendation**: Store `discordUserId` and `discordAvatarHash` separately. On each Discord login, update the hash if changed. Construct URL dynamically.

### Implementation

**User document fields:**
```json
{
  "discordUserId": "123456789012345678",
  "discordAvatarHash": "a1b2c3d4e5f6...",
  "avatarSource": "discord"
}
```

**On Discord login/link:**
1. Fetch user object from Discord API
2. Compare `avatar` hash with stored `discordAvatarHash`
3. If different (or new), update hash and recompute the avatar URL
4. If `avatarSource` is `discord` (or not set), update `photoURL` to the Discord avatar URL

---

## Google Avatar Integration

### Current Behavior

Firebase Auth provides `user.photoURL` from Google sign-in at 96x96px.

### Higher Resolution

Google photo URLs contain a size parameter that can be modified:
```
Original:  https://lh3.googleusercontent.com/.../photo.jpg?sz=96
Higher:    https://lh3.googleusercontent.com/.../photo.jpg?sz=256
```

Or for URLs with `s96-c` format:
```
Original:  https://lh3.googleusercontent.com/.../s96-c/photo.jpg
Higher:    https://lh3.googleusercontent.com/.../s256-c/photo.jpg
```

### Sync Concern

Firebase Auth only sets `photoURL` on initial sign-up. If user changes their Google profile picture, it doesn't auto-update in Firebase.

**Recommendation**: On each Google login, check `user.providerData[0].photoURL` and update `user.photoURL` if different.
Use the provider entry where `providerId === "google.com"` rather than relying on index 0.

---

## Custom Upload

### Why Support This?

- Email/password users have no provider avatar
- Users may want a different image than their Google/Discord avatar
- Provides consistent avatar experience across all auth methods

### Storage Structure

```
Firebase Storage:
  profiles/
    {userId}/
      avatar.jpg       # Current avatar
      avatar_thumb.jpg # 64x64 thumbnail (optional)
```

### Size & Format Limits

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Max file size | 2 MB | Balance quality vs storage cost |
| Min dimensions | 64x64 | Avoid pixelation |
| Max dimensions | 512x512 | Consistent with client resizing |
| Allowed formats | JPEG, PNG, WebP | Standard web formats |

### Security Rules

```javascript
// Firebase Storage rules
match /profiles/{userId}/avatar.{ext} {
  allow read: if true;  // Avatars are public
  allow write: if request.auth != null
               && request.auth.uid == userId
               && request.resource.size < 2 * 1024 * 1024
               && request.resource.contentType.matches('image/(jpeg|png|webp)');
}

match /profiles/{userId}/avatar_thumb.{ext} {
  allow read: if true;
  allow write: if request.auth != null
               && request.auth.uid == userId
               && request.resource.size < 2 * 1024 * 1024
               && request.resource.contentType.matches('image/(jpeg|png|webp)');
}
```

### Client-Side Processing

Before upload, client should:
1. Validate file type (JPEG, PNG, WebP)
2. Validate file size (< 2 MB)
3. Resize to max 512x512 (reduces storage, ensures consistency)
4. Generate thumbnail at 64x64 for voting bubbles (optional)

### Upload Flow

1. User selects image in Settings
2. Client validates size/type
3. Client resizes if needed (using canvas or library)
4. Upload to `profiles/{userId}/avatar.{ext}`
5. Get download URL
6. Update user document: `{ customAvatarUrl: "..." }`
7. If `avatarSource` is `custom` (or not set), update `photoURL` to the custom URL

---

## Avatar Resolution Logic

```javascript
function getAvatarUrl(user) {
  const source = user.avatarSource || "auto";

  if (source === "custom" && user.customAvatarUrl) return user.customAvatarUrl;
  if (source === "discord" && user.discordAvatarHash && user.discordUserId) {
    return buildDiscordAvatarUrl(user.discordUserId, user.discordAvatarHash, 256);
  }
  if (source === "google" && user.photoURL) return upgradeGooglePhotoUrl(user.photoURL, 256);

  // Auto priority
  if (user.customAvatarUrl) return user.customAvatarUrl;
  if (user.discordAvatarHash && user.discordUserId) {
    return buildDiscordAvatarUrl(user.discordUserId, user.discordAvatarHash, 256);
  }
  if (user.photoURL) return upgradeGooglePhotoUrl(user.photoURL, 256);
  return null; // UI renders letter fallback using displayName/username/email
}

function upgradeGooglePhotoUrl(url, size) {
  if (!url) return url;
  // Handle ?sz=N format
  if (url.includes('?sz=')) {
    return url.replace(/\?sz=\d+/, `?sz=${size}`);
  }
  // Handle /sN-c/ format
  return url.replace(/\/s\d+-c\//, `/s${size}-c/`);
}

function buildDiscordAvatarUrl(userId, avatarHash, size) {
  if (!userId || !avatarHash) return null;
  const isAnimated = String(avatarHash).startsWith("a_");
  const ext = isAnimated ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
}
```

---

## User Profile Document Schema

```json
{
  "email": "user@example.com",
  "displayName": "Alex Chen",
  "photoURL": "https://lh3.googleusercontent.com/...",  // From Firebase Auth

  // Custom upload
  "customAvatarUrl": "https://firebasestorage.googleapis.com/.../avatar.jpg",

  // Discord avatar (populated on Discord OAuth login)
  "discordUserId": "123456789012345678",
  "discordAvatarHash": "a1b2c3d4e5f6...",
  "avatarSource": "custom"
}
```

---

## Settings UI

### Avatar Section

```
┌─────────────────────────────────────────────────┐
│  Profile Picture                                │
│                                                 │
│  ┌──────┐  Current: Google                      │
│  │ [AV] │  Alex Chen                            │
│  └──────┘                                       │
│                                                 │
│  [ Upload custom image ]                        │
│                                                 │
│  ○ Use Google avatar                            │
│  ○ Use Discord avatar (if linked)              │
│  ● Use custom upload                            │
│                                                 │
│  [ Remove custom image ]                        │
└─────────────────────────────────────────────────┘
```

### Behaviors

- **Upload**: Opens file picker, validates, uploads, sets as active
- **Radio selection**: Changes which avatar source is used (stored as `avatarSource: 'google' | 'discord' | 'custom'`)
- **Remove**: Deletes from Storage, clears `customAvatarUrl`, falls back to next priority

---

## Implementation Phases

### Phase 1: Discord Avatar on Login
- Store `discordUserId` and `discordAvatarHash` on Discord OAuth
- Update hash if user's Discord avatar changed
- If `avatarSource` is `discord` (or not set), update `photoURL` to the Discord avatar URL

### Phase 2: Google Avatar Sync
- On Google login, sync `photoURL` from provider data (`providerId === "google.com"`)
- Upgrade resolution to 256px when displaying

### Phase 3: Custom Upload
- Add upload UI in Settings
- Implement Firebase Storage rules
- Client-side resize before upload
- Store `customAvatarUrl` in user document
- If `avatarSource` is `custom` (or not set), update `photoURL` to the custom URL

### Phase 4: Avatar Source Selection
- Add radio buttons in Settings to choose active source
- When `avatarSource` is not set, respect priority: custom > discord > google > letter

---

## References

- [Discord CDN Image Formatting](https://discord.com/developers/docs/reference#image-formatting)
- [Firebase Storage Security Rules](https://firebase.google.com/docs/storage/security)
- [Discord OAuth2 User Object](https://discord.com/developers/docs/resources/user#user-object)
