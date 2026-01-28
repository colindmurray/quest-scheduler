import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

let currentUser = { uid: 'user-1' };

vi.mock('../app/useAuth', () => ({
  useAuth: () => ({ user: currentUser }),
}));

const useFirestoreCollectionMock = vi.fn();
vi.mock('./useFirestoreCollection', () => ({
  useFirestoreCollection: (...args) => useFirestoreCollectionMock(...args),
}));

const markNotificationReadMock = vi.fn();
const dismissNotificationMock = vi.fn();
const markAllNotificationsReadMock = vi.fn();
const dismissAllNotificationsMock = vi.fn();
const allNotificationsQueryMock = vi.fn(() => 'notifications-ref');

vi.mock('../lib/data/notifications', () => ({
  allNotificationsQuery: (...args) => allNotificationsQueryMock(...args),
  markNotificationRead: (...args) => markNotificationReadMock(...args),
  dismissNotification: (...args) => dismissNotificationMock(...args),
  markAllNotificationsRead: (...args) => markAllNotificationsReadMock(...args),
  dismissAllNotifications: (...args) => dismissAllNotificationsMock(...args),
}));

import { useNotifications } from './useNotifications';

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { uid: 'user-1' };
    useFirestoreCollectionMock.mockReturnValue({
      data: [
        { id: 'n1', read: false },
        { id: 'n2', read: true },
      ],
      loading: false,
      error: null,
    });
  });

  test('computes unread count', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.unreadCount).toBe(1);
  });

  test('markRead updates local state and calls backend', async () => {
    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.markRead('n1');
    });

    expect(markNotificationReadMock).toHaveBeenCalledWith('user-1', 'n1');
    expect(result.current.notifications.find((n) => n.id === 'n1')?.read).toBe(true);
  });

  test('markRead reverts local state when backend fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    markNotificationReadMock.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.markRead('n1');
    });

    expect(markNotificationReadMock).toHaveBeenCalledWith('user-1', 'n1');
    expect(result.current.notifications.find((n) => n.id === 'n1')?.read).toBe(false);
    errorSpy.mockRestore();
  });

  test('dismiss removes locally and calls backend', async () => {
    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.dismiss('n1');
    });

    expect(dismissNotificationMock).toHaveBeenCalledWith('user-1', 'n1');
    expect(result.current.notifications.some((n) => n.id === 'n1')).toBe(false);
  });

  test('dismissAll clears locally and calls backend', async () => {
    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.dismissAll();
    });

    expect(dismissAllNotificationsMock).toHaveBeenCalledWith('user-1', expect.any(Array));
    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(0);
    });
  });

  test('no-ops when user is missing', async () => {
    currentUser = null;
    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.markRead('n1');
      await result.current.dismiss('n1');
      await result.current.markAllRead();
      await result.current.dismissAll();
    });

    expect(markNotificationReadMock).not.toHaveBeenCalled();
    expect(dismissNotificationMock).not.toHaveBeenCalled();
    expect(markAllNotificationsReadMock).not.toHaveBeenCalled();
    expect(dismissAllNotificationsMock).not.toHaveBeenCalled();
  });
});
