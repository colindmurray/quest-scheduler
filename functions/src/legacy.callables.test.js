import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let legacy;
let txGetMock;
let txSetMock;
let schedulerGetMock;
let schedulerUpdateMock;
let notificationDeleteMock;
let groupGetMock;
let groupUpdateMock;
let usersPublicByIdDoc;
let userDocExists;
let userDocData;
let userSetMock;
let friendRequestSetMock;
let friendRequestDeleteMock;
let friendRequestUpdateMock;
let notificationSetMock;
let friendRequestDocs;
let schedulerDocs;
let discordLinkCodeDocs;
let discordVoteSessionDocs;
let questingGroupsByMember;
let questingGroupsByInvite;
let questingGroupsByCreator;
let createdPollDocs;
let participantPollDocs;
let pendingPollDocs;
let notificationDocsFromEmail;
let notificationDocsInviter;
let voteDocsById;
let voteDocsByEmail;
let bannedEmailSetMock;
let discordUserLinkDeleteMock;
let discordRateLimitDeleteMock;
let recursiveDeleteMock;
let authDeleteMock;
let usersPublicDeleteMock;
let userSecretsDeleteMock;
let groupDeleteMock;
let batchDeleteDocMock;
let batchCommitMock;
let blockedDocsByEmail;
let blockedDocsByUid;
let blockedDocsByDiscord;
let blockedDocsByQs;
let blockedLegacyExists;

let usersPublicDocs;

