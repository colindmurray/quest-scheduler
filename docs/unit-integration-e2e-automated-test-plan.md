# Automated Testing Plan

## Overview

This document outlines a comprehensive automated testing strategy for Quest Scheduler, covering unit tests, integration tests, and end-to-end (E2E) tests. The goal is to ensure reliability across all key user journeys while maintaining fast feedback loops during development.

## Current State

### Existing Infrastructure
- **Test Framework:** Vitest 3.2.4 (installed)
- **Language:** JavaScript/JSX only (no TypeScript)
- **Existing Tests:** 4 data layer test files in `web/src/lib/data/`:
  - `users.test.js` - tests for `findUserIdByEmail`
  - `friends.test.js` - tests for `createFriendRequest`, `acceptFriendRequest`, `acceptFriendInviteLink`
  - `questingGroups.test.js` - tests for `inviteMemberToGroup` with success, blocked, and missing invitee cases
  - `notifications.test.js` - tests for `ensureGroupInviteNotification` and session notifications
- **No Vitest config file** - uses defaults (works but lacks jsdom environment, setup file, coverage config)
- **No coverage reporting** configured
- **No React Testing Library** installed (required for component tests)
- **Firebase Storage rules** exist (`storage.rules`) for profile avatar uploads
- **Discord OAuth + bot flows** implemented in Cloud Functions (`functions/src/discord/`)
- **UID-only membership** now drives schedulers + questing groups (participants/members email arrays deprecated)
- **New data modules** exist for Discord, usernames, blocks, poll invites, and identifier parsing

### Gaps
- ❌ No component tests
- ❌ No hook tests (10 hooks exist, 0 tested)
- ❌ No Cloud Functions tests (Discord OAuth, bot vote handlers, nudge, link codes, unlink, roles)
- ❌ No Firestore security rules tests (Firestore + Storage)
- ❌ No E2E tests
- ❌ No integration tests with Firebase Emulator (Auth/Firestore/Storage)
- ❌ No Firebase Emulator config in firebase.json
- ❌ No tests for `identifiers.js` (detectIdentifierType, resolveIdentifier)
- ❌ No tests for `identity.js` (buildPublicIdentifier)
- ❌ No tests for `auth.js` (signInWithGoogle, signInWithDiscordToken, etc.)
- ❌ No tests for avatar source selection + storage upload constraints
- ❌ No tests for migration script dry-run vs cleanup modes
- ❌ Functions package missing vitest + firebase-functions-test dependencies

## Recommended Testing Stack

