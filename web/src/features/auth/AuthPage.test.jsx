import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../app/useAuth', () => ({
  useAuth: () => ({ banned: false }),
}));

vi.mock('../../lib/config', () => ({
  APP_NAME: 'Quest Scheduler',
  GOOGLE_OAUTH_CLIENT_ID: '',
}));

vi.mock('../../lib/auth', () => ({
  registerWithEmailPassword: vi.fn(),
  resetPassword: vi.fn(),
  signInWithEmailPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithGoogleIdToken: vi.fn(),
}));

vi.mock('../../lib/data/discord', () => ({
  startDiscordLogin: vi.fn(),
}));

import AuthPage from './AuthPage';

describe('AuthPage', () => {
  test('renders login view by default', () => {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Welcome to Quest Scheduler')).toBeTruthy();
    expect(screen.getAllByText('Log in').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Create account').length).toBeGreaterThan(0);
  });

  test('switches to register tab', () => {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Create account'));
    expect(screen.getByText('Terms of Service')).toBeTruthy();
  });
});
