import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

let legacy;
let schedulerGetMock;
let newSchedulerSetMock;
let newSlotsSetMock;
let newVotesSetMock;
let newBasicPollSetMock;
let newBasicPollVoteSetMock;
let groupGetMock;
let usersPublicDocs;
let slotsDocs;
let votesDocs;
let basicPollDocs;

describe('legacy cloneSchedulerPoll', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    schedulerGetMock = vi.fn();
    newSchedulerSetMock = vi.fn();
    newSlotsSetMock = vi.fn();
    newVotesSetMock = vi.fn();
    newBasicPollSetMock = vi.fn();
    newBasicPollVoteSetMock = vi.fn();
    groupGetMock = vi.fn();
    usersPublicDocs = [];
    slotsDocs = [];
    votesDocs = [];
    basicPollDocs = [];

    const originalRef = {
      get: schedulerGetMock,
      collection: (name) => {
        if (name === 'slots') {
          return { get: async () => ({ docs: slotsDocs }) };
        }
        if (name === 'votes') {
          return { get: async () => ({ docs: votesDocs }) };
        }
        if (name === 'basicPolls') {
          return { get: async () => ({ docs: basicPollDocs }) };
        }
        return { get: async () => ({ docs: [] }) };
      },
    };

    const newRef = {
      set: newSchedulerSetMock,
      collection: (name) => {
        if (name === 'slots') {
          return { doc: () => ({ set: newSlotsSetMock }) };
        }
        if (name === 'votes') {
          return { doc: () => ({ set: newVotesSetMock }) };
        }
        if (name === 'basicPolls') {
          return {
            doc: () => ({
              set: newBasicPollSetMock,
              collection: (subName) => {
                if (subName === 'votes') {
                  return { doc: () => ({ set: newBasicPollVoteSetMock }) };
                }
                return { doc: () => ({ set: vi.fn() }) };
              },
            }),
          };
        }
        return { doc: () => ({ set: vi.fn() }) };
      },
    };

    const firestoreMock = {
      collection: (name) => {
        if (name === 'schedulers') {
          return {
            doc: (id) => (id === 'new-sched' ? newRef : originalRef),
          };
        }
        if (name === 'questingGroups') {
          return { doc: () => ({ get: groupGetMock }) };
        }
        if (name === 'usersPublic') {
          return {
            where: () => ({
              get: async () => ({ docs: usersPublicDocs }),
            }),
          };
        }
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => firestoreMock,
    };
    adminMock.firestore.FieldValue = { serverTimestamp: vi.fn(() => 'server-time') };
    adminMock.firestore.Timestamp = { fromDate: vi.fn(() => 'expires-at') };

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
        FieldValue: adminMock.firestore.FieldValue,
        Timestamp: { fromDate: vi.fn(() => 'expires-at') },
      },
    };
    require.cache[require.resolve('firebase-functions/v1')] = { exports: functionsMock };
    require.cache[require.resolve('firebase-functions/params')] = {
      exports: { defineJsonSecret: () => ({ value: () => ({}) }) },
    };
    require.cache[require.resolve('googleapis')] = { exports: { google: { auth: { OAuth2: vi.fn() } } } };

    legacy = await import('./legacy');
  });

  test('clones scheduler and copies slots/votes', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('new-sched');

    schedulerGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        creatorId: 'creator1',
        title: 'Session',
        description: 'desc',
        timezone: 'UTC',
        timezoneMode: 'fixed',
      }),
    });
    groupGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ name: 'Group', memberIds: ['memberId'] }),
    });
    usersPublicDocs = [
      { id: 'memberId', data: () => ({ email: 'member@example.com' }) },
    ];
    slotsDocs = [
      {
        id: 'slot1',
        data: () => ({ start: new Date(now + 100000).toISOString(), end: new Date(now + 200000).toISOString() }),
      },
    ];
    votesDocs = [
      {
        id: 'memberId',
        data: () => ({
          userEmail: 'member@example.com',
          userAvatar: 'avatar',
          votes: { slot1: 'PREFERRED' },
        }),
      },
    ];
    basicPollDocs = [
      {
        id: 'bp1',
        data: () => ({
          title: 'Snack poll',
          required: true,
          order: 0,
          settings: { voteType: 'MULTIPLE_CHOICE' },
          finalResults: { winnerIds: ['opt-a'] },
        }),
        ref: {
          collection: (name) => {
            if (name === 'votes') {
              return {
                get: async () => ({
                  docs: [
                    {
                      id: 'memberId',
                      data: () => ({ optionIds: ['opt-a'], source: 'web' }),
                    },
                  ],
                }),
              };
            }
            return { get: async () => ({ docs: [] }) };
          },
        },
      },
    ];

    const result = await legacy.cloneSchedulerPoll.run(
      {
        schedulerId: 'orig',
        inviteEmails: ['member@example.com'],
        clearVotes: false,
        questingGroupId: 'group1',
      },
      { auth: { uid: 'creator1', token: { email: 'creator@example.com' } } }
    );

    expect(result).toEqual({ schedulerId: 'new-sched' });
    expect(newSchedulerSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingInvites: ['member@example.com'],
      })
    );
    expect(newSlotsSetMock).toHaveBeenCalled();
    expect(newVotesSetMock).toHaveBeenCalled();
    expect(newBasicPollSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Snack poll',
        required: true,
        updatedAt: 'server-time',
      })
    );
    expect(newBasicPollSetMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        finalResults: expect.anything(),
      })
    );
    expect(newBasicPollVoteSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        optionIds: ['opt-a'],
        source: 'web',
        updatedAt: 'server-time',
      }),
      { merge: true }
    );

    Date.now.mockRestore();
    crypto.randomUUID.mockRestore();
  });
});