### Unit & Component Tests
| Tool | Purpose | Why |
|------|---------|-----|
| [Vitest](https://vitest.dev/) | Test runner | Already installed, Vite-native, fast, Jest-compatible |
| [React Testing Library](https://testing-library.com/react) | Component testing | Tests user behavior, not implementation |
| [MSW (Mock Service Worker)](https://mswjs.io/) | API mocking | Intercepts network requests for isolated tests |

### Integration Tests
| Tool | Purpose | Why |
|------|---------|-----|
| [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite) | Local Firebase | Test against real Firebase behavior without cloud costs |
| [@firebase/rules-unit-testing](https://firebase.google.com/docs/rules/unit-tests) | Security rules testing | Official Firebase library for rules testing |
| Firebase Storage Emulator | Avatar uploads + storage rules | Ensures profile image constraints are enforced |

### E2E Tests
| Tool | Purpose | Why |
|------|---------|-----|
| [Playwright](https://playwright.dev/) | Browser automation | Fast, reliable, supports parallel execution |
| Vitest Browser Mode | Component E2E | Real browser environment with Playwright provider |

### Cloud Functions Tests
| Tool | Purpose | Why |
|------|---------|-----|
| Vitest | Test runner | Consistency with frontend |
| [firebase-functions-test](https://firebase.google.com/docs/functions/unit-testing) | Functions testing | Official Firebase testing SDK |
| Firebase Emulator | Integration testing | Test functions with real Firestore/Auth |

## Test Categories & Strategy

### Test Pyramid

```
                    ┌─────────┐
                    │   E2E   │  ~10% - Critical user journeys
                    │  Tests  │  Slow, expensive, high confidence
                   ─┴─────────┴─
                  ┌─────────────┐
                  │ Integration │  ~20% - Component interactions
                  │    Tests    │  Medium speed, real Firebase
                 ─┴─────────────┴─
                ┌─────────────────┐
                │   Unit Tests    │  ~70% - Functions, hooks, utils
                │                 │  Fast, isolated, mocked deps
               ─┴─────────────────┴─
```

### Coverage Goals

| Category | Target Coverage | Priority |
|----------|-----------------|----------|
| Data Layer (`lib/data/`, `lib/identifiers.js`, `lib/identity.js`) | 90% | P0 |
| Auth Helpers (`lib/auth.js`) | 90% | P0 |
| Custom Hooks (`hooks/`) | 80% | P1 |
| Firestore + Storage Rules | 100% | P0 |
| Cloud Functions - Discord (`functions/src/discord/`) | 80% | P1 |
| Cloud Functions - Legacy callables (`functions/src/legacy.js`) | 80% | P1 |
| UI Components (Settings + Auth) | 60% | P2 |
| E2E Critical Paths (Discord + UID flows) | 100% | P0 |

## Directory Structure

Files marked with ✓ exist; others are planned.

```
web/
├── src/
│   ├── __tests__/                    # Integration tests (planned)
│   │   ├── setup.js                  # Test setup (Firebase emulator connection)
│   │   └── integration/
│   │       ├── auth.integration.test.js
│   │       ├── scheduler.integration.test.js
│   │       └── friends.integration.test.js
│   ├── lib/
│   │   ├── data/
│   │   │   ├── users.js              ✓
│   │   │   ├── users.test.js         ✓ Co-located unit tests (existing)
│   │   │   ├── friends.js            ✓
│   │   │   ├── friends.test.js       ✓ (existing)
│   │   │   ├── questingGroups.js     ✓
│   │   │   ├── questingGroups.test.js ✓ (existing)
│   │   │   ├── notifications.js      ✓
│   │   │   ├── notifications.test.js ✓ (existing)
│   │   │   ├── pollInvites.js        ✓
│   │   │   ├── pollInvites.test.js   # (planned)
│   │   │   ├── blocks.js             ✓
│   │   │   ├── blocks.test.js        # (planned)
│   │   │   ├── discord.js            ✓
│   │   │   ├── discord.test.js       # (planned)
│   │   │   ├── usernames.js          ✓
│   │   │   └── usernames.test.js     # (planned)
│   │   ├── auth.js                   ✓
│   │   ├── auth.test.js              # (planned)
│   │   ├── identifiers.js            ✓
│   │   ├── identifiers.test.js       # (planned)
│   │   ├── identity.js               ✓
│   │   └── identity.test.js          # (planned)
│   ├── hooks/
│   │   ├── useUserSettings.js        ✓
│   │   ├── useUserSettings.test.js   # (planned)
│   │   ├── useUserProfiles.js        ✓
│   │   ├── useUserProfiles.test.js   # (planned)
│   │   ├── useQuestingGroups.js      ✓
│   │   ├── useQuestingGroups.test.js # (planned)
│   │   ├── usePollInvites.js         ✓
│   │   ├── usePollInvites.test.js    # (planned)
│   │   ├── useBlockedUsers.js        ✓
│   │   ├── useBlockedUsers.test.js   # (planned)
│   │   ├── useFirestoreCollection.js ✓
│   │   ├── useFirestoreDoc.js        ✓
│   │   ├── useFriends.js             ✓
│   │   ├── useNotifications.js       ✓
│   │   └── useNotificationSync.js    ✓
│   └── components/
│       └── ui/
│           ├── button.jsx
│           └── button.test.jsx       # (planned)
├── e2e/                              # E2E tests (planned - Playwright)
│   ├── playwright.config.js
│   ├── auth.spec.js
│   ├── discord.spec.js
│   ├── settings.spec.js
│   ├── scheduler.spec.js
│   ├── friends.spec.js
│   └── fixtures/
│       └── test-users.js
└── vitest.config.js                  # (planned - currently using defaults)

functions/
├── src/
│   ├── legacy.js                     ✓
│   ├── legacy.test.js                # (planned)
│   ├── discord/
│   │   ├── oauth.js                  ✓
│   │   ├── oauth.test.js             # (planned)
│   │   ├── worker.js                 ✓
│   │   ├── worker.test.js            # (planned)
│   │   ├── link-codes.js             ✓
│   │   ├── link-codes.test.js        # (planned)
│   │   ├── nudge.js                  ✓
│   │   ├── nudge.test.js             # (planned)
│   │   ├── unlink.js                 ✓
│   │   ├── ingress.js                ✓
│   │   ├── roles.js                  ✓
│   │   ├── poll-card.js              ✓
│   │   ├── discord-client.js         ✓
│   │   ├── link-utils.js             ✓
│   │   ├── error-messages.js         ✓
│   │   └── config.js                 ✓
│   └── __tests__/
│       └── integration/
│           └── calendar.integration.test.js  # (planned)
├── test/
│   └── rules/
│       ├── firestore.rules.test.js   # (planned)
│       └── storage.rules.test.js     # (planned)
├── vitest.config.js                  # (planned - vitest not yet installed)
└── package.json                      ✓ (needs vitest + firebase-functions-test)

```

## Configuration Files

### Vitest Configuration (web/vitest.config.js)

```javascript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.js'],
    include: ['**/*.test.{js,jsx}'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        '**/*.config.*',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Playwright Configuration (web/e2e/playwright.config.js)

```javascript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Test Setup (web/src/__tests__/setup.js)

**Note:** This file does not exist yet. Create it when setting up React Testing Library.

```javascript
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Firebase modules globally
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithCustomToken: vi.fn(),  // Used for Discord login
  signInWithCredential: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: {
    credentialFromResult: vi.fn(),
    credential: vi.fn(),
  },
  EmailAuthProvider: { credential: vi.fn() },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  linkWithCredential: vi.fn(),
  linkWithPopup: vi.fn(),
  fetchSignInMethodsForEmail: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  doc: vi.fn((_, collectionName, id) => ({ id, __collection: collectionName })),
  documentId: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
  arrayUnion: vi.fn((val) => ({ __arrayUnion: val })),
  arrayRemove: vi.fn((val) => ({ __arrayRemove: val })),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));

// Mock crypto.randomUUID for ID generation
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
});

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.location for URL handling
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    origin: 'http://localhost:5173',
    href: 'http://localhost:5173/',
    pathname: '/',
    search: '',
  },
});
```

## Unit Tests

### Data Layer Tests

**Note:** The current `web/src/lib/data/schedulers.js` only exports Firestore refs (`schedulerRef`, `schedulerSlotsRef`, `schedulerVotesRef`). Scheduler CRUD operations are performed inline in components like `CreateSchedulerPage.jsx` and `SchedulerPage.jsx`. Tests should focus on modules that have exportable logic.

#### Pattern: Test file co-located with source

```javascript
// web/src/lib/data/users.test.js (existing pattern - extend this)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDoc, getDocs, query, where, collection } from 'firebase/firestore';
import { findUserIdByEmail } from './users';

vi.mock('firebase/firestore');
vi.mock('../firebase', () => ({
  db: {},
}));

describe('users data layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findUserIdByEmail', () => {
    it('returns user ID when found', async () => {
      const mockSnapshot = {
        empty: false,
        docs: [{ id: 'user-123' }],
      };
      vi.mocked(getDocs).mockResolvedValue(mockSnapshot);

      const result = await findUserIdByEmail('test@example.com');

      expect(result).toBe('user-123');
    });

    it('returns null when not found', async () => {
      const mockSnapshot = { empty: true, docs: [] };
      vi.mocked(getDocs).mockResolvedValue(mockSnapshot);

      const result = await findUserIdByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('normalizes email to lowercase', async () => {
      vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] });

      await findUserIdByEmail('TEST@EXAMPLE.COM');

      expect(where).toHaveBeenCalledWith('email', '==', 'test@example.com');
    });
  });
});
```

#### Testing identifiers.js (shared identifier parsing)

```javascript
// web/src/lib/identifiers.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectIdentifierType, resolveIdentifier } from './identifiers';
import { getDoc, getDocs, query, where, collection } from 'firebase/firestore';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('./firebase', () => ({ db: {} }));

describe('identifiers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectIdentifierType', () => {
    it('detects QS username with @ prefix', () => {
      const result = detectIdentifierType('@questmaster');
      expect(result).toEqual({ type: 'qsUsername', value: 'questmaster' });
    });

    it('detects email addresses', () => {
      const result = detectIdentifierType('user@example.com');
      expect(result).toEqual({ type: 'email', value: 'user@example.com' });
    });

    it('detects Discord usernames (no @ prefix)', () => {
      const result = detectIdentifierType('dragonslayer42');
      expect(result).toEqual({ type: 'discordUsername', value: 'dragonslayer42' });
    });

    it('rejects legacy Discord tags', () => {
      const result = detectIdentifierType('user#1234');
      expect(result).toEqual({ type: 'legacyDiscordTag', value: 'user#1234' });
    });

    it('rejects Discord IDs (numeric strings)', () => {
      const result = detectIdentifierType('123456789012345678');
      expect(result).toEqual({ type: 'discordId', value: '123456789012345678' });
    });

    it('keeps QS username case as typed (lowercased at resolve time)', () => {
      const result = detectIdentifierType('@QuestMaster');
      expect(result).toEqual({ type: 'qsUsername', value: 'QuestMaster' });
    });

    it('normalizes Discord usernames to lowercase', () => {
      const result = detectIdentifierType('DragonSlayer42');
      expect(result).toEqual({ type: 'discordUsername', value: 'dragonslayer42' });
    });
  });

  describe('resolveIdentifier', () => {
    it('resolves QS username via qsUsernames collection', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ uid: 'user-123' }),
      });
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ email: 'user@example.com', displayName: 'User' }),
      });

      const result = await resolveIdentifier('@questmaster');

      expect(result).toEqual({
        type: 'qsUsername',
        email: 'user@example.com',
        userId: 'user-123',
        userData: { email: 'user@example.com', displayName: 'User' },
      });
    });

    it('throws for unknown QS username', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => false,
      });

      await expect(resolveIdentifier('@nonexistent')).rejects.toThrow(
        /No user found with username/
      );
    });

    it('throws for legacy Discord tags', async () => {
      await expect(resolveIdentifier('user#1234')).rejects.toThrow(
        /Legacy Discord tags are no longer supported/
      );
    });

    it('throws for Discord IDs', async () => {
      await expect(resolveIdentifier('123456789012345678')).rejects.toThrow(
        /Discord IDs are not supported/
      );
    });
  });
});
```

#### Testing identity.js (public identifier display)

```javascript
// web/src/lib/identity.test.js
import { describe, it, expect } from 'vitest';
import { buildPublicIdentifier } from './identity';

describe('identity', () => {
  describe('buildPublicIdentifier', () => {
    it('returns existing publicIdentifier if present', () => {
      const result = buildPublicIdentifier({
        publicIdentifier: '@existing',
        publicIdentifierType: 'qsUsername',
        qsUsername: 'different',
      });
      expect(result).toBe('@existing');
    });

    it('formats QS username with @ prefix', () => {
      const result = buildPublicIdentifier({
        publicIdentifierType: 'qsUsername',
        qsUsername: 'questmaster',
      });
      expect(result).toBe('@questmaster');
    });

    it('returns Discord username without prefix', () => {
      const result = buildPublicIdentifier({
        publicIdentifierType: 'discordUsername',
        discordUsername: 'dragonslayer42',
      });
      expect(result).toBe('dragonslayer42');
    });

    it('falls back to email when type is email', () => {
      const result = buildPublicIdentifier({
        publicIdentifierType: 'email',
        email: 'user@example.com',
      });
      expect(result).toBe('user@example.com');
    });

    it('falls back to email when preferred type unavailable', () => {
      const result = buildPublicIdentifier({
        publicIdentifierType: 'discordUsername',
        discordUsername: null,
        email: 'user@example.com',
      });
      expect(result).toBe('user@example.com');
    });
  });
});
```

#### Additional data-layer modules to cover (new + updated flows)

- `web/src/lib/data/pollInvites.js`
  - `acceptPollInvite` adds `participantIds` (UIDs) and removes `pendingInvites` by email.
  - `removeParticipantFromPoll` removes `participantIds` and deletes votes by UID when available.
- `web/src/lib/data/blocks.js`
  - `blockUserByIdentifier`/`unblockUserByIdentifier` forwards identifier to callable and returns shape.
- `web/src/lib/data/discord.js`
  - `startDiscordLogin`/`startDiscordOAuth` returns `authUrl` for login vs linking.
  - `unlinkDiscordAccount` rejects when no alternate auth providers exist.
- `web/src/lib/data/usernames.js`
  - `registerQsUsername` rejects duplicates and lowercases input.
- `web/src/lib/data/users.js`
  - `ensureUserProfile` syncs displayName/photoURL/publicIdentifierType into `users` + `usersPublic`.
- `web/src/lib/identifiers.js`
  - `detectIdentifierType` rejects Discord IDs + legacy tags, accepts Discord usernames + QS usernames.
  - `resolveIdentifier` returns UID + email for existing users; throws for unknown Discord username.
- `web/src/lib/identity.js`
  - `buildPublicIdentifier` returns formatted identifier based on type preference (qsUsername → @username, discordUsername → plain, email fallback).

### Migration Script Tests

- `functions/scripts/migrate-uuid-identifiers.js`
  - Dry-run mode prints expected counts without writes.
  - `--commit` writes `participantIds`/`memberIds` without deleting legacy fields.
  - `--cleanup` removes `participants`/`members` when UID arrays are present.

#### Testing friends.js (existing tests can be extended)

```javascript
// web/src/lib/data/friends.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFriendRequest, acceptFriendRequest } from './friends';
import { setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { createFriendAcceptedNotification } from './notifications';
import { findUserIdByEmail } from './users';
import { resolveIdentifier } from '../identifiers';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_, __, id) => ({ id })),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'ts'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('firebase/functions', () => {
  const callable = vi.fn(async () => ({ data: { requestId: 'req_1' } }));
  return {
    getFunctions: vi.fn(),
    httpsCallable: vi.fn(() => callable),
  };
});

vi.mock('../firebase', () => ({ db: {} }));

vi.mock('./notifications', () => ({
  createFriendAcceptedNotification: vi.fn(),
  ensureFriendRequestNotification: vi.fn(),
  deleteNotification: vi.fn(),
  friendRequestNotificationId: vi.fn((requestId) => `friendRequest:${requestId}`),
}));

vi.mock('./users', () => ({
  findUserIdByEmail: vi.fn(),
}));

vi.mock('../identifiers', () => ({
  resolveIdentifier: vi.fn(async (input) => ({
    email: String(input || '').toLowerCase(),
    userId: null,
    userData: null,
  })),
}));

describe('friends data layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => 'req_1' });
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createFriendRequest', () => {
    it('creates request and sends notification when recipient exists', async () => {
      findUserIdByEmail.mockResolvedValue('user_2');
      resolveIdentifier.mockResolvedValue({
        email: 'friend@example.com',
        userId: 'user_2',
        userData: null,
      });

      await createFriendRequest({
        fromEmail: 'Sender@Example.com',
        toEmail: 'Friend@Example.com',
        fromDisplayName: 'Sender',
      });

      expect(setDoc).toHaveBeenCalled();
    });

    it('resolves identifier when toIdentifier provided', async () => {
      resolveIdentifier.mockResolvedValue({
        email: 'bob@example.com',
        userId: 'user_bob',
        userData: null,
      });

      await createFriendRequest({
        fromEmail: 'alice@example.com',
        toIdentifier: 'bob_discord',  // Discord username
        fromDisplayName: 'Alice',
      });

      expect(resolveIdentifier).toHaveBeenCalledWith('bob_discord');
    });
  });

  describe('acceptFriendRequest', () => {
    it('accepts pending request and notifies sender', async () => {
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          toEmail: 'friend@example.com',
          status: 'pending',
          fromUserId: 'sender_1',
          fromEmail: 'sender@example.com',
        }),
      });

      await acceptFriendRequest('req_1', {
        userId: 'friend_1',
        userEmail: 'friend@example.com',
      });

      expect(updateDoc).toHaveBeenCalled();
      expect(createFriendAcceptedNotification).toHaveBeenCalledWith('sender_1', {
        requestId: 'req_1',
        friendEmail: 'friend@example.com',
        friendUserId: 'friend_1',
      });
    });
  });
});
```

### Auth Helper Tests

```javascript
// web/src/lib/auth.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  signInWithPopup,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  GoogleAuthProvider,
} from 'firebase/auth';

// Must mock before importing auth.js
vi.mock('firebase/auth');
vi.mock('./firebase', () => ({
  auth: { currentUser: null },
}));

// Import after mocks
import {
  signInWithGoogle,
  registerWithEmailPassword,
  resetPassword,
} from './auth';

describe('auth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe('signInWithGoogle', () => {
    it('stores access token in sessionStorage on success', async () => {
      const mockResult = {
        user: { uid: 'user-123', email: 'test@example.com' },
      };
      // GoogleAuthProvider.credentialFromResult returns credential with accessToken
      vi.mocked(signInWithPopup).mockResolvedValue(mockResult);
      vi.mocked(GoogleAuthProvider.credentialFromResult).mockReturnValue({
        accessToken: 'google-token-123',
      });

      await signInWithGoogle();

      expect(sessionStorage.getItem('googleAccessToken')).toBe('google-token-123');
    });

    it('returns user on success', async () => {
      const mockUser = { uid: 'user-123', email: 'test@example.com' };
      vi.mocked(signInWithPopup).mockResolvedValue({ user: mockUser });
      vi.mocked(GoogleAuthProvider.credentialFromResult).mockReturnValue({
        accessToken: 'token',
      });

      const result = await signInWithGoogle();

      expect(result).toEqual(mockUser);
    });

    it('throws on popup closed by user', async () => {
      vi.mocked(signInWithPopup).mockRejectedValue({
        code: 'auth/popup-closed-by-user',
      });

      await expect(signInWithGoogle()).rejects.toMatchObject({
        code: 'auth/popup-closed-by-user',
      });
    });
  });

  describe('signInWithDiscordToken', () => {
    it('throws when token missing', async () => {
      await expect(signInWithDiscordToken()).rejects.toThrow('Missing Discord sign-in token.');
    });

    it('signs in with custom token', async () => {
      const mockUser = { uid: 'user-123', email: 'test@example.com' };
      vi.mocked(signInWithCustomToken).mockResolvedValue({ user: mockUser });

      const result = await signInWithDiscordToken('discord-token-123');

      expect(signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), 'discord-token-123');
      expect(result).toEqual(mockUser);
    });
  });

  describe('registerWithEmailPassword', () => {
    it('sends verification email after registration', async () => {
      const mockUser = { uid: 'user-123', email: 'test@example.com', displayName: null };
      vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
        user: mockUser,
      });
      vi.mocked(sendEmailVerification).mockResolvedValue(undefined);

      await registerWithEmailPassword('test@example.com', 'password123');

      expect(sendEmailVerification).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({ url: expect.any(String) })
      );
    });

    it('normalizes email to lowercase', async () => {
      const mockUser = { uid: 'user-123', email: 'test@example.com' };
      vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
        user: mockUser,
      });

      await registerWithEmailPassword('TEST@EXAMPLE.COM', 'password123');

      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'password123'
      );
    });
  });

  describe('resetPassword', () => {
    it('sends reset email for password-based accounts', async () => {
      vi.mocked(fetchSignInMethodsForEmail).mockResolvedValue(['password']);
      vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);

      await resetPassword('test@example.com');

      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        expect.objectContaining({ url: expect.any(String) })
      );
    });

    it('calls callable function for Google-only accounts', async () => {
      vi.mocked(fetchSignInMethodsForEmail).mockResolvedValue(['google.com']);

      // Mock dynamic import of firebase/functions
      const mockCallable = vi.fn().mockResolvedValue({});
      vi.doMock('firebase/functions', () => ({
        getFunctions: vi.fn(),
        httpsCallable: vi.fn(() => mockCallable),
      }));

      await resetPassword('test@example.com');

      // sendPasswordResetEmail should NOT be called for Google-only
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('does nothing for non-existent accounts', async () => {
      vi.mocked(fetchSignInMethodsForEmail).mockResolvedValue([]);

      await resetPassword('nonexistent@example.com');

      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('returns undefined (no return value)', async () => {
      vi.mocked(fetchSignInMethodsForEmail).mockResolvedValue(['password']);
      vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);

      const result = await resetPassword('test@example.com');

      expect(result).toBeUndefined();
    });
  });
});
```

Additional auth helper coverage to add:
- `signInWithGoogleIdToken` (credential exchange using `GoogleAuthProvider.credential`)
- `signInWithEmailPassword` (normalizes email, returns user)
- `linkGoogleAccount` (requires signed-in user, uses `linkWithPopup`)
- `resendVerificationEmail` (sends verification to `auth.currentUser`)
- `signOutUser` (calls `signOut`, clears session state)
- `getGoogleAccessToken` (retrieves or refreshes access token, prompts reauth if needed)
- `getStoredAccessToken` (reads from sessionStorage)

### Hook Tests

**Note:** `useUserSettings` uses `useFirestoreDoc` internally, which handles `onSnapshot`. Tests should mock `useFirestoreDoc` or test the hook's transformation logic.

Additional hooks to cover given recent changes:
- `useUserProfiles` / `useUserProfilesByIds` (UID-driven lookups + displayName/photoURL resolution)
- `useQuestingGroups` (memberIds-based membership + invite filtering, permission checks via `isOwner`/`canManage`)
- `usePollInvites` (pending invite data + UID-based accept/decline flows)
- `useBlockedUsers` (identifier-backed blocked list via Cloud Function callables)
- `useFriends` (friend requests, invite codes, bidirectional friendship tracking)
- `useNotifications` (real-time notifications with read/dismiss states, optimistic updates)
- `useNotificationSync` (background sync for pending invites → notifications)
- `useFirestoreDoc` / `useFirestoreCollection` (core hooks used by other hooks)

```javascript
// web/src/hooks/useUserSettings.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock dependencies before importing hook
vi.mock('../app/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'user-123' } }),
}));

vi.mock('./useFirestoreDoc', () => ({
  useFirestoreDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
}));

import { useUserSettings } from './useUserSettings';
import { useFirestoreDoc } from './useFirestoreDoc';
import { setDoc } from 'firebase/firestore';

describe('useUserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading state when useFirestoreDoc is loading', () => {
    vi.mocked(useFirestoreDoc).mockReturnValue({
      data: null,
      loading: true,
      error: null,
    });

    const { result } = renderHook(() => useUserSettings());

    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toBeUndefined();
  });

  it('returns settings and derived values when loaded', () => {
    const mockData = {
      settings: {
        emailNotifications: true,
        timezoneMode: 'manual',
        timezone: 'America/New_York',
      },
      archivedPolls: ['poll-1', 'poll-2'],
      groupColors: { 'group-1': '#ff0000' },
      calendarSyncPreference: 'calendar',
    };

    vi.mocked(useFirestoreDoc).mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useUserSettings());

    expect(result.current.loading).toBe(false);
    expect(result.current.settings).toEqual(mockData.settings);
    expect(result.current.timezone).toBe('America/New_York');
    expect(result.current.timezoneMode).toBe('manual');
    expect(result.current.archivedPolls).toEqual(['poll-1', 'poll-2']);
    expect(result.current.groupColors).toEqual({ 'group-1': '#ff0000' });
    expect(result.current.calendarSyncPreference).toBe('calendar');
  });

  it('returns default values when no data', () => {
    vi.mocked(useFirestoreDoc).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useUserSettings());

    expect(result.current.archivedPolls).toEqual([]);
    expect(result.current.groupColors).toEqual({});
    expect(result.current.calendarSyncPreference).toBe('poll');
    expect(result.current.timezoneMode).toBe('auto');
  });

  it('isArchived returns true for archived polls', () => {
    vi.mocked(useFirestoreDoc).mockReturnValue({
      data: { archivedPolls: ['poll-1', 'poll-2'] },
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useUserSettings());

    expect(result.current.isArchived('poll-1')).toBe(true);
    expect(result.current.isArchived('poll-3')).toBe(false);
  });

  it('archivePoll calls setDoc with updated array', async () => {
    vi.mocked(useFirestoreDoc).mockReturnValue({
      data: { archivedPolls: ['poll-1'] },
      loading: false,
      error: null,
    });
    vi.mocked(setDoc).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUserSettings());

    await act(async () => {
      await result.current.archivePoll('poll-2');
    });

    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        archivedPolls: ['poll-1', 'poll-2'],
      }),
      { merge: true }
    );
  });
});
```

### AuthProvider / Route Guard Tests

Target behaviors:
- `RedirectWhenSignedIn` allows `/auth` when logged out and redirects when logged in.
- Protected routes enforce auth and show the verification banner when `emailVerified` is false.
- AuthProvider `loading` state prevents protected route rendering until auth state resolves.

### Component Tests

**Note:** `VerificationBanner` is a default export with no props. It uses `useAuth` internally and calls `resendVerificationEmail` from `lib/auth.js`. Tests must mock these dependencies.

```javascript
// web/src/components/VerificationBanner.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock dependencies before importing component
vi.mock('../app/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  resendVerificationEmail: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import VerificationBanner from './VerificationBanner';
import { useAuth } from '../app/AuthProvider';
import { resendVerificationEmail } from '../lib/auth';
import { toast } from 'sonner';

describe('VerificationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when user is null', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, refreshUser: vi.fn() });

    const { container } = render(<VerificationBanner />);

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when email is already verified', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        emailVerified: true,
        providerData: [{ providerId: 'password' }],
      },
      refreshUser: vi.fn(),
    });

    const { container } = render(<VerificationBanner />);

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for Google-only users (no password provider)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        emailVerified: false,
        providerData: [{ providerId: 'google.com' }],
      },
      refreshUser: vi.fn(),
    });

    const { container } = render(<VerificationBanner />);

    expect(container.firstChild).toBeNull();
  });

  it('renders banner for unverified password user', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        email: 'test@example.com',
        emailVerified: false,
        providerData: [{ providerId: 'password' }],
      },
      refreshUser: vi.fn(),
    });

    render(<VerificationBanner />);

    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
  });

  it('calls resendVerificationEmail when resend button clicked', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        email: 'test@example.com',
        emailVerified: false,
        providerData: [{ providerId: 'password' }],
      },
      refreshUser: vi.fn(),
    });
    vi.mocked(resendVerificationEmail).mockResolvedValue(undefined);

    render(<VerificationBanner />);

    fireEvent.click(screen.getByRole('button', { name: /resend email/i }));

    await waitFor(() => {
      expect(resendVerificationEmail).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Verification email sent.');
    });
  });

  it('shows "Sending..." while resending', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        email: 'test@example.com',
        emailVerified: false,
        providerData: [{ providerId: 'password' }],
      },
      refreshUser: vi.fn(),
    });
    // Never resolves
    vi.mocked(resendVerificationEmail).mockReturnValue(new Promise(() => {}));

    render(<VerificationBanner />);

    fireEvent.click(screen.getByRole('button', { name: /resend email/i }));

    expect(await screen.findByText(/sending/i)).toBeInTheDocument();
  });

  it('calls refreshUser when "I\'ve verified" clicked', async () => {
    const mockRefreshUser = vi.fn().mockResolvedValue({ emailVerified: true });
    vi.mocked(useAuth).mockReturnValue({
      user: {
        email: 'test@example.com',
        emailVerified: false,
        providerData: [{ providerId: 'password' }],
      },
      refreshUser: mockRefreshUser,
    });

    render(<VerificationBanner />);

    fireEvent.click(screen.getByRole('button', { name: /i've verified/i }));

    await waitFor(() => {
      expect(mockRefreshUser).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Email verified. Thanks!');
    });
  });
});
```

## Integration Tests

### Firebase Emulator Integration

**Prerequisites:** Add emulator config to `firebase.json`:
```json
{
  "emulators": {
    "firestore": { "port": 8080 },
    "auth": { "port": 9099 },
    "ui": { "enabled": true }
  }
}
```

```javascript
// web/src/__tests__/integration/scheduler.integration.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let testEnv;

beforeAll(async () => {
  // Resolve path to firestore.rules at project root
  const rulesPath = path.resolve(__dirname, '../../../../firestore.rules');
  testEnv = await initializeTestEnvironment({
    projectId: 'quest-scheduler-test',
    firestore: {
      rules: fs.readFileSync(rulesPath, 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Scheduler Integration Tests', () => {
  describe('creation', () => {
    it('allows authenticated user to create scheduler', async () => {
      const alice = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      });

      await assertSucceeds(
        setDoc(doc(alice.firestore(), 'schedulers/test-scheduler'), {
          title: 'Game Night',
          creatorId: 'alice',
          creatorEmail: 'alice@example.com',
          status: 'OPEN',
          participantIds: ['alice'],
          pendingInvites: [],
          allowLinkSharing: false,  // Correct field name
          createdAt: new Date(),
        })
      );
    });

    it('denies unverified email user from creating scheduler', async () => {
      const unverified = testEnv.authenticatedContext('bob', {
        email: 'bob@example.com',
        email_verified: false,
      });

      await assertFails(
        setDoc(doc(unverified.firestore(), 'schedulers/test-scheduler'), {
          title: 'Game Night',
          creatorId: 'bob',
          creatorEmail: 'bob@example.com',
          status: 'OPEN',
        })
      );
    });
  });

  describe('voting', () => {
    it('allows participant to submit vote', async () => {
      // Setup: Create scheduler with alice as creator
      const alice = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
      });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'schedulers/test-scheduler'), {
          creatorId: 'alice',
          participantIds: ['bob'],
          pendingInvites: [],
          status: 'OPEN',
          allowLinkSharing: false,
        });
      });

      // Test: Bob can vote
      const bob = testEnv.authenticatedContext('bob', {
        email: 'bob@example.com',
      });

      await assertSucceeds(
        setDoc(doc(bob.firestore(), 'schedulers/test-scheduler/votes/bob'), {
          userEmail: 'bob@example.com',
          userAvatar: null,
          votes: { 'slot-1': 'PREFERRED' },
          noTimesWork: false,
          updatedAt: new Date(),
        })
      );
    });

    it('denies non-participant from voting', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'schedulers/test-scheduler'), {
          creatorId: 'alice',
          participantIds: ['alice'],
          pendingInvites: [],
          status: 'OPEN',
          allowLinkSharing: false,
        });
      });

      const charlie = testEnv.authenticatedContext('charlie', {
        email: 'charlie@example.com',
      });

      await assertFails(
        setDoc(doc(charlie.firestore(), 'schedulers/test-scheduler/votes/charlie'), {
          userEmail: 'charlie@example.com',
          userAvatar: null,
          votes: {},
          noTimesWork: false,
          updatedAt: new Date(),
        })
      );
    });
  });
});
```

### Firestore Security Rules Tests

```javascript
// functions/test/rules/firestore.rules.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let testEnv;

beforeAll(async () => {
  // Resolve path to firestore.rules at project root
  const rulesPath = path.resolve(__dirname, '../../../firestore.rules');
  testEnv = await initializeTestEnvironment({
    projectId: 'quest-scheduler-rules-test',
    firestore: {
      rules: fs.readFileSync(rulesPath, 'utf8'),
    },
  });
});

afterAll(() => testEnv.cleanup());
beforeEach(() => testEnv.clearFirestore());

describe('Firestore Security Rules', () => {
  describe('users collection', () => {
    it('allows user to read own document', async () => {
      const alice = testEnv.authenticatedContext('alice');
      await assertSucceeds(getDoc(doc(alice.firestore(), 'users/alice')));
    });

    it('denies user from reading other user document', async () => {
      const alice = testEnv.authenticatedContext('alice');
      await assertFails(getDoc(doc(alice.firestore(), 'users/bob')));
    });

    it('prevents user from modifying protected fields', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users/alice'), {
          email: 'alice@example.com',
          inviteAllowance: 50,
        });
      });

      const alice = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
      });

      // Try to modify protected field - should fail
      await assertFails(
        updateDoc(doc(alice.firestore(), 'users/alice'), {
          inviteAllowance: 100,
        })
      );
    });
  });

  describe('users/{uid}/notifications subcollection', () => {
    it('allows user to read own notifications', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users/alice/notifications/notif-1'), {
          type: 'FRIEND_REQUEST',
          read: false,
        });
      });

      const alice = testEnv.authenticatedContext('alice');
      await assertSucceeds(
        getDoc(doc(alice.firestore(), 'users/alice/notifications/notif-1'))
      );
    });

    it('denies user from reading other user notifications', async () => {
      const alice = testEnv.authenticatedContext('alice');
      await assertFails(
        getDoc(doc(alice.firestore(), 'users/bob/notifications/notif-1'))
      );
    });
  });

  describe('usersPublic collection', () => {
    it('allows any signed-in user to read', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'usersPublic/alice'), {
          email: 'alice@example.com',
          displayName: 'Alice',
        });
      });

      const bob = testEnv.authenticatedContext('bob');
      await assertSucceeds(
        getDoc(doc(bob.firestore(), 'usersPublic/alice'))
      );
    });

    it('denies unauthenticated read', async () => {
      const unauth = testEnv.unauthenticatedContext();
      await assertFails(
        getDoc(doc(unauth.firestore(), 'usersPublic/alice'))
      );
    });
  });

  describe('mail collection', () => {
    it('allows signed-in user to create mail', async () => {
      const alice = testEnv.authenticatedContext('alice');
      await assertSucceeds(
        setDoc(doc(alice.firestore(), 'mail/test-mail'), {
          to: 'bob@example.com',
          message: { subject: 'Test', text: 'Hello' },
        })
      );
    });

    it('denies unauthenticated mail creation', async () => {
      const unauth = testEnv.unauthenticatedContext();
      await assertFails(
        setDoc(doc(unauth.firestore(), 'mail/test-mail'), {
          to: 'bob@example.com',
          message: { subject: 'Test', text: 'Hello' },
        })
      );
    });

    it('denies reading mail', async () => {
      const alice = testEnv.authenticatedContext('alice');
      await assertFails(
        getDoc(doc(alice.firestore(), 'mail/test-mail'))
      );
    });
  });

  describe('friendRequests collection', () => {
    // Note: friendRequests have `allow create: if false` - creation is done via Cloud Functions
    it('denies direct client creation of friend request', async () => {
      const alice = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
      });

      // Direct client writes are blocked; friend requests must be created via Cloud Functions
      await assertFails(
        setDoc(doc(alice.firestore(), 'friendRequests/test-request'), {
          fromUserId: 'alice',
          fromEmail: 'alice@example.com',
          toEmail: 'bob@example.com',
          status: 'pending',
          createdAt: new Date(),
        })
      );
    });

    it('allows recipient to accept friend request', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'friendRequests/test-request'), {
          fromUserId: 'alice',
          fromEmail: 'alice@example.com',
          toEmail: 'bob@example.com',
          status: 'pending',
        });
      });

      const bob = testEnv.authenticatedContext('bob', {
        email: 'bob@example.com',
      });

      await assertSucceeds(
        updateDoc(doc(bob.firestore(), 'friendRequests/test-request'), {
          status: 'accepted',
          toUserId: 'bob',
        })
      );
    });

    it('denies third party from modifying friend request', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'friendRequests/test-request'), {
          fromUserId: 'alice',
          fromEmail: 'alice@example.com',
          toEmail: 'bob@example.com',
          status: 'pending',
        });
      });

      const charlie = testEnv.authenticatedContext('charlie', {
        email: 'charlie@example.com',
      });

      await assertFails(
        updateDoc(doc(charlie.firestore(), 'friendRequests/test-request'), {
          status: 'accepted',
        })
      );
    });
  });

  describe('questingGroups collection', () => {
    it('allows member to read group', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'questingGroups/test-group'), {
          name: 'Test Group',
          memberIds: ['alice'],
          pendingInvites: [],
        });
      });

      const alice = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
      });

      await assertSucceeds(
        getDoc(doc(alice.firestore(), 'questingGroups/test-group'))
      );
    });

    it('allows member-managed group member to invite others', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'questingGroups/test-group'), {
          name: 'Test Group',
          creatorId: 'alice',
          memberIds: ['alice', 'bob'],
          pendingInvites: [],
          memberManaged: true,
        });
      });

      const bob = testEnv.authenticatedContext('bob', {
        email: 'bob@example.com',
      });

      await assertSucceeds(
        updateDoc(doc(bob.firestore(), 'questingGroups/test-group'), {
          pendingInvites: ['charlie@example.com'],
        })
      );
    });
  });

  describe('schedulers/{id}/slots subcollection', () => {
    it('allows creator to create slots', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'schedulers/test-scheduler'), {
          creatorId: 'alice',
          status: 'OPEN',
        });
      });

      const alice = testEnv.authenticatedContext('alice');
      await assertSucceeds(
        setDoc(doc(alice.firestore(), 'schedulers/test-scheduler/slots/slot-1'), {
          startTime: new Date(),
          endTime: new Date(),
        })
      );
    });

    it('denies non-creator from creating slots', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'schedulers/test-scheduler'), {
          creatorId: 'alice',
          status: 'OPEN',
        });
      });

      const bob = testEnv.authenticatedContext('bob');
      await assertFails(
        setDoc(doc(bob.firestore(), 'schedulers/test-scheduler/slots/slot-1'), {
          startTime: new Date(),
          endTime: new Date(),
        })
      );
    });
  });
});
```

Additional Firestore rules coverage to add:
- `users/{uid}`: only owner can write; cannot overwrite protected fields (authProviders, discord data).
- `usersPublic/{uid}`: only owner can update profile fields; read allowed to any signed-in user.
- `usersPublic/{uid}`: enforce owner-only updates for `avatarSource`, `customAvatarUrl`, and `photoURL`.
- `usersPublic/{uid}`: prevent email changes via client writes (if enforced in rules).
- `users/{uid}/blockedUsers`: only owner can create/update/delete.
- `qsUsernames/{username}`: only owner (or callable context) can claim once.
- `schedulers/{id}`: enforce `participantIds` only (no legacy participants array).
- `questingGroups/{id}`: enforce `memberIds` only (no legacy members array).

### Storage Rules Tests

```javascript
// functions/test/rules/storage.rules.test.js
import { describe, it, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import fs from 'fs';
import path from 'path';

let testEnv;

beforeAll(async () => {
  // storage.rules is at project root, not in functions/
  const rulesPath = path.resolve(__dirname, '../../../storage.rules');
  testEnv = await initializeTestEnvironment({
    projectId: 'quest-scheduler-test',
    storage: { rules: fs.readFileSync(rulesPath, 'utf8') },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

it('allows user to upload png under 2MB', async () => {
  const alice = testEnv.authenticatedContext('alice');
  const storage = getStorage(alice.storage());
  const objectRef = ref(storage, 'profiles/alice/avatar.png');
  const buffer = Buffer.alloc(1024);
  await assertSucceeds(uploadBytes(objectRef, buffer, { contentType: 'image/png' }));
});

it('denies non-owner upload', async () => {
  const bob = testEnv.authenticatedContext('bob');
  const storage = getStorage(bob.storage());
  const objectRef = ref(storage, 'profiles/alice/avatar.png');
  const buffer = Buffer.alloc(1024);
  await assertFails(uploadBytes(objectRef, buffer, { contentType: 'image/png' }));
});

it('allows public read of avatars', async () => {
  const unauth = testEnv.unauthenticatedContext();
  const storage = getStorage(unauth.storage());
  const objectRef = ref(storage, 'profiles/alice/avatar.png');
  await assertSucceeds(getDownloadURL(objectRef));
});

it('denies reading missing avatar objects', async () => {
  const unauth = testEnv.unauthenticatedContext();
  const storage = getStorage(unauth.storage());
  const objectRef = ref(storage, 'profiles/alice/missing.png');
  await assertFails(getDownloadURL(objectRef));
});
```

## E2E Tests

### Critical User Journeys

**OAuth testing note:** For Google/Discord, use a mocked OAuth flow (stub callable responses or use Playwright route interception) rather than real provider popups.

```javascript
// web/e2e/auth.spec.js
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can register with email and password', async ({ page }) => {
    await page.goto('/auth');

    // Switch to Create account tab
    await page.getByRole('tab', { name: /create account/i }).click();

    // Fill registration form
    await page.getByLabel(/email/i).fill('newuser@example.com');
    await page.getByLabel(/password/i).fill('SecurePass123!');
    await page.getByLabel(/terms/i).check();

    // Submit
    await page.getByRole('button', { name: /create account/i }).click();

    // Should redirect to dashboard with verification banner
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText(/verify your email/i)).toBeVisible();
  });

  test('user can login with Google', async ({ page }) => {
    // Note: Google OAuth testing requires mock or test account setup
    await page.goto('/auth');

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /continue with google/i }).click();

    const popup = await popupPromise;
    // Handle Google OAuth popup (mocked in test environment)
    await popup.waitForLoadState();
    // ... mock OAuth flow
  });

  test('user can reset password', async ({ page }) => {
    await page.goto('/auth');

    await page.getByRole('link', { name: /forgot password/i }).click();
    await page.getByLabel(/email/i).fill('existing@example.com');
    await page.getByRole('button', { name: /send reset/i }).click();

    // Should show success message regardless of account existence
    await expect(page.getByText(/if an account exists/i)).toBeVisible();
  });
});
```

```javascript
// web/e2e/discord.spec.js
import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './fixtures/auth';

test.describe('Discord Auth + Linking', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('user can start Discord linking flow', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /link discord/i }).click();
    // For E2E: mock the OAuth window or stub the callable response
    await expect(page.getByText(/linking/i)).toBeVisible();
  });

  test('discord login button renders on auth page', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByRole('button', { name: /continue with discord/i })).toBeVisible();
  });
});
```

```javascript
// web/e2e/scheduler.spec.js
import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './fixtures/auth';

test.describe('Scheduler', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('user can create a new poll', async ({ page }) => {
    await page.goto('/create');

    // Fill poll title (note: there is no description field in the UI)
    await page.getByLabel(/title/i).fill('Weekly D&D Session');

    // Add time slots via "+ Add slot" button
    await page.getByRole('button', { name: /add slot/i }).click();
    // Modal opens - select date and time, then confirm
    // ... (date picker interaction depends on DatePicker component implementation)

    // Save poll
    await page.getByRole('button', { name: /create poll/i }).click();

    // Should redirect to poll page
    await expect(page).toHaveURL(/\/scheduler\/.+/);
    await expect(page.getByText('Weekly D&D Session')).toBeVisible();
  });

  test('user can vote on a poll', async ({ page }) => {
    // Navigate to existing poll (from fixture)
    await page.goto('/scheduler/test-poll-id');

    // Note: SchedulerPage.jsx doesn't have data-testid attributes.
    // Use text/role selectors or add data-testid to components if needed.
    // Find the slot row and click the Preferred star button
    const slotRow = page.locator('[class*="slot"]').first();
    await slotRow.getByRole('button', { name: /preferred/i }).click();

    // Submit votes
    await page.getByRole('button', { name: /submit votes/i }).click();

    // Should show confirmation toast
    await expect(page.getByText(/votes saved/i)).toBeVisible();
  });

  test('creator can finalize poll', async ({ page }) => {
    await page.goto('/scheduler/test-poll-id');

    // Note: Actual selectors depend on SchedulerPage.jsx structure.
    // Creator sees "Finalize" button when poll is open.
    // Find the slot to select as winner (may need to check current UI structure)
    const slotRow = page.locator('[class*="slot"]').first();
    await slotRow.click();
    await page.getByRole('button', { name: /finalize/i }).click();

    // Confirm in dialog
    await page.getByRole('button', { name: /confirm/i }).click();

    // Should show finalized state
    await expect(page.getByText(/finalized/i)).toBeVisible();
  });
});
```

```javascript
// web/e2e/friends.spec.js
import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './fixtures/auth';

test.describe('Friends', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('user can send friend request', async ({ page }) => {
    await page.goto('/friends');

    // Add friend by identifier (email, Discord username, or QS username)
    await page.getByLabel(/email|username/i).fill('friend@example.com');
    await page.getByRole('button', { name: /send request/i }).click();

    // Should show pending request
    await expect(page.getByText('friend@example.com')).toBeVisible();
    await expect(page.getByText(/pending/i)).toBeVisible();
  });

  test('user can accept friend request', async ({ page }) => {
    // Setup: Create incoming friend request (via API or fixture)

    await page.goto('/friends');

    // Accept request
    await page.getByRole('button', { name: /accept/i }).first().click();

    // Should move to friends list
    await expect(page.getByText(/friend added/i)).toBeVisible();
  });

  test('user can copy friend invite link', async ({ page }) => {
    await page.goto('/friends');

    // The invite link section shows by default with a read-only input
    // Note: The input has no accessible label, so we locate it by nearby text
    const inviteLinkSection = page.locator('section', { hasText: /your invite link/i });
    const linkInput = inviteLinkSection.locator('input[readonly]');

    // Should contain the invite link
    await expect(linkInput).toHaveValue(/\/friends\?invite=/);

    // Click copy button
    await inviteLinkSection.getByRole('button', { name: /copy/i }).click();
  });
});
```

```javascript
// web/e2e/settings.spec.js
import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './fixtures/auth';

test.describe('Settings - Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('user can switch avatar source to custom', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: /custom upload/i }).check();
    // Upload requires Storage emulator or mocked upload
    // Expect preview to update once URL is set
  });
});
```

### E2E Test Fixtures

```javascript
// web/e2e/fixtures/auth.js

export async function loginAsTestUser(page) {
  // Option 1: Use stored auth state
  // await page.context().addCookies(testUserCookies);

  // Option 2: Login via UI (slower but more realistic)
  await page.goto('/auth');
  await page.getByLabel(/email/i).fill('testuser@example.com');
  await page.getByLabel(/password/i).fill('TestPassword123!');
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL('/dashboard');
}

export async function loginAsUser(page, email, password) {
  await page.goto('/auth');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL('/dashboard');
}
```

```javascript
// web/e2e/fixtures/test-data.js
export const testUsers = {
  alice: {
    uid: 'test-alice',
    email: 'alice@test.example.com',
    password: 'AlicePass123!',
    displayName: 'Alice Test',
    photoURL: 'https://example.com/alice.png',
    qsUsername: 'alice',
    discordUsername: 'alice_discord',
  },
  bob: {
    uid: 'test-bob',
    email: 'bob@test.example.com',
    password: 'BobPass123!',
    displayName: 'Bob Test',
    photoURL: 'https://example.com/bob.png',
    qsUsername: 'bob',
    discordUsername: 'bob_discord',
  },
};

export const testSchedulers = {
  openPoll: {
    id: 'test-open-poll',
    title: 'Test Game Night',
    status: 'OPEN',
    creatorId: testUsers.alice.uid,
  },
};
```

## Cloud Functions Tests

**Prerequisites:** The functions package currently has no test infrastructure. Before writing tests:

1. Add test dependencies to `functions/package.json`:
```json
{
  "devDependencies": {
    "vitest": "^3.2.4",
    "firebase-functions-test": "^3.4.0"
  },
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch"
  }
}
```

2. Create `functions/vitest.config.js`:
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.js'],
    exclude: ['**/node_modules/**'],
  },
});
```

**Note:** Many helper functions in `functions/src/legacy.js` (like `normalizeEmail`, `findUserIdByEmail`) are not exported - they're internal. Tests should focus on **exported callable functions** or use integration tests with the emulator.

Priority callables to cover in `legacy.js` given recent identifier work:
- `createFriendRequest` / `respondToFriendRequest` (identifier resolution + blocked-user penalties)
- `createQuestingGroupInvite` / `respondToQuestingGroupInvite` (memberIds + pendingInvites)
- `sendPollInvites` / `revokePollInvite` (pendingInvites + participantIds)
- `blockUser` / `unblockUser` (identifier parsing + penalty behavior)
- `registerQsUsername` (uniqueness + lowercase)

### Unit Tests for Exported Functions

```javascript
// functions/src/auth.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin before importing
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    getUserByEmail: vi.fn(),
  })),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      add: vi.fn(),
    })),
  })),
}));