const buildFirestoreMock = () => {
  const makeRef = (path) => ({ path });
  const friendRequestQuery = {
    where: () => friendRequestQuery,
    limit: () => ({
      get: async () => ({ docs: friendRequestDocs }),
    }),
    get: async () => ({ size: friendRequestDocs.length, docs: friendRequestDocs }),
  };
  const schedulerQuery = (field) => ({
    where: (nextField) => schedulerQuery(nextField),
    get: async () => {
      let docs = schedulerDocs;
      if (field === 'creatorId') docs = createdPollDocs;
      if (field === 'creatorEmail') docs = pendingPollDocs;
      if (field === 'participantIds') docs = participantPollDocs;
      if (field === 'pendingInvites') docs = pendingPollDocs;
      return {
        size: docs.length,
        docs,
        forEach: (cb) => docs.forEach(cb),
      };
    },
  });

  const questingGroupQuery = (field) => ({
    get: async () => {
      let docs = [];
      if (field === 'memberIds') docs = questingGroupsByMember;
      if (field === 'pendingInvites') docs = questingGroupsByInvite;
      if (field === 'creatorId') docs = questingGroupsByCreator;
      return { docs };
    },
  });
  return {
    runTransaction: async (fn) => fn({ get: txGetMock, set: txSetMock }),
    recursiveDelete: recursiveDeleteMock,
    batch: () => ({ delete: batchDeleteDocMock, commit: batchCommitMock }),
    collectionGroup: (name) => ({
      where: (field) => ({
        get: async () => {
          if (name === 'notifications') {
            const docs = field === 'metadata.fromEmail' ? notificationDocsFromEmail : notificationDocsInviter;
            return { docs };
          }
          if (name === 'votes') {
            const docs = field === 'userEmail' ? voteDocsByEmail : voteDocsById;
            return { docs };
          }
          return { docs: [] };
        },
      }),
    }),
    collection: (name) => {
      if (name === 'qsUsernames') {
        return { doc: (id) => makeRef(`qsUsernames/${id}`) };
      }
      if (name === 'bannedEmails') {
        return { doc: () => ({ set: bannedEmailSetMock }) };
      }
      if (name === 'users') {
        return {
          doc: (id) => ({
            path: `users/${id}`,
            get: async () =>
              userDocExists ? { exists: true, data: () => userDocData } : { exists: false },
            set: userSetMock,
            collection: (sub) => {
              if (sub === 'notifications') {
                return { doc: () => ({ set: notificationSetMock, delete: notificationDeleteMock }) };
              }
              if (sub === 'blockedUsers') {
                return {
                  doc: () => ({
                    get: async () => ({ exists: blockedLegacyExists, data: () => ({}) }),
                    delete: vi.fn().mockResolvedValue(undefined),
                    set: vi.fn().mockResolvedValue(undefined),
                  }),
                  where: (field) => ({
                    limit: () => ({
                      get: async () => {
                        let docs = [];
                        if (field === 'email') docs = blockedDocsByEmail;
                        if (field === 'blockedUserId') docs = blockedDocsByUid;
                        if (field === 'discordUsernameLower') docs = blockedDocsByDiscord;
                        if (field === 'qsUsernameLower') docs = blockedDocsByQs;
                        return { empty: docs.length === 0, docs };
                      },
                    }),
                    get: async () => {
                      let docs = [];
                      if (field === 'email') docs = blockedDocsByEmail;
                      if (field === 'blockedUserId') docs = blockedDocsByUid;
                      if (field === 'discordUsernameLower') docs = blockedDocsByDiscord;
                      if (field === 'qsUsernameLower') docs = blockedDocsByQs;
                      return { empty: docs.length === 0, docs };
                    },
                  }),
                };
              }
              return { doc: () => ({}) };
            },
          }),
        };
      }
      if (name === 'usersPublic') {
        return {
          doc: () => ({
            get: async () =>
              usersPublicByIdDoc
                ? { exists: true, data: () => usersPublicByIdDoc }
                : { exists: false },
            delete: usersPublicDeleteMock,
          }),
          where: () => ({
            limit: () => ({
              get: async () => ({ docs: usersPublicDocs }),
            }),
            get: async () => ({
              docs: usersPublicDocs,
              forEach: (cb) => usersPublicDocs.forEach(cb),
            }),
          }),
        };
      }
      if (name === 'userSecrets') {
        return { doc: () => ({ delete: userSecretsDeleteMock }) };
      }
      if (name === 'friendRequests') {
        return {
          where: () => friendRequestQuery,
          doc: () => ({ id: 'req1', set: friendRequestSetMock, delete: friendRequestDeleteMock }),
        };
      }
      if (name === 'discordUserLinks') {
        return { doc: () => ({ delete: discordUserLinkDeleteMock }) };
      }
      if (name === 'discordLinkCodeRateLimits') {
        return { doc: () => ({ delete: discordRateLimitDeleteMock }) };
      }
      if (name === 'discordLinkCodes') {
        return { where: () => ({ get: async () => ({ docs: discordLinkCodeDocs }) }) };
      }
      if (name === 'discordVoteSessions') {
        return { where: () => ({ get: async () => ({ docs: discordVoteSessionDocs }) }) };
      }
      if (name === 'questingGroups') {
        return {
          doc: () => ({
            get: groupGetMock,
            update: groupUpdateMock,
            delete: groupDeleteMock,
          }),
          where: (field) => questingGroupQuery(field),
        };
      }
      if (name === 'schedulers') {
        return {
          doc: () => ({
            get: schedulerGetMock,
            update: schedulerUpdateMock,
            ref: { update: schedulerUpdateMock },
          }),
          where: (field) => schedulerQuery(field),
        };
      }
      return { doc: () => makeRef(`${name}/unknown`) };
    },
  };
};

