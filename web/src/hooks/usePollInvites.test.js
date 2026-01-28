import { renderHook, act } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../app/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user1', email: 'User@Example.com' } }),
}));

const useFirestoreCollectionMock = vi.fn();
vi.mock('./useFirestoreCollection', () => ({
  useFirestoreCollection: (...args) => useFirestoreCollectionMock(...args),
}));

const acceptPollInviteMock = vi.fn();
const declinePollInviteMock = vi.fn();
const pollPendingInvitesQueryMock = vi.fn(() => 'pending-ref');

vi.mock('../lib/data/pollInvites', () => ({
  acceptPollInvite: (...args) => acceptPollInviteMock(...args),
  declinePollInvite: (...args) => declinePollInviteMock(...args),
  pollPendingInvitesQuery: (...args) => pollPendingInvitesQueryMock(...args),
}));

import { usePollInvites } from './usePollInvites';

describe('usePollInvites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFirestoreCollectionMock.mockReturnValue({ data: ['invite1'], loading: false });
  });

  test('builds pending invites query with normalized email', () => {
    renderHook(() => usePollInvites());
    expect(pollPendingInvitesQueryMock).toHaveBeenCalledWith('user@example.com');
  });

  test('acceptInvite calls acceptPollInvite with user info', async () => {
    const { result } = renderHook(() => usePollInvites());

    await act(async () => {
      await result.current.acceptInvite('sched1');
    });

    expect(acceptPollInviteMock).toHaveBeenCalledWith('sched1', 'User@Example.com', 'user1');
  });

  test('declineInvite calls declinePollInvite with user info', async () => {
    const { result } = renderHook(() => usePollInvites());

    await act(async () => {
      await result.current.declineInvite('sched2');
    });

    expect(declinePollInviteMock).toHaveBeenCalledWith('sched2', 'User@Example.com', 'user1');
  });
});