describe('auth functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendPasswordResetInfo', () => {
    // Test the callable function behavior
    // Note: Requires wrapping the function for testability
    it('should be tested via integration with emulator', () => {
      // Callable functions are best tested with firebase-functions-test
      // or integration tests against the emulator
      expect(true).toBe(true);
    });
  });
});
```

### Integration Tests with Functions Emulator

```javascript
// functions/src/__tests__/integration/functions.integration.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

// Integration tests require the Firebase Emulator to be running
// Run with: firebase emulators:exec 'npm test'

describe('Cloud Functions Integration', () => {
  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
  });

  describe('sendPollInvites', () => {
    it('creates mail documents for invitees', async () => {
      // Test via HTTP request to emulator or firebase-functions-test
    });
  });

  describe('cloneSchedulerPoll', () => {
    it('creates a new scheduler with copied data', async () => {
      // Test via HTTP request to emulator
    });
  });
});
```

Additional integration targets:
- `discordOAuthCallback` (login intent returns custom token)
- `discordWorker` vote handling + error messages
- `blockUser`/`unblockUser` penalty behavior
- Task queue handler stubs for `processDiscordInteraction` (onTaskDispatched)

### Discord Functions Tests

```javascript
// functions/src/discord/oauth.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin/app');
vi.mock('firebase-admin/firestore');
vi.mock('firebase-admin/auth');

