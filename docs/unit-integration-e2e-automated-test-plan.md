# Automated Testing Plan

## Overview

This document outlines a comprehensive automated testing strategy for Quest Scheduler, covering unit tests, integration tests, and end-to-end (E2E) tests. The goal is to ensure reliability across all key user journeys while maintaining fast feedback loops during development.

## Current State

### Existing Infrastructure
- **Test Framework:** Vitest 3.2.4 (installed)
- **Language:** JavaScript/JSX only (no TypeScript)
- **Existing Tests:** 4 data layer test files in `web/src/lib/data/`:
  - `users.test.js`
  - `friends.test.js`
  - `questingGroups.test.js`
  - `notifications.test.js`
- **No Vitest config file** - uses defaults
- **No coverage reporting** configured

### Gaps
- ❌ No component tests
- ❌ No hook tests
- ❌ No Cloud Functions tests
- ❌ No Firestore security rules tests
- ❌ No E2E tests
- ❌ No integration tests with Firebase Emulator
- ❌ No Firebase Emulator config in firebase.json

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
| Data Layer (`lib/data/`) | 90% | P0 |
| Auth Helpers (`lib/auth.js`) | 90% | P0 |
| Custom Hooks (`hooks/`) | 80% | P1 |
| Firestore Security Rules | 100% | P0 |
| Cloud Functions | 80% | P1 |
| UI Components | 60% | P2 |
| E2E Critical Paths | 100% | P0 |

## Directory Structure

```
web/
├── src/
│   ├── __tests__/              # Integration tests
│   │   ├── setup.js            # Test setup (Firebase emulator connection)
│   │   └── integration/
│   │       ├── auth.integration.test.js
│   │       ├── scheduler.integration.test.js
│   │       └── friends.integration.test.js
│   ├── lib/
│   │   ├── data/
│   │   │   ├── users.js
│   │   │   └── users.test.js   # Co-located unit tests (existing)
│   │   └── auth.js
│   │       └── auth.test.js
│   ├── hooks/
│   │   ├── useUserSettings.js
│   │   └── useUserSettings.test.js
│   └── components/
│       └── ui/
│           ├── button.jsx
│           └── button.test.jsx
├── e2e/                        # E2E tests (Playwright)
│   ├── playwright.config.js
│   ├── auth.spec.js
│   ├── scheduler.spec.js
│   ├── friends.spec.js
│   └── fixtures/
│       └── test-users.js
└── vitest.config.js

functions/
├── src/
│   ├── legacy.js
│   ├── legacy.test.js          # Co-located unit tests
│   ├── discord/
│   │   ├── oauth.js
│   │   └── oauth.test.js
│   └── __tests__/
│       └── integration/
│           └── calendar.integration.test.js
├── test/
│   └── rules/
│       └── firestore.rules.test.js
└── vitest.config.js

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
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  linkWithCredential: vi.fn(),
  fetchSignInMethodsForEmail: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
  arrayUnion: vi.fn((val) => val),
  arrayRemove: vi.fn((val) => val),
  deleteField: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  })),
}));

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

#### Testing friends.js (existing tests can be extended)

```javascript
// web/src/lib/data/friends.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setDoc, getDoc, updateDoc, doc, collection } from 'firebase/firestore';
import { createFriendRequest, acceptFriendRequest } from './friends';

vi.mock('firebase/firestore');
vi.mock('../firebase', () => ({ db: {} }));

