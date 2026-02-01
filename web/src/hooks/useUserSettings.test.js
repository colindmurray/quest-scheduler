import { renderHook, act } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../app/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user1' } }),
}));

const useFirestoreDocMock = vi.fn();
vi.mock('./useFirestoreDoc', () => ({
  useFirestoreDoc: (...args) => useFirestoreDocMock(...args),
}));

const addArchivedPollMock = vi.fn();

vi.mock('../lib/data/settings', () => ({
  userSettingsRef: vi.fn((userId) => (userId ? { id: userId } : null)),
  addArchivedPoll: (...args) => addArchivedPollMock(...args),
  removeArchivedPoll: vi.fn(),
  setCalendarSyncPreference: vi.fn(),
  setGroupColor: vi.fn(),
}));

import { useUserSettings } from './useUserSettings';

describe('useUserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFirestoreDocMock.mockReturnValue({
      data: {
        archivedPolls: ['poll1'],
        groupColors: { group1: '#abc' },
        settings: {
          defaultStartTimes: {
            2: { time: '19:00', durationMinutes: 90 },
          },
        },
      },
      loading: false,
    });
  });

  test('archivePoll appends new poll and writes to Firestore', async () => {
    const { result } = renderHook(() => useUserSettings());

    await act(async () => {
      await result.current.archivePoll('poll2');
    });

    expect(addArchivedPollMock).toHaveBeenCalledWith('user1', 'poll2', ['poll1']);
  });

  test('archivePoll does nothing for existing poll', async () => {
    const { result } = renderHook(() => useUserSettings());

    await act(async () => {
      await result.current.archivePoll('poll1');
    });

    expect(addArchivedPollMock).toHaveBeenCalledWith('user1', 'poll1', ['poll1']);
  });

  test('getSessionDefaults uses per-day settings', () => {
    const { result } = renderHook(() => useUserSettings());

    expect(result.current.getSessionDefaults(2)).toEqual({
      time: '19:00',
      durationMinutes: 90,
    });
  });
});