describe('Discord OAuth functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startDiscordOAuth', () => {
    it('creates OAuth state document and returns auth URL', async () => {
      // Test OAuth flow initiation
    });
  });

  describe('discordOAuthLoginStart', () => {
    it('creates login intent state with returnTo and provider=discord', async () => {
      // Should include returnTo + provider in state for callback compatibility
    });
  });

  describe('discordOAuthCallback', () => {
    it('links Discord account on successful OAuth', async () => {
      // Test callback handling
    });

    it('signs in with custom token for login intent', async () => {
      // Callback returns a Firebase custom token when state.intent=login
    });

    it('rejects if Discord account already linked to another user', async () => {
      // Test duplicate link detection
    });

    it('rejects login when email missing and account must be created', async () => {
      // New-account flow requires verified Discord email
    });
  });
});

// functions/src/discord/worker.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin/app');
vi.mock('firebase-admin/firestore');
vi.mock('./discord-client');
vi.mock('./config');

describe('Discord worker functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processDiscordInteraction', () => {
    it('handles vote button interaction', async () => {
      // Test vote button opens voting interface
    });

    it('handles vote select interaction', async () => {
      // Test vote selection updates session
    });

    it('handles submit vote interaction', async () => {
      // Test vote submission writes to Firestore
    });

    it('handles clear votes interaction', async () => {
      // Test clearing votes
    });

    it('handles "none work" interaction', async () => {
      // Test marking all slots as unavailable
    });

    it('handles link-group slash command', async () => {
      // Test linking Discord channel to questing group
    });

    it('handles unlink-group slash command', async () => {
      // Test unlinking Discord channel
    });
  });

  describe('vote eligibility checks', () => {
    it('returns error when user not linked to QS', async () => {
      // User Discord ID not in discordUserLinks
      // Should return buildUserNotLinkedMessage
    });

    it('returns error when user not a participant', async () => {
      // User linked but UID not in participantIds
      // Should return ERROR_MESSAGES.notParticipant
    });

    it('returns error when poll not found', async () => {
      // Scheduler document doesn't exist
      // Should return ERROR_MESSAGES.pollNotFound
    });

    it('returns error when poll already finalized', async () => {
      // Scheduler status is FINALIZED
      // Should return ERROR_MESSAGES.pollAlreadyFinalized
    });
  });

  describe('interaction locking', () => {
    it('prevents duplicate processing via Firestore transaction', async () => {
      // Test interaction ID lock mechanism
    });
  });
});

