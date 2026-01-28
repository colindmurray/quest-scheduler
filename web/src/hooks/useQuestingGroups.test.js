import { renderHook, act } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../app/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'user1', email: 'user@example.com', displayName: 'User' },
  }),
}));

vi.mock('./useFriends', () => ({
  useFriends: () => ({ friends: [] }),
}));

const useFirestoreDocMock = vi.fn();
vi.mock('./useFirestoreDoc', () => ({
  useFirestoreDoc: (...args) => useFirestoreDocMock(...args),
}));

const useFirestoreCollectionMock = vi.fn();
vi.mock('./useFirestoreCollection', () => ({
  useFirestoreCollection: (...args) => useFirestoreCollectionMock(...args),
}));

vi.mock('./useUserProfiles', () => ({
  useUserProfilesByIds: () => ({ profiles: {} }),
}));

const createQuestingGroupMock = vi.fn(() => 'new-group');
const getDefaultGroupColorMock = vi.fn(() => 'default-color');

vi.mock('../lib/data/questingGroups', () => ({
  userGroupsByIdQuery: vi.fn(() => 'groups-query'),
  userPendingInvitesQuery: vi.fn(() => 'invites-query'),
  createQuestingGroup: (...args) => createQuestingGroupMock(...args),
  updateQuestingGroup: vi.fn(),
  inviteMemberToGroup: vi.fn(),
  acceptGroupInvitation: vi.fn(),
  declineGroupInvitation: vi.fn(),
  revokeGroupInvite: vi.fn(),
  removeMemberFromGroup: vi.fn(),
  leaveGroup: vi.fn(),
  deleteQuestingGroup: vi.fn(),
  removeMemberFromGroupPolls: vi.fn(),
  GROUP_COLORS: [],
  getDefaultGroupColor: (...args) => getDefaultGroupColorMock(...args),
}));

vi.mock('../lib/data/notifications', () => ({
  ensureGroupInviteNotification: vi.fn(),
}));

vi.mock('../lib/identifiers', () => ({
  resolveIdentifier: vi.fn(),
}));

vi.mock('../lib/data/friends', () => ({
  createFriendRequest: vi.fn(),
}));

vi.mock('../lib/emailTemplates', () => ({
  createEmailMessage: vi.fn(() => ({})),
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-time'),
  collection: vi.fn(),
}));

import { useQuestingGroups } from './useQuestingGroups';


describe('useQuestingGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFirestoreDocMock.mockReturnValue({ data: { groupColors: {} } });
    useFirestoreCollectionMock.mockImplementation((ref) => {
      if (ref === 'invites-query') {
        return { data: [], loading: false };
      }
      return {
        data: [{ id: 'group1', memberIds: [] }],
        loading: false,
      };
    });
  });

  test('getGroupColor falls back to default color', () => {
    const { result } = renderHook(() => useQuestingGroups());

    expect(result.current.getGroupColor('group1')).toBe('default-color');
    expect(getDefaultGroupColorMock).toHaveBeenCalledWith(0);
  });

  test('createGroup delegates to data layer', async () => {
    const { result } = renderHook(() => useQuestingGroups());

    await act(async () => {
      await result.current.createGroup('My Group', true);
    });

    expect(createQuestingGroupMock).toHaveBeenCalledWith({
      name: 'My Group',
      creatorId: 'user1',
      creatorEmail: 'user@example.com',
      memberManaged: true,
    });
  });
});