describe('legacy callables success paths', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    txGetMock = vi.fn();
    txSetMock = vi.fn();
    schedulerGetMock = vi.fn();
    schedulerUpdateMock = vi.fn();
    notificationDeleteMock = vi.fn().mockResolvedValue(undefined);
    groupGetMock = vi.fn();
    groupUpdateMock = vi.fn();
    usersPublicByIdDoc = null;
    usersPublicDocs = [];
    userDocExists = false;
    userDocData = null;
    userSetMock = vi.fn();
    friendRequestSetMock = vi.fn();
    friendRequestDeleteMock = vi.fn().mockResolvedValue(undefined);
    friendRequestUpdateMock = vi.fn().mockResolvedValue(undefined);
    notificationSetMock = vi.fn();
    friendRequestDocs = [];
    schedulerDocs = [];
    discordLinkCodeDocs = [];
    discordVoteSessionDocs = [];
    questingGroupsByMember = [];
    questingGroupsByInvite = [];
    questingGroupsByCreator = [];
    createdPollDocs = [];
    participantPollDocs = [];
    pendingPollDocs = [];
    notificationDocsFromEmail = [];
    notificationDocsInviter = [];
    voteDocsById = [];
    voteDocsByEmail = [];
    bannedEmailSetMock = vi.fn();
    discordUserLinkDeleteMock = vi.fn().mockResolvedValue(undefined);
    discordRateLimitDeleteMock = vi.fn().mockResolvedValue(undefined);
    recursiveDeleteMock = vi.fn().mockResolvedValue(undefined);
    authDeleteMock = vi.fn().mockResolvedValue(undefined);
    usersPublicDeleteMock = vi.fn().mockResolvedValue(undefined);
    userSecretsDeleteMock = vi.fn().mockResolvedValue(undefined);
    groupDeleteMock = vi.fn().mockResolvedValue(undefined);
    batchDeleteDocMock = vi.fn();
    batchCommitMock = vi.fn().mockResolvedValue(undefined);
    blockedDocsByEmail = [];
    blockedDocsByUid = [];
    blockedDocsByDiscord = [];
    blockedDocsByQs = [];
    blockedLegacyExists = false;

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => buildFirestoreMock(),
      auth: () => ({ deleteUser: authDeleteMock }),
    };
    adminMock.firestore.FieldPath = { documentId: () => 'documentId' };

    const functionsMock = {
      https: {
        HttpsError: class HttpsError extends Error {
          constructor(code, message) {
            super(message);
            this.code = code;
          }
        },
        onCall: (handler) => {
          const fn = (data, context) => handler(data, context);
          fn.run = handler;
          return fn;
        },
        onRequest: (handler) => {
          const fn = (req, res) => handler(req, res);
          fn.run = handler;
          return fn;
        },
      },
      runWith: () => functionsMock,
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-admin/firestore')] = {
      exports: {
        FieldValue: {
          serverTimestamp: vi.fn(() => 'now'),
          delete: vi.fn(() => 'deleted'),
          arrayUnion: vi.fn((value) => ({ arrayUnion: value })),
          arrayRemove: vi.fn((value) => ({ arrayRemove: value })),
        },
      },
    };
    require.cache[require.resolve('firebase-functions/v1')] = { exports: functionsMock };
    require.cache[require.resolve('firebase-functions/params')] = {
      exports: { defineJsonSecret: () => ({ value: () => ({}) }) },
    };
    require.cache[require.resolve('googleapis')] = {
      exports: { google: { auth: { OAuth2: vi.fn() } } },
    };

    legacy = await import('./legacy');
  });

  test('registerQsUsername stores username when available', async () => {
    txGetMock.mockImplementation(async (ref) => {
      if (ref.path.startsWith('qsUsernames/')) {
        return { exists: false };
      }
      if (ref.path.startsWith('users/')) {
        return { exists: false, data: () => ({}) };
      }
      return { exists: false };
    });

    const result = await legacy.registerQsUsername.run(
      { username: 'Hero_1' },
      { auth: { uid: 'user1', token: { email: 'user@example.com' } } }
    );

    expect(result).toEqual({ username: 'hero_1' });
    expect(txSetMock).toHaveBeenCalled();
  });

  test('revokePollInvite updates pending list and deletes notification', async () => {
    schedulerGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        creatorId: 'creator1',
        pendingInvites: ['invitee@example.com'],
        pendingInviteMeta: { 'invitee@example.com': { invitedAt: 1 } },
      }),
    });
    usersPublicDocs = [{ id: 'inviteeId', data: () => ({ email: 'invitee@example.com' }) }];

    const result = await legacy.revokePollInvite.run(
      { schedulerId: 'sched1', inviteeEmail: 'invitee@example.com' },
      { auth: { uid: 'creator1', token: { email: 'creator@example.com' } } }
    );

    expect(result).toEqual({ ok: true });
    expect(schedulerUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingInvites: [],
        pendingInviteMeta: {},
      })
    );
    expect(notificationDeleteMock).toHaveBeenCalled();
  });

  test('sendGroupInvite updates pending invites for managers', async () => {
    groupGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        creatorId: 'creator1',
        memberIds: [],
        pendingInvites: [],
        memberManaged: false,
      }),
    });
    usersPublicByIdDoc = { discordUsernameLower: 'discord', qsUsernameLower: 'qs' };

    const result = await legacy.sendGroupInvite.run(
      { groupId: 'group1', inviteeEmail: 'invitee@example.com' },
      { auth: { uid: 'creator1', token: { email: 'creator@example.com' } } }
    );

    expect(result).toEqual({ added: true, inviteeUserId: null });
    expect(groupUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingInvites: expect.objectContaining({ arrayUnion: 'invitee@example.com' }),
      })
    );
  });

  test('revokeGroupInvite removes pending invite and deletes notification', async () => {
    groupGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        creatorId: 'creator1',
        memberIds: [],
        memberManaged: false,
      }),
    });
    usersPublicDocs = [{ id: 'inviteeId', data: () => ({ email: 'invitee@example.com' }) }];

    const result = await legacy.revokeGroupInvite.run(
      { groupId: 'group1', inviteeEmail: 'invitee@example.com' },
      { auth: { uid: 'creator1', token: { email: 'creator@example.com' } } }
    );

    expect(result).toEqual({ ok: true });
    expect(groupUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingInvites: expect.objectContaining({ arrayRemove: 'invitee@example.com' }),
      })
    );
    expect(notificationDeleteMock).toHaveBeenCalled();
  });

  test('sendFriendRequest creates request and notification', async () => {
    userDocExists = true;
    userDocData = { inviteAllowance: 5, suspended: false };
    usersPublicByIdDoc = { discordUsernameLower: 'discord', qsUsernameLower: 'qs' };
    usersPublicDocs = [{ id: 'inviteeId', data: () => ({ email: 'invitee@example.com' }) }];

    const result = await legacy.sendFriendRequest.run(
      { toEmail: 'invitee@example.com' },
      { auth: { uid: 'sender1', token: { email: 'sender@example.com', name: 'Sender' } } }
    );

    expect(result).toEqual({ requestId: 'req1', toUserId: 'inviteeId' });
    expect(friendRequestSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fromUserId: 'sender1',
        toEmail: 'invitee@example.com',
        status: 'pending',
      })
    );
    expect(notificationSetMock).toHaveBeenCalled();
  });

  test('acceptFriendInviteLink accepts pending request', async () => {
    usersPublicDocs = [
      {
        id: 'senderId',
        data: () => ({ email: 'sender@example.com', displayName: 'Sender' }),
      },
    ];
    friendRequestDocs = [
      {
        id: 'req2',
        data: () => ({ status: 'pending' }),
        ref: { update: friendRequestUpdateMock },
      },
    ];

    const result = await legacy.acceptFriendInviteLink.run(
      { inviteCode: 'invite-code' },
      { auth: { uid: 'receiver1', token: { email: 'receiver@example.com' } } }
    );

    expect(friendRequestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted', toUserId: 'receiver1' })
    );
    expect(notificationSetMock).toHaveBeenCalled();
    expect(notificationDeleteMock).toHaveBeenCalled();
    expect(result).toEqual({
      senderEmail: 'sender@example.com',
      senderDisplayName: 'Sender',
    });
  });

  test('deleteUserAccount cleans up data and deletes auth user', async () => {
    userDocExists = true;
    userDocData = {
      inviteAllowance: 5,
      suspended: false,
      discord: { userId: '123' },
    };
    discordLinkCodeDocs = [{ ref: { id: 'link1' } }];
    discordVoteSessionDocs = [{ ref: { id: 'voteSession1' } }];
    questingGroupsByMember = [
      {
        id: 'group1',
        data: () => ({
          memberIds: ['user1'],
          pendingInvites: ['user@example.com'],
          creatorId: 'other',
          memberManaged: true,
        }),
      },
    ];
    questingGroupsByCreator = [
      {
        id: 'group2',
        data: () => ({
          creatorId: 'user1',
          memberManaged: false,
          memberIds: [],
          pendingInvites: [],
        }),
      },
    ];
    createdPollDocs = [{ ref: { id: 'poll1' } }];
    participantPollDocs = [
      {
        data: () => ({ creatorId: 'other' }),
        ref: {
          update: vi.fn(),
          collection: () => ({ doc: () => ({ delete: vi.fn() }) }),
        },
      },
    ];
    pendingPollDocs = [
      {
        ref: { update: vi.fn() },
      },
    ];
    voteDocsById = [{ ref: { id: 'vote1' } }];

    const result = await legacy.deleteUserAccount.run(
      {},
      { auth: { uid: 'user1', token: { email: 'user@example.com' } } }
    );

    expect(result).toEqual({ ok: true });
    expect(discordUserLinkDeleteMock).toHaveBeenCalled();
    expect(discordRateLimitDeleteMock).toHaveBeenCalled();
    expect(groupDeleteMock).toHaveBeenCalled();
    expect(usersPublicDeleteMock).toHaveBeenCalled();
    expect(userSecretsDeleteMock).toHaveBeenCalled();
    expect(authDeleteMock).toHaveBeenCalledWith('user1');
  });

  test('deleteUserAccount continues when notification cleanup fails', async () => {
    notificationDocsFromEmail = null;

    const result = await legacy.deleteUserAccount.run(
      {},
      { auth: { uid: 'user1', token: { email: 'user@example.com' } } }
    );

    expect(result).toEqual({ ok: true });
    expect(authDeleteMock).toHaveBeenCalledWith('user1');
  });

  test('deleteUserAccount throws internal error when auth deletion fails', async () => {
    authDeleteMock.mockRejectedValueOnce(new Error('boom'));

    await expect(
      legacy.deleteUserAccount.run(
        {},
        { auth: { uid: 'user1', token: { email: 'user@example.com' } } }
      )
    ).rejects.toMatchObject({ code: 'internal' });
  });

  test('sendPollInvites updates scheduler and notifies invitees', async () => {
    userDocExists = true;
    userDocData = { inviteAllowance: 5, suspended: false };
    usersPublicByIdDoc = { discordUsernameLower: 'discord', qsUsernameLower: 'qs' };
    usersPublicDocs = [{ id: 'inviteeId', data: () => ({ email: 'invitee@example.com' }) }];
    schedulerGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        creatorId: 'creator1',
        participantIds: [],
        pendingInvites: [],
        title: 'Session',
      }),
    });

    const result = await legacy.sendPollInvites.run(
      { schedulerId: 'sched1', invitees: ['invitee@example.com'] },
      { auth: { uid: 'creator1', token: { email: 'creator@example.com' } } }
    );

    expect(result).toEqual({
      added: ['invitee@example.com'],
      rejected: [],
    });
    expect(schedulerUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingInvites: ['invitee@example.com'],
      })
    );
    expect(notificationSetMock).toHaveBeenCalled();
  });

  test('blockUser removes pending friend request and penalizes offender', async () => {
    usersPublicByIdDoc = { discordUsernameLower: 'inviter', qsUsernameLower: 'inviter' };
    usersPublicDocs = [{ id: 'targetId', data: () => ({ email: 'target@example.com' }) }];
    friendRequestDocs = [
      {
        id: 'req1',
        data: () => ({ status: 'pending', fromUserId: 'offender1' }),
        ref: { delete: friendRequestDeleteMock },
      },
    ];
    txGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ inviteAllowance: 5, suspended: false }),
    });

    const result = await legacy.blockUser.run(
      { identifier: 'target@example.com' },
      { auth: { uid: 'blocker1', token: { email: 'blocker@example.com' } } }
    );

    expect(result).toEqual({ ok: true, penalized: true });
    expect(friendRequestDeleteMock).toHaveBeenCalled();
    expect(notificationDeleteMock).toHaveBeenCalled();
    expect(txSetMock).toHaveBeenCalled();
  });

  test('unblockUser deletes blocks and restores allowance when penalized', async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    blockedDocsByEmail = [
      {
        id: 'block1',
        ref: { delete: deleteMock },
        data: () => ({ penalized: true, blockedUserId: 'offender1' }),
      },
    ];
    txGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ inviteAllowance: 0, suspended: true }),
    });

    const result = await legacy.unblockUser.run(
      { identifier: 'target@example.com' },
      { auth: { uid: 'blocker1', token: { email: 'blocker@example.com' } } }
    );

    expect(result).toEqual({ ok: true });
    expect(deleteMock).toHaveBeenCalled();
    expect(txSetMock).toHaveBeenCalled();
  });
});
