import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const firestoreMocks = {
  arrayRemove: vi.fn((value) => ({ __arrayRemove: value })),
  arrayUnion: vi.fn((value) => ({ __arrayUnion: value })),
  collection: vi.fn((...args) => ({ path: args.slice(1).join('/') })),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args) => {
    if (args[0] && typeof args[0] === 'object' && args[0].path && args.length === 2) {
      return { path: `${args[0].path}/${args[1]}` };
    }
    return { path: args.slice(1).join('/') };
  }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((...args) => ({ queryArgs: args })),
  serverTimestamp: vi.fn(() => 'server-time'),
  updateDoc: vi.fn(),
  waitForPendingWrites: vi.fn(),
  where: vi.fn((...args) => ({ whereArgs: args })),
};

const functionsMocks = {
  getFunctions: vi.fn(() => ({ name: 'functions' })),
  httpsCallable: vi.fn(),
};

const notificationsMocks = {
  emitNotificationEvent: vi.fn(),
  dismissNotification: vi.fn(),
  dismissNotificationsByResource: vi.fn(),
  pollInviteNotificationId: vi.fn(
    (schedulerId, email) => `dedupe:poll:${schedulerId}:invite:${email}`
  ),
  pollInviteLegacyNotificationId: vi.fn((schedulerId) => `pollInvite:${schedulerId}`),
};

const usersMocks = {
  findUserIdByEmail: vi.fn(),
};

const basicPollsMocks = {
  deleteBasicPollVote: vi.fn(),
};