// functions/src/discord/link-codes.test.js
describe('Discord link codes', () => {
  describe('discordGenerateLinkCode', () => {
    it('generates 8-character hex code', async () => {
      // Test code format
    });

    it('stores hashed code with 10-minute expiry', async () => {
      // Test Firestore document creation
    });

    it('enforces rate limit of 5 codes per hour', async () => {
      // Test rate limiting
    });

    it('requires authentication', async () => {
      // Test unauthenticated call throws
    });
  });
});

// functions/src/discord/nudge.test.js
describe('Discord nudge', () => {
  describe('nudgeDiscordParticipants', () => {
    it('requires creator permission', async () => {
      // Test non-creator cannot nudge
    });

    it('enforces 8-hour cooldown', async () => {
      // Test cooldown check
    });

    it('sends DMs to non-voters with Discord linked', async () => {
      // Test message sending
    });

    it('includes poll link and first slot time', async () => {
      // Test message content
    });
  });
});
```

Additional Discord functions to cover:

**Callable functions:**
- `discordGenerateLinkCode` (link-codes.js) - generates 8-char hex codes with rate limiting (5/hour)
- `discordListGuildRoles` (roles.js) - fetches guild roles for group managers
- `discordUnlink` (unlink.js) - requires alternate auth provider; resets public identifier
- `nudgeDiscordParticipants` (nudge.js) - sends reminder DMs with 8-hour cooldown

**HTTP endpoints:**
- `discordInteractions` (ingress.js) - signature verification, PING handling, queue dispatch
- `discordOAuthLoginStart` (oauth.js) - initiates Discord login flow (no auth required)
- `discordOAuthCallback` (oauth.js) - handles both login and link intents

**Queue handlers:**
- `processDiscordInteraction` (worker.js) - processes slash commands and vote interactions

**Utility modules (internal, but critical paths):**
- `buildPollCard` / `buildPollStatusCard` (poll-card.js) - Discord embed generation
- `generateLinkCode` / `hashLinkCode` (link-utils.js) - code generation utilities
- `ERROR_MESSAGES` / `buildUserNotLinkedMessage` (error-messages.js) - error constants

### Scheduler Triggers Tests

```javascript
// functions/src/triggers/scheduler.test.js
import { describe, it, expect, vi } from 'vitest';

