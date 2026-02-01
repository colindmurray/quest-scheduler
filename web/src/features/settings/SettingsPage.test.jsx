import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mockUser = {
  uid: 'user1',
  email: 'user@example.com',
  displayName: 'User',
  photoURL: null,
  providerData: [],
};

vi.mock('../../app/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    refreshUser: vi.fn(),
  }),
}));

vi.mock('../../app/useTheme', () => ({
  useTheme: () => ({ darkMode: false, setDarkMode: vi.fn() }),
}));

const fetchUserSettingsMock = vi.fn();
const saveUserSettingsMock = vi.fn();

vi.mock('../../lib/data/settings', () => ({
  fetchUserSettings: (...args) => fetchUserSettingsMock(...args),
  saveUserSettings: (...args) => saveUserSettingsMock(...args),
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

vi.mock('../../lib/firebase', () => ({ storage: {} }));

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
    fetchUserSettingsMock.mockResolvedValue({
      displayName: 'User',
      settings: {},
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

  test('renders advanced notification preferences when enabled', async () => {
    fetchUserSettingsMock.mockImplementationOnce(() =>
      Promise.resolve({
        displayName: 'User',
        settings: {
          notificationMode: 'advanced',
          notificationPreferences: {
            POLL_INVITE_SENT: 'inApp',
          },
        },
      })
    );

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(fetchUserSettingsMock).toHaveBeenCalled());
    const pollInviteSelect = await screen.findByLabelText('Poll invites');
    expect(pollInviteSelect.value).toBe('inApp');
  });
});
