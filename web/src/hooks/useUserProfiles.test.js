import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { getDocs } from 'firebase/firestore';

vi.mock('../lib/firebase', () => ({
  db: {},
}));

import { useUserProfiles, useUserProfilesByIds } from './useUserProfiles';

describe('useUserProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('fetches profiles by email and normalizes keys', async () => {
    const getDocsMock = vi.mocked(getDocs);
    getDocsMock.mockResolvedValue({
      docs: [
        {
          data: () => ({
            email: 'User@Example.com',
            displayName: 'User One',
            photoURL: 'https://example.com/user.png',
          }),
        },
      ],
    });

    const emails = ['USER@example.com'];
    const { result } = renderHook(() => useUserProfiles(emails));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profiles['user@example.com']).toEqual({
      email: 'User@Example.com',
      displayName: 'User One',
      photoURL: 'https://example.com/user.png',
      publicIdentifier: null,
      publicIdentifierType: null,
      qsUsername: null,
      discordUsername: null,
    });
    expect(result.current.getAvatar('USER@example.com')).toBe(
      'https://example.com/user.png'
    );
  });
});

describe('useUserProfilesByIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('fetches profiles by ids', async () => {
    const getDocsMock = vi.mocked(getDocs);
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'user-1',
          data: () => ({
            email: 'user@example.com',
            displayName: 'User One',
          }),
        },
      ],
    });

    const ids = ['user-1'];
    const { result } = renderHook(() => useUserProfilesByIds(ids));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profiles['user-1']).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'User One',
      photoURL: null,
      publicIdentifier: null,
      publicIdentifierType: null,
      qsUsername: null,
      discordUsername: null,
    });
  });
});
