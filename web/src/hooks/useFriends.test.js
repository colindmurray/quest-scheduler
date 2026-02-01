import { renderHook, act } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../app/useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'user-1',
      email: 'User@Example.com',
      displayName: 'User One',
      photoURL: 'https://example.com/user.png',
    },
  }),
}));

const useFirestoreCollectionMock = vi.fn();
vi.mock('./useFirestoreCollection', () => ({
  useFirestoreCollection: (...args) => useFirestoreCollectionMock(...args),
}));

const incomingFriendRequestsQueryMock = vi.fn(() => 'incoming-ref');
const outgoingFriendRequestsQueryMock = vi.fn(() => 'outgoing-ref');
const acceptedFriendRequestsFromQueryMock = vi.fn(() => 'accepted-from-ref');
const acceptedFriendRequestsToQueryMock = vi.fn(() => 'accepted-to-ref');
const createFriendRequestMock = vi.fn();
const acceptFriendRequestMock = vi.fn();
const declineFriendRequestMock = vi.fn();
const ensureFriendInviteCodeMock = vi.fn(() => 'invite-code');
const acceptFriendInviteLinkMock = vi.fn();
const removeFriendMock = vi.fn();

vi.mock('../lib/data/friends', () => ({
  incomingFriendRequestsQuery: (...args) => incomingFriendRequestsQueryMock(...args),
  outgoingFriendRequestsQuery: (...args) => outgoingFriendRequestsQueryMock(...args),
  acceptedFriendRequestsFromQuery: (...args) => acceptedFriendRequestsFromQueryMock(...args),
  acceptedFriendRequestsToQuery: (...args) => acceptedFriendRequestsToQueryMock(...args),
  createFriendRequest: (...args) => createFriendRequestMock(...args),
  acceptFriendRequest: (...args) => acceptFriendRequestMock(...args),
  declineFriendRequest: (...args) => declineFriendRequestMock(...args),
  ensureFriendInviteCode: (...args) => ensureFriendInviteCodeMock(...args),
  acceptFriendInviteLink: (...args) => acceptFriendInviteLinkMock(...args),
  removeFriend: (...args) => removeFriendMock(...args),
}));

import { useFriends } from './useFriends';

describe('useFriends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFirestoreCollectionMock.mockImplementation((ref) => {
      if (ref === 'incoming-ref') {
        return { data: [{ id: 'req-incoming' }], loading: false };
      }
      if (ref === 'outgoing-ref') {
        return { data: [{ id: 'req-outgoing' }], loading: false };
      }
      if (ref === 'accepted-from-ref') {
        return { data: [{ id: 'req-1', toEmail: 'friend@example.com' }], loading: false };
      }
      if (ref === 'accepted-to-ref') {
        return { data: [{ id: 'req-2', fromEmail: 'pal@example.com' }], loading: false };
      }
      return { data: [], loading: false };
    });
  });

  test('builds friend list and request map', () => {
    const { result } = renderHook(() => useFriends());

    expect(result.current.friends).toContain('friend@example.com');
    expect(result.current.friends).toContain('pal@example.com');
    expect(result.current.friendRequestMap.get('friend@example.com')).toBe('req-1');
    expect(result.current.friendRequestMap.get('pal@example.com')).toBe('req-2');
  });

  test('sendFriendRequest delegates to data helper', async () => {
    const { result } = renderHook(() => useFriends());

    await act(async () => {
      await result.current.sendFriendRequest('friend@example.com');
    });

    expect(createFriendRequestMock).toHaveBeenCalledWith({
      fromUserId: 'user-1',
      fromEmail: 'User@Example.com',
      toIdentifier: 'friend@example.com',
      fromDisplayName: 'User One',
    });
  });

  test('getInviteCode uses user profile details', async () => {
    const { result } = renderHook(() => useFriends());

    let code;
    await act(async () => {
      code = await result.current.getInviteCode();
    });

    expect(ensureFriendInviteCodeMock).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'User@Example.com',
      displayName: 'User One',
      photoURL: 'https://example.com/user.png',
    });
    expect(code).toBe('invite-code');
  });
});