describe('Scheduler triggers', () => {
  describe('postDiscordPollCard', () => {
    it('creates Discord message when scheduler has Discord channel', async () => {
      // Test trigger behavior
    });

    it('does nothing when no Discord channel configured', async () => {
      // Test no-op case
    });
  });

  describe('finalizeDiscordPoll', () => {
    it('posts finalization message with role mention', async () => {
      // Test finalization Discord message
    });
  });
});
```

### Integration Tests with Emulator

```javascript
// functions/src/__tests__/integration/calendar.integration.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import { getFunctions } from 'firebase-admin/functions';

describe('Calendar Functions Integration', () => {
  beforeAll(async () => {
    // Connect to emulator
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

    admin.initializeApp({ projectId: 'quest-scheduler-test' });
  });

  afterAll(async () => {
    await admin.app().delete();
  });

  it('creates calendar event on poll finalization', async () => {
    // This would test the full flow with emulator
    // Requires actual function deployment to emulator
  });
});
```

## Test Scripts

### Package.json Scripts

**Current state (`web/package.json`):**
```json
{
  "scripts": {
    "test": "vitest"
  }
}
```

**Target state (add these scripts):**
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:rules": "firebase emulators:exec --only firestore,storage 'vitest run --config vitest.rules.config.js'",
    "test:integration": "firebase emulators:exec 'vitest run --config vitest.integration.config.js'",
    "test:all": "npm run test && npm run test:rules && npm run test:e2e",
    "emulators": "firebase emulators:start",
    "emulators:test": "firebase emulators:start --only firestore,auth,storage"
  }
}
```

