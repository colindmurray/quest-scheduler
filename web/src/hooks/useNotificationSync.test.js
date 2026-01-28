import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../app/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user-1', email: 'User@Example.com' } }),
}));

const useFirestoreCollectionMock = vi.fn();
vi.mock('./useFirestoreCollection', () => ({
  useFirestoreCollection: (...args) => useFirestoreCollectionMock(...args),
}));

const incomingFriendRequestsQueryMock = vi.fn(() => 'incoming-ref');
const userPendingInvitesQueryMock = vi.fn(() => 'groups-ref');
const pollPendingInvitesQueryMock = vi.fn(() => 'polls-ref');
const ensureFriendRequestNotificationMock = vi.fn(() => Promise.resolve());
const ensureGroupInviteNotificationMock = vi.fn(() => Promise.resolve());
const ensurePollInviteNotificationMock = vi.fn(() => Promise.resolve());

vi.mock('../lib/data/friends', () => ({
  incomingFriendRequestsQuery: (...args) => incomingFriendRequestsQueryMock(...args),
}));

vi.mock('../lib/data/questingGroups', () => ({
  userPendingInvitesQuery: (...args) => userPendingInvitesQueryMock(...args),
}));

vi.mock('../lib/data/pollInvites', () => ({
  pollPendingInvitesQuery: (...args) => pollPendingInvitesQueryMock(...args),
}));

vi.mock('../lib/data/notifications', () => ({
  ensureFriendRequestNotification: (...args) => ensureFriendRequestNotificationMock(...args),
  ensureGroupInviteNotification: (...args) => ensureGroupInviteNotificationMock(...args),
  ensurePollInviteNotification: (...args) => ensurePollInviteNotificationMock(...args),
}));

import { useNotificationSync } from './useNotificationSync';

describe('useNotificationSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFirestoreCollectionMock.mockImplementation((ref) => {
      if (ref === 'incoming-ref') {
        return {
          data: [{ id: 'req-1', fromEmail: 'friend@example.com' }],
          loading: false,
        };
      }
      if (ref === 'groups-ref') {
        return {
          data: [
            {
              id: 'group-1',
              name: 'Adventurers',
              creatorEmail: 'leader@example.com',
            },
          ],
          loading: false,
        };
      }
      if (ref === 'polls-ref') {
        return {
          data: [
            {
              id: 'poll-1',
              title: 'Session 1',
              creatorEmail: 'dm@example.com',
            },
          ],
          loading: false,
        };
      }
      return { data: [], loading: false };
    });
  });

  test('sends notifications for pending items', async () => {
    renderHook(() => useNotificationSync());

    await waitFor(() => {
      expect(ensureFriendRequestNotificationMock).toHaveBeenCalledWith('user-1', {
        requestId: 'req-1',
        fromEmail: 'friend@example.com',
      });
      expect(ensureGroupInviteNotificationMock).toHaveBeenCalledWith('user-1', {
        groupId: 'group-1',
        groupName: 'Adventurers',
        inviterEmail: 'leader@example.com',
      });
      expect(ensurePollInviteNotificationMock).toHaveBeenCalledWith('user-1', {
        schedulerId: 'poll-1',
        schedulerTitle: 'Session 1',
        inviterEmail: 'dm@example.com',
      });
    });
  });
});
