import { renderHook, act } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../app/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } }),
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
});