**Functions package (`functions/package.json`) - add:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch"
  },
  "devDependencies": {
    "vitest": "^3.2.4",
    "firebase-functions-test": "^3.4.0"
  }
}
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: web/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: web

      - name: Run unit tests
        run: npm run test:coverage
        working-directory: web

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: web/coverage/coverage-final.json

  security-rules-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Firebase CLI
        run: npm install -g firebase-tools

      - name: Install dependencies
        run: npm ci
        working-directory: functions

      - name: Run rules tests
        run: npm run test:rules

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        working-directory: web

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e
        working-directory: web

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: web/playwright-report/

  functions-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        working-directory: functions

      - name: Run functions tests
        run: npm test
        working-directory: functions
```

## Test Data Management

### Seeding Test Data

```javascript
// web/e2e/fixtures/seed-data.js
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, doc, setDoc } from 'firebase/firestore';
import { testUsers, testSchedulers } from './test-data.js';

export async function seedTestData() {
  const app = initializeApp({
    projectId: 'quest-scheduler-test',
  });

  const db = getFirestore(app);

  // Connect to emulator (must be called before any Firestore operations)
  connectFirestoreEmulator(db, 'localhost', 8080);

  // Seed users
  for (const [key, user] of Object.entries(testUsers)) {
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName: user.displayName,
      avatarSource: 'google',
      photoURL: user.photoURL || null,
      qsUsername: user.qsUsername || null,
      qsUsernameLower: user.qsUsername ? user.qsUsername.toLowerCase() : null,
      discordUsername: user.discordUsername || null,
      discordUsernameLower: user.discordUsername ? user.discordUsername.toLowerCase() : null,
      emailNotifications: true,
      createdAt: new Date(),
    });

    await setDoc(doc(db, 'usersPublic', user.uid), {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL || null,
      avatarSource: 'google',
      qsUsername: user.qsUsername || null,
      qsUsernameLower: user.qsUsername ? user.qsUsername.toLowerCase() : null,
      discordUsername: user.discordUsername || null,
      discordUsernameLower: user.discordUsername ? user.discordUsername.toLowerCase() : null,
    });

    if (user.qsUsername) {
      await setDoc(doc(db, 'qsUsernames', user.qsUsername.toLowerCase()), {
        uid: user.uid,
        username: user.qsUsername.toLowerCase(),
        createdAt: new Date(),
      });
    }
  }

  // Seed schedulers
  for (const [key, scheduler] of Object.entries(testSchedulers)) {
    await setDoc(doc(db, 'schedulers', scheduler.id), {
      ...scheduler,
      participantIds: [testUsers.alice.uid],
      pendingInvites: [],
      createdAt: new Date(),
    });
  }
}

