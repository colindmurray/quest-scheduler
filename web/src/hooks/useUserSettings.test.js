import { renderHook, act } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../app/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user1' } }),
}));

const useFirestoreDocMock = vi.fn();
vi.mock('./useFirestoreDoc', () => ({
  useFirestoreDoc: (...args) => useFirestoreDocMock(...args),
}));

const setDocMock = vi.fn();
const docMock = vi.fn(() => ({ id: 'user1' }));
const serverTimestampMock = vi.fn(() => 'server-time');

vi.mock('firebase/firestore', () => ({
  doc: (...args) => docMock(...args),
  setDoc: (...args) => setDocMock(...args),
  serverTimestamp: () => serverTimestampMock(),
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

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

    expect(setDocMock).toHaveBeenCalledWith(
      { id: 'user1' },
      expect.objectContaining({
        archivedPolls: ['poll1', 'poll2'],
        updatedAt: 'server-time',
      }),
      { merge: true }
    );
  });

  test('archivePoll does nothing for existing poll', async () => {
    const { result } = renderHook(() => useUserSettings());

    await act(async () => {
      await result.current.archivePoll('poll1');
    });

    expect(setDocMock).not.toHaveBeenCalled();
  });

  test('getSessionDefaults uses per-day settings', () => {
    const { result } = renderHook(() => useUserSettings());

    expect(result.current.getSessionDefaults(2)).toEqual({
      time: '19:00',
      durationMinutes: 90,
    });
  });
});
