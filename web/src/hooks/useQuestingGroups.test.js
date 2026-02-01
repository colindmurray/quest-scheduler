import { renderHook, act } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

let currentUser = { uid: 'user1', email: 'user@example.com', displayName: 'User' };
let friendsList = [];

vi.mock('../app/useAuth', () => ({
  useAuth: () => ({
    user: currentUser,
  }),
}));

vi.mock('./useFriends', () => ({
  useFriends: () => ({ friends: friendsList }),
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
const updateQuestingGroupMock = vi.fn();
const inviteMemberToGroupMock = vi.fn();
const acceptGroupInvitationMock = vi.fn();
const declineGroupInvitationMock = vi.fn();
const revokeGroupInviteMock = vi.fn();
const removeMemberFromGroupMock = vi.fn();
const leaveGroupMock = vi.fn();
const deleteQuestingGroupMock = vi.fn();
const removeMemberFromGroupPollsMock = vi.fn();
const getDefaultGroupColorMock = vi.fn(() => 'default-color');

vi.mock('../lib/data/questingGroups', () => ({
  userGroupsByIdQuery: vi.fn(() => 'groups-query'),
  userPendingInvitesQuery: vi.fn(() => 'invites-query'),
  createQuestingGroup: (...args) => createQuestingGroupMock(...args),
  updateQuestingGroup: (...args) => updateQuestingGroupMock(...args),
  inviteMemberToGroup: (...args) => inviteMemberToGroupMock(...args),
  acceptGroupInvitation: (...args) => acceptGroupInvitationMock(...args),
  declineGroupInvitation: (...args) => declineGroupInvitationMock(...args),
  revokeGroupInvite: (...args) => revokeGroupInviteMock(...args),
  removeMemberFromGroup: (...args) => removeMemberFromGroupMock(...args),
  leaveGroup: (...args) => leaveGroupMock(...args),
  deleteQuestingGroup: (...args) => deleteQuestingGroupMock(...args),
  removeMemberFromGroupPolls: (...args) => removeMemberFromGroupPollsMock(...args),
  GROUP_COLORS: [],
  getDefaultGroupColor: (...args) => getDefaultGroupColorMock(...args),
}));


const resolveIdentifierMock = vi.fn();
vi.mock('../lib/identifiers', () => ({
  resolveIdentifier: (...args) => resolveIdentifierMock(...args),
}));

const createFriendRequestMock = vi.fn();
vi.mock('../lib/data/friends', () => ({
  createFriendRequest: (...args) => createFriendRequestMock(...args),
}));


const persistGroupColorMock = vi.fn();
vi.mock('../lib/data/settings', () => ({
  userSettingsRef: vi.fn((userId) => (userId ? { id: userId } : null)),
  setGroupColor: (...args) => persistGroupColorMock(...args),
}));

const findUserIdByEmailMock = vi.fn();
vi.mock('../lib/data/users', () => ({
  findUserIdByEmail: (...args) => findUserIdByEmailMock(...args),
}));

import { useQuestingGroups } from './useQuestingGroups';


describe('useQuestingGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { uid: 'user1', email: 'user@example.com', displayName: 'User' };
    friendsList = [];
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

  test('getGroupColor uses stored preference', () => {
    useFirestoreDocMock.mockReturnValue({ data: { groupColors: { group1: 'purple' } } });
    const { result } = renderHook(() => useQuestingGroups());

    expect(result.current.getGroupColor('group1')).toBe('purple');
  });

  test('setGroupColor persists preferences', async () => {
    const { result } = renderHook(() => useQuestingGroups());

    await act(async () => {
      await result.current.setGroupColor('group1', 'red');
    });

    expect(persistGroupColorMock).toHaveBeenCalledWith('user1', {}, 'group1', 'red');
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

  test('inviteMember sends invite, email, and optional friend request', async () => {
    resolveIdentifierMock.mockResolvedValueOnce({
      email: 'Invitee@Example.com',
      userId: 'invitee-id',
    });
    const { result } = renderHook(() => useQuestingGroups());

    await act(async () => {
      await result.current.inviteMember('group1', 'Group', 'invitee', { sendFriendInvite: true });
    });

    expect(inviteMemberToGroupMock).toHaveBeenCalledWith(
      'group1',
      'Group',
      'user@example.com',
      'invitee@example.com',
      'invitee-id',
      'user1'
    );
    expect(createFriendRequestMock).toHaveBeenCalledWith(
      {
        fromUserId: 'user1',
        fromEmail: 'user@example.com',
        toEmail: 'invitee@example.com',
        fromDisplayName: 'User',
      },
      { sendEmail: false }
    );
  });

  test('inviteMember skips friend invite when already friends', async () => {
    friendsList = ['invitee@example.com'];
    resolveIdentifierMock.mockResolvedValueOnce({
      email: 'invitee@example.com',
      userId: null,
    });
    const { result } = renderHook(() => useQuestingGroups());

    await act(async () => {
      await result.current.inviteMember('group1', 'Group', 'invitee', { sendFriendInvite: true });
    });

    expect(createFriendRequestMock).not.toHaveBeenCalled();
  });

  test('acceptInvite and declineInvite delegate to data layer', async () => {
    const { result } = renderHook(() => useQuestingGroups());

    await act(async () => {
      await result.current.acceptInvite('group1');
      await result.current.declineInvite('group1');
    });

    expect(acceptGroupInvitationMock).toHaveBeenCalledWith('group1', 'user@example.com', 'user1');
    expect(declineGroupInvitationMock).toHaveBeenCalledWith('group1', 'user@example.com', 'user1');
  });

  test('removeMember looks up user id and optionally removes from polls', async () => {
    findUserIdByEmailMock.mockResolvedValueOnce('member-1');
    const { result } = renderHook(() => useQuestingGroups());

    await act(async () => {
      await result.current.removeMember('group1', 'Group', 'member@example.com', true);
    });

    expect(removeMemberFromGroupMock).toHaveBeenCalledWith(
      'group1',
      'Group',
      'member@example.com',
      'member-1',
      currentUser
    );
    expect(removeMemberFromGroupPollsMock).toHaveBeenCalledWith('group1', 'member@example.com');
  });

  test('leave removes member and polls', async () => {
    const { result } = renderHook(() => useQuestingGroups());

    await act(async () => {
      await result.current.leave('group1');
    });

    expect(leaveGroupMock).toHaveBeenCalledWith(
      'group1',
      'user@example.com',
      'user1',
      currentUser
    );
    expect(removeMemberFromGroupPollsMock).toHaveBeenCalledWith('group1', 'user@example.com');
  });

  test('revokeInvite and deleteGroup delegate to data layer', async () => {
    const { result } = renderHook(() => useQuestingGroups());

    await act(async () => {
      await result.current.revokeInvite('group1', 'invitee@example.com');
      await result.current.deleteGroup('group1');
    });

    expect(revokeGroupInviteMock).toHaveBeenCalledWith('group1', 'invitee@example.com');
    expect(deleteQuestingGroupMock).toHaveBeenCalledWith('group1');
  });

  test('isOwner and canManage evaluate permissions', () => {
    const { result } = renderHook(() => useQuestingGroups());
    const ownerGroup = { creatorId: 'user1', memberManaged: false, memberIds: [] };
    const memberManagedGroup = {
      creatorId: 'other',
      memberManaged: true,
      memberIds: ['user1'],
    };

    expect(result.current.isOwner(ownerGroup)).toBe(true);
    expect(result.current.canManage(ownerGroup)).toBe(true);
    expect(result.current.canManage(memberManagedGroup)).toBe(true);
    expect(result.current.canManage({ creatorId: 'other', memberManaged: false })).toBe(false);
  });

  test('inviteMember no-ops without user email', async () => {
    currentUser = { uid: 'user1' };
    const { result } = renderHook(() => useQuestingGroups());

    await act(async () => {
      await result.current.inviteMember('group1', 'Group', 'invitee');
    });

    expect(inviteMemberToGroupMock).not.toHaveBeenCalled();
  });
});
