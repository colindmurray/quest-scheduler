import { renderHook, act } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../app/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user1' } }),
}));

const useFirestoreCollectionMock = vi.fn();
vi.mock('./useFirestoreCollection', () => ({
  useFirestoreCollection: (...args) => useFirestoreCollectionMock(...args),
}));

const blockedUsersQueryMock = vi.fn(() => 'blocked-ref');
const blockUserByIdentifierMock = vi.fn();
const unblockUserByIdentifierMock = vi.fn();

vi.mock('../lib/data/blocks', () => ({
  blockedUsersQuery: (...args) => blockedUsersQueryMock(...args),
  blockUserByIdentifier: (...args) => blockUserByIdentifierMock(...args),
  unblockUserByIdentifier: (...args) => unblockUserByIdentifierMock(...args),
}));

import { useBlockedUsers } from './useBlockedUsers';

describe('useBlockedUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFirestoreCollectionMock.mockReturnValue({ data: ['block1'], loading: false });
  });

  test('loads blocked users collection', () => {
    renderHook(() => useBlockedUsers());
    expect(blockedUsersQueryMock).toHaveBeenCalledWith('user1');
  });

  test('blockUser and unblockUser delegate to data layer', async () => {
    const { result } = renderHook(() => useBlockedUsers());

    await act(async () => {
      await result.current.blockUser('test@example.com');
    });
    await act(async () => {
      await result.current.unblockUser('test@example.com');
    });

    expect(blockUserByIdentifierMock).toHaveBeenCalledWith('test@example.com');
    expect(unblockUserByIdentifierMock).toHaveBeenCalledWith('test@example.com');
  });

  test('blockUser ignores empty identifier', async () => {
    const { result } = renderHook(() => useBlockedUsers());

    await act(async () => {
      await result.current.blockUser('');
    });

    expect(blockUserByIdentifierMock).not.toHaveBeenCalled();
  });
});