describe('friends data layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createFriendRequest', () => {
    it('creates request with normalized emails', async () => {
      vi.mocked(doc).mockReturnValue({ id: 'request-123' });
      vi.mocked(setDoc).mockResolvedValue(undefined);

      await createFriendRequest({
        fromUserId: 'alice',
        fromEmail: 'ALICE@example.com',
        toEmail: 'BOB@example.com',
      });

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fromEmail: 'alice@example.com',
          toEmail: 'bob@example.com',
          status: 'pending',
        }),
        expect.anything()
      );
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
  createUserWithEmailAndPassword,
  sendEmailVerification,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  updateProfile,
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

  describe('registerWithEmailPassword', () => {
    it('sends verification email after registration', async () => {
      const mockUser = { uid: 'user-123', email: 'test@example.com', displayName: null };
      vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
        user: mockUser,
      });
      vi.mocked(updateProfile).mockResolvedValue(undefined);
      vi.mocked(sendEmailVerification).mockResolvedValue(undefined);

      await registerWithEmailPassword('test@example.com', 'password123');

      expect(sendEmailVerification).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({ url: expect.any(String) })
      );
    });

    it('sets default display name from email', async () => {
      const mockUser = { uid: 'user-123', email: 'test@example.com', displayName: null };
      vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
        user: mockUser,
      });
      vi.mocked(updateProfile).mockResolvedValue(undefined);
      vi.mocked(sendEmailVerification).mockResolvedValue(undefined);

      await registerWithEmailPassword('test@example.com', 'password123');

      expect(updateProfile).toHaveBeenCalledWith(
        mockUser,
        { displayName: 'test@example.com' }
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

### Hook Tests

**Note:** `useUserSettings` uses `useFirestoreDoc` internally, which handles `onSnapshot`. Tests should mock `useFirestoreDoc` or test the hook's transformation logic.

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
          participants: ['alice@example.com'],
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
          participants: ['bob@example.com'],
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
          participants: ['alice@example.com'],
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
          members: ['alice@example.com'],
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
          members: ['alice@example.com', 'bob@example.com'],
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

## E2E Tests

### Critical User Journeys

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

    // Add friend by email
    await page.getByLabel(/email/i).fill('friend@example.com');
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
  },
  bob: {
    uid: 'test-bob',
    email: 'bob@test.example.com',
    password: 'BobPass123!',
    displayName: 'Bob Test',
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

**Note:** Many helper functions in `functions/src/legacy.js` (like `normalizeEmail`, `findUserIdByEmail`) are not exported - they're internal. Tests should focus on **exported callable functions** or use integration tests with the emulator.

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

  describe('discordOAuthCallback', () => {
    it('links Discord account on successful OAuth', async () => {
      // Test callback handling
    });

    it('rejects if Discord account already linked to another user', async () => {
      // Test duplicate link detection
    });
  });
});

// functions/src/discord/worker.test.js
describe('Discord worker functions', () => {
  describe('handleVoteInteraction', () => {
    it('updates vote in Firestore', async () => {
      // Test vote handling from Discord
    });
  });

  describe('buildSessionId', () => {
    it('creates deterministic session ID', () => {
      // This is an internal function, but if exported, test it
    });
  });
});
```

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
    "test:rules": "firebase emulators:exec --only firestore 'vitest run --config vitest.rules.config.js'",
    "test:integration": "firebase emulators:exec 'vitest run --config vitest.integration.config.js'",
    "test:all": "npm run test && npm run test:rules && npm run test:e2e",
    "emulators": "firebase emulators:start",
    "emulators:test": "firebase emulators:start --only firestore,auth"
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
        run: firebase emulators:exec --only firestore 'npm run test:rules'

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
      emailNotifications: true,
      createdAt: new Date(),
    });

    await setDoc(doc(db, 'usersPublic', user.uid), {
      email: user.email,
      displayName: user.displayName,
    });
  }

  // Seed schedulers
  for (const [key, scheduler] of Object.entries(testSchedulers)) {
    await setDoc(doc(db, 'schedulers', scheduler.id), {
      ...scheduler,
      participants: [testUsers.alice.email],
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

## Edge Cases & Error Scenarios

### Authentication Edge Cases

| Scenario | Test |
|----------|------|
| Expired session | User is redirected to login |
| Network failure during login | Error message shown, retry option |
| Google popup blocked | Fallback instructions shown |
| Email already registered (different provider) | Helpful error with link guidance |
| Password too weak | Validation error before submit |
| Invalid email format | Validation error before submit |
| Rate limited | Appropriate error message |

### Scheduler Edge Cases

| Scenario | Test |
|----------|------|
| Create poll with no slots | Validation error |
| Vote on finalized poll | Action disabled/error |
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
| Accept invite while logged out | Redirect to login, then accept |

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Configure Vitest with proper setup file
- [ ] Add React Testing Library
- [ ] Complete data layer unit tests (90% coverage)
- [ ] Complete auth helper unit tests

### Phase 2: Security & Integration (Week 3-4)
- [ ] Set up Firebase Emulator Suite
- [ ] Add @firebase/rules-unit-testing
- [ ] Write comprehensive Firestore rules tests
- [ ] Add integration tests for critical flows

### Phase 3: Component & Hook Tests (Week 5-6)
- [ ] Add component tests for UI components
- [ ] Add hook tests with mocked Firebase
- [ ] Achieve 60% component coverage

### Phase 4: E2E Tests (Week 7-8)
- [ ] Configure Playwright
- [ ] Write auth flow E2E tests
- [ ] Write scheduler flow E2E tests
- [ ] Write friends/groups E2E tests

### Phase 5: Cloud Functions (Week 9-10)
- [ ] Add Vitest to functions
- [ ] Unit test all callable functions
- [ ] Integration test with emulator

### Phase 6: CI/CD & Polish (Week 11-12)
- [ ] Set up GitHub Actions workflow
- [ ] Add coverage reporting
- [ ] Add test result artifacts
- [ ] Documentation and maintenance guide

## References

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Firebase Rules Unit Testing](https://firebase.google.com/docs/rules/unit-tests)
- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [MSW (Mock Service Worker)](https://mswjs.io/)