vi.mock('firebase/firestore', () => firestoreMocks);
vi.mock('firebase/functions', () => functionsMocks);
vi.mock('../firebase', () => ({ db: { name: 'db' } }));
vi.mock('./notification-events', () => notificationsMocks);
vi.mock('./notifications', () => ({
  dismissNotification: (...args) => notificationsMocks.dismissNotification(...args),
  dismissNotificationsByResource: (...args) =>
    notificationsMocks.dismissNotificationsByResource(...args),
  pollInviteNotificationId: (...args) => notificationsMocks.pollInviteNotificationId(...args),
  pollInviteLegacyNotificationId: (...args) =>
    notificationsMocks.pollInviteLegacyNotificationId(...args),
}));
vi.mock('./users', () => ({ findUserIdByEmail: usersMocks.findUserIdByEmail }));
vi.mock('./basicPolls', () => ({
  deleteBasicPollVote: (...args) => basicPollsMocks.deleteBasicPollVote(...args),
}));

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

    expect(notificationsMocks.emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'POLL_INVITE_ACCEPTED',
        resource: { type: 'poll', id: 'sched1', title: 'Session' },
        actor: { uid: 'user1', email: 'user@example.com' },
        recipients: { userIds: ['creator1'], emails: [] },
      })
    );
    expect(notificationsMocks.pollInviteNotificationId).toHaveBeenCalledWith(
      'sched1',
      'user@example.com'
    );
    expect(notificationsMocks.pollInviteLegacyNotificationId).toHaveBeenCalledWith('sched1');
    expect(notificationsMocks.dismissNotification).toHaveBeenCalledWith(
      'user1',
      'dedupe:poll:sched1:invite:user@example.com'
    );
    expect(notificationsMocks.dismissNotification).toHaveBeenCalledWith(
      'user1',
      'pollInvite:sched1'
    );
    expect(notificationsMocks.dismissNotificationsByResource).toHaveBeenCalledWith(
      'user1',
      'sched1',
      ['POLL_INVITE_SENT', 'POLL_INVITE']
    );
  });

  test('acceptPollInvite clears pending invite even when already participant', async () => {
    const schedulerRef = { path: 'schedulers/sched1' };
    firestoreMocks.doc.mockReturnValueOnce(schedulerRef);
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ creatorId: 'creator1', title: 'Session', participantIds: ['user1'] }),
    });

    await pollInvites.acceptPollInvite('sched1', 'User@Example.com', 'user1');

    const updates = firestoreMocks.updateDoc.mock.calls[0][1];
    expect(updates.pendingInvites).toEqual({ __arrayRemove: 'user@example.com' });
    expect(updates.participantIds).toBeUndefined();
    expect(notificationsMocks.pollInviteNotificationId).toHaveBeenCalledWith(
      'sched1',
      'user@example.com'
    );
    expect(notificationsMocks.pollInviteLegacyNotificationId).toHaveBeenCalledWith('sched1');
    expect(notificationsMocks.dismissNotification).toHaveBeenCalledWith(
      'user1',
      'dedupe:poll:sched1:invite:user@example.com'
    );
    expect(notificationsMocks.dismissNotification).toHaveBeenCalledWith(
      'user1',
      'pollInvite:sched1'
    );
    expect(notificationsMocks.dismissNotificationsByResource).toHaveBeenCalledWith(
      'user1',
      'sched1',
      ['POLL_INVITE_SENT', 'POLL_INVITE']
    );
  });

  test('declinePollInvite removes votes, updates pending invite, and emits decline event', async () => {
    const schedulerRef = { path: 'schedulers/sched2' };
    firestoreMocks.doc.mockReturnValueOnce(schedulerRef);
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ creatorId: 'creator2', title: 'Session Two' }),
    });

    await pollInvites.declinePollInvite('sched2', 'User@Example.com', 'user2');

    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith({
      path: 'schedulers/sched2/votes/user2',
    });
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      schedulerRef,
      expect.objectContaining({
        pendingInvites: { __arrayRemove: 'user@example.com' },
        participantIds: { __arrayRemove: 'user2' },
        updatedAt: 'server-time',
      })
    );
    const updates = firestoreMocks.updateDoc.mock.calls[0][1];
    expect(updates['pendingInviteMeta.user@example.com']).toEqual({ __deleteField: true });
    expect(firestoreMocks.deleteDoc.mock.invocationCallOrder[0]).toBeLessThan(
      firestoreMocks.updateDoc.mock.invocationCallOrder[0]
    );
    expect(notificationsMocks.emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'POLL_INVITE_DECLINED',
        resource: { type: 'poll', id: 'sched2', title: 'Session Two' },
        actor: { uid: 'user2', email: 'user@example.com' },
        recipients: { userIds: ['creator2'], emails: [] },
      })
    );
    expect(notificationsMocks.pollInviteNotificationId).toHaveBeenCalledWith(
      'sched2',
      'user@example.com'
    );
    expect(notificationsMocks.pollInviteLegacyNotificationId).toHaveBeenCalledWith('sched2');
    expect(notificationsMocks.dismissNotification).toHaveBeenCalledWith(
      'user2',
      'dedupe:poll:sched2:invite:user@example.com'
    );
    expect(notificationsMocks.dismissNotification).toHaveBeenCalledWith(
      'user2',
      'pollInvite:sched2'
    );
    expect(notificationsMocks.dismissNotificationsByResource).toHaveBeenCalledWith(
      'user2',
      'sched2',
      ['POLL_INVITE_SENT', 'POLL_INVITE']
    );
  });

  test('declinePollInvite removes votes by email when userId missing', async () => {
    const schedulerRef = { path: 'schedulers/sched3' };
    firestoreMocks.doc.mockReturnValueOnce(schedulerRef);
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ creatorId: 'creator3', title: 'Session Three' }),
    });
    usersMocks.findUserIdByEmail.mockResolvedValueOnce(null);
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ ref: 'voteA' }, { ref: 'voteB' }],
    });

    await pollInvites.declinePollInvite('sched3', 'User@Example.com');

    expect(firestoreMocks.getDocs).toHaveBeenCalled();
    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith('voteA');
    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith('voteB');
    const updates = firestoreMocks.updateDoc.mock.calls[0][1];
    expect(updates.pendingInvites).toEqual({ __arrayRemove: 'user@example.com' });
    expect(updates.participantIds).toBeUndefined();
    expect(notificationsMocks.dismissNotification).not.toHaveBeenCalled();
  });

  test('removeParticipantFromPoll removes user and votes by userId', async () => {
    const callable = vi.fn().mockResolvedValueOnce({});
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ id: 'bp-1' }, { id: 'bp-2' }],
    });

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
    expect(firestoreMocks.getDocs).toHaveBeenCalledWith({
      path: 'schedulers/sched3/basicPolls',
    });
    expect(basicPollsMocks.deleteBasicPollVote).toHaveBeenCalledWith(
      'scheduler',
      'sched3',
      'bp-1',
      'user3'
    );
    expect(basicPollsMocks.deleteBasicPollVote).toHaveBeenCalledWith(
      'scheduler',
      'sched3',
      'bp-2',
      'user3'
    );
    expect(Math.min(...firestoreMocks.deleteDoc.mock.invocationCallOrder)).toBeLessThan(
      firestoreMocks.updateDoc.mock.invocationCallOrder[0]
    );
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
    expect(Math.min(...firestoreMocks.deleteDoc.mock.invocationCallOrder)).toBeLessThan(
      firestoreMocks.updateDoc.mock.invocationCallOrder[0]
    );
  });
});
