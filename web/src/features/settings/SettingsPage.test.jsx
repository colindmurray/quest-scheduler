import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../app/useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'user1',
      email: 'user@example.com',
      displayName: 'User',
      photoURL: null,
      providerData: [],
    },
  }),
}));

vi.mock('../../app/useTheme', () => ({
  useTheme: () => ({ darkMode: false }),
}));

const getDocMock = vi.fn();
const setDocMock = vi.fn();
const serverTimestampMock = vi.fn(() => 'server-time');

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ id: 'user1' })),
  getDoc: (...args) => getDocMock(...args),
  setDoc: (...args) => setDocMock(...args),
  serverTimestamp: () => serverTimestampMock(),
}));

vi.mock('firebase/storage', () => ({
  deleteObject: vi.fn(),
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(() => vi.fn()),
}));

vi.mock('../../lib/firebase', () => ({ db: {}, storage: {} }));

vi.mock('../../lib/auth', () => ({
  linkGoogleAccount: vi.fn(),
  resendVerificationEmail: vi.fn(),
  signOutUser: vi.fn(),
}));

vi.mock('../../lib/data/discord', () => ({
  startDiscordOAuth: vi.fn(),
  unlinkDiscordAccount: vi.fn(),
}));

vi.mock('../../lib/data/usernames', () => ({
  registerQsUsername: vi.fn(),
}));

vi.mock('../../lib/identity', () => ({
  buildPublicIdentifier: vi.fn(() => 'user@example.com'),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import SettingsPage from './SettingsPage';

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        displayName: 'User',
        settings: {},
      }),
    });
  });

  test('renders loading state initially', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Loading settings...')).toBeTruthy();
  });
});