export async function clearTestData() {
  // Clear all test data
  // Use Firebase Admin SDK or emulator reset
}
```

### Emulator Reset Strategy

- Prefer `firebase emulators:exec --only firestore,auth,storage 'node scripts/reset-emulators.js'`.
- In CI, wipe between suites by deleting emulator data directories or using Admin SDK to delete seeded docs.
- For local runs, consider `firebase emulators:start --import=./.emulator-data --export-on-exit` to keep fixtures stable.

## Edge Cases & Error Scenarios

### Authentication Edge Cases

| Scenario | Test |
|----------|------|
| Expired session | User is redirected to login |
| Network failure during login | Error message shown, retry option |
| Google popup blocked | Fallback instructions shown |
| Discord OAuth failure | User sees "Discord sign-in failed" toast and is returned to `/auth` |
| Discord login missing verified email | Redirect to `/auth?error=email_required` with message: "Discord login requires a verified email address" |
| Discord linking (no email required) | Linking uses `identify` scope only; email not required for linking to existing account |
| Unlink Discord without another provider | Backend throws `failed-precondition`; Settings disables button with hint |
| Email already registered (different provider) | Helpful error with link guidance |
| Password too weak | Validation error before submit |
| Invalid email format | Validation error before submit |
| Rate limited | Appropriate error message |
| Auth gating | `RedirectWhenSignedIn` and protected routes allow/deny correctly |

### Scheduler Edge Cases

| Scenario | Test |
|----------|------|
| Create poll with no slots | Validation error |
| Vote on finalized poll | Action disabled/error |
| Discord vote by non-member | Bot returns specific error from `ERROR_MESSAGES.notParticipant` |
| Discord vote by unlinked user | Bot returns `buildUserNotLinkedMessage(appUrl)` with linking instructions |
| Discord vote poll not found | Bot returns `ERROR_MESSAGES.pollNotFound` |
| Discord vote already finalized | Bot returns `ERROR_MESSAGES.pollAlreadyFinalized` |
| Finalize with no votes | Warning shown, can proceed |
| Delete poll with calendar event | Calendar event also deleted |
| Timezone edge cases | Slots display correctly across DST |
| Concurrent vote updates | Last write wins, no data loss |

### Friend/Group Edge Cases

| Scenario | Test |
|----------|------|
| Friend request to self | Validation error |
| Duplicate friend request | Idempotent or error |
| Accept already-accepted request | No-op or error |
| Leave group as last member | Group deleted |
| Invite blocked user | Error shown |
| Invite by Discord username (not linked) | Error: user must link Discord before invite works |
| Invite by legacy Discord tag or Discord ID | Validation error with “use Discord username” guidance |
| Accept invite while logged out | Redirect to login, then accept |
| Blocker applies penalty | Penalty only if blocked user previously sent a request |

### Profile & Identity Edge Cases

| Scenario | Test |
|----------|------|
| Avatar upload invalid type | Storage rules deny non image/(jpeg|png|webp) |
| Avatar upload too large | Storage rules deny >2MB |
| Avatar source set to Google without Google provider | UI auto-falls back to Discord or Custom |
| Avatar source set to Discord without Discord link | UI disables Discord option |
| Display name missing | UI falls back to email for display name |
| Public identifier set to Discord without link | UI prevents selection, shows guidance |

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [x] Install Vitest (3.2.4 installed)
- [x] Configure Vitest with proper setup file (`web/vitest.config.js`)
- [x] Add React Testing Library (`@testing-library/react`, `@testing-library/jest-dom`)
- [x] Create initial data layer unit tests (4 files exist: users, friends, questingGroups, notifications)
- [x] Complete data layer unit tests (90% coverage, incl. identifiers, identity, poll invites, blocks, discord, usernames)
- [x] Complete auth helper unit tests (Google + Discord + custom token)

### Phase 2: Security & Integration (Week 3-4)
- [x] Set up Firebase Emulator Suite (Firestore/Auth/Storage) - add emulator config to `firebase.json`
- [x] Add `@firebase/rules-unit-testing` package
- [x] Write comprehensive Firestore + Storage rules tests
- [x] Add integration tests for critical UID-based flows

### Phase 3: Component & Hook Tests (Week 5-6)
- [x] Add component tests for UI components
- [x] Add hook tests with mocked Firebase (profiles, groups, invites, blocks, friends, notifications)
- [x] Achieve 60% component coverage

### Phase 4: E2E Tests (Week 7-8)
- [x] Install and configure Playwright
- [x] Write auth flow E2E tests (Google + Discord login)
- [x] Write scheduler flow E2E tests
- [x] Write friends/groups E2E tests (identifier invites)
- [x] Write settings/profile E2E tests (avatar source selection)

### Phase 5: Cloud Functions (Week 9-10)
- [x] Add Vitest + `firebase-functions-test` to functions/package.json
- [x] Create `functions/vitest.config.js`
- [x] Unit test callable functions (Discord OAuth, link codes, nudge, unlink, roles)
- [x] Unit test queue handlers (processDiscordInteraction)
- [x] Integration test with emulator (Discord worker + schedulers)

### Phase 6: CI/CD & Polish (Week 11-12)
- [x] Set up GitHub Actions workflow
- [x] Add coverage reporting
- [x] Add test result artifacts
- [x] Documentation and maintenance guide

## BLOCKED TASKS
- Discord role mapping test remains skipped. Requires a real Discord bot token + role payloads or explicit approval to mock REST responses.

## References

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Firebase Rules Unit Testing](https://firebase.google.com/docs/rules/unit-tests)
- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [MSW (Mock Service Worker)](https://mswjs.io/)
