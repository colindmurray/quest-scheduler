import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const firestoreMocks = {
  arrayRemove: vi.fn((value) => ({ __arrayRemove: value })),
  arrayUnion: vi.fn((value) => ({ __arrayUnion: value })),
  collection: vi.fn((...args) => ({ path: args.slice(1).join('/') })),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args) => ({ path: args.slice(1).join('/') })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((...args) => ({ queryArgs: args })),
  serverTimestamp: vi.fn(() => 'server-time'),
  updateDoc: vi.fn(),
  where: vi.fn((...args) => ({ whereArgs: args })),
};

const functionsMocks = {
  getFunctions: vi.fn(() => ({ name: 'functions' })),
  httpsCallable: vi.fn(),
};

const notificationsMocks = {
  createSessionJoinNotification: vi.fn(),
  deleteNotification: vi.fn(),
  pollInviteNotificationId: vi.fn((schedulerId) => `poll:${schedulerId}`),
};

const usersMocks = {
  findUserIdByEmail: vi.fn(),
};

vi.mock('firebase/firestore', () => firestoreMocks);
vi.mock('firebase/functions', () => functionsMocks);
vi.mock('../firebase', () => ({ db: { name: 'db' } }));
vi.mock('./notifications', () => notificationsMocks);
vi.mock('./users', () => ({ findUserIdByEmail: usersMocks.findUserIdByEmail }));

let pollInvites;

beforeAll(async () => {
  pollInvites = await import('./pollInvites');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pollInvites', () => {
  test('sendPendingPollInvites returns data payload', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { added: ['a'], rejected: [] } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await pollInvites.sendPendingPollInvites('sched1', ['a'], 'Title');

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'sendPollInvites'
    );
    expect(callable).toHaveBeenCalledWith({
      schedulerId: 'sched1',
      invitees: ['a'],
      schedulerTitle: 'Title',
    });
    expect(result).toEqual({ added: ['a'], rejected: [] });
  });

  test('sendPendingPollInvites returns default when data missing', async () => {
    const callable = vi.fn().mockResolvedValueOnce({});
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await pollInvites.sendPendingPollInvites('sched1', ['a'], 'Title');

    expect(result).toEqual({ added: [], rejected: [] });
  });

  test('acceptPollInvite throws when poll missing', async () => {
    firestoreMocks.getDoc.mockResolvedValueOnce({ exists: () => false });

    await expect(
      pollInvites.acceptPollInvite('sched1', 'user@example.com', 'user1')
    ).rejects.toThrow('Session poll not found.');
  });

  test('acceptPollInvite updates scheduler and sends notifications', async () => {
    const schedulerRef = { path: 'schedulers/sched1' };
    firestoreMocks.doc.mockReturnValueOnce(schedulerRef);
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ creatorId: 'creator1', title: 'Session', participantIds: [] }),
    });

    await pollInvites.acceptPollInvite('sched1', 'User@Example.com', 'user1');

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      schedulerRef,
      expect.objectContaining({
        pendingInvites: { __arrayRemove: 'user@example.com' },
        updatedAt: 'server-time',
        participantIds: { __arrayUnion: 'user1' },
      })
    );

    const updates = firestoreMocks.updateDoc.mock.calls[0][1];
    expect(updates['pendingInviteMeta.user@example.com']).toEqual({ __deleteField: true });

    expect(notificationsMocks.deleteNotification).toHaveBeenCalledWith(
      'user1',
      'poll:sched1'
    );
    expect(notificationsMocks.createSessionJoinNotification).toHaveBeenCalledWith(
      'creator1',
      expect.objectContaining({
        schedulerId: 'sched1',
        schedulerTitle: 'Session',
        participantEmail: 'user@example.com',
        participantUserId: 'user1',
      })
    );
  });

  test('declinePollInvite updates pending invite and deletes notification', async () => {
    const schedulerRef = { path: 'schedulers/sched2' };
    firestoreMocks.doc.mockReturnValueOnce(schedulerRef);

    await pollInvites.declinePollInvite('sched2', 'User@Example.com', 'user2');

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      schedulerRef,
      expect.objectContaining({
        pendingInvites: { __arrayRemove: 'user@example.com' },
        updatedAt: 'server-time',
      })
    );
    const updates = firestoreMocks.updateDoc.mock.calls[0][1];
    expect(updates['pendingInviteMeta.user@example.com']).toEqual({ __deleteField: true });
    expect(notificationsMocks.deleteNotification).toHaveBeenCalledWith(
      'user2',
      'poll:sched2'
    );
  });

  test('removeParticipantFromPoll removes user and votes by userId', async () => {
    const callable = vi.fn().mockResolvedValueOnce({});
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    await pollInvites.removeParticipantFromPoll(
      'sched3',
      'User@Example.com',
      true,
      true,
      'user3'
    );

    const updateCall = firestoreMocks.updateDoc.mock.calls[0][1];
    expect(updateCall.participantIds).toEqual({ __arrayRemove: 'user3' });
    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'revokePollInvite'
    );
    expect(callable).toHaveBeenCalledWith({
      schedulerId: 'sched3',
      inviteeEmail: 'user@example.com',
    });
    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith({
      path: 'schedulers/sched3/votes/user3',
    });
  });

  test('removeParticipantFromPoll removes votes by email when userId missing', async () => {
    usersMocks.findUserIdByEmail.mockResolvedValueOnce(null);
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ ref: 'vote1' }, { ref: 'vote2' }],
    });

    await pollInvites.removeParticipantFromPoll('sched4', 'user@example.com', true, false);

    expect(firestoreMocks.getDocs).toHaveBeenCalled();
    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith('vote1');
    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith('vote2');
  });
});
