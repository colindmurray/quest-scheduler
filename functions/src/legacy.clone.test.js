import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

let legacy;
let schedulerGetMock;
let newSchedulerSetMock;
let newSlotsSetMock;
let newVotesSetMock;
let groupGetMock;
let usersPublicDocs;
let slotsDocs;
let votesDocs;

describe('legacy cloneSchedulerPoll', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    schedulerGetMock = vi.fn();
    newSchedulerSetMock = vi.fn();
    newSlotsSetMock = vi.fn();
    newVotesSetMock = vi.fn();
    groupGetMock = vi.fn();
    usersPublicDocs = [];
    slotsDocs = [];
    votesDocs = [];

    const originalRef = {
      get: schedulerGetMock,
      collection: (name) => {
        if (name === 'slots') {
          return { get: async () => ({ docs: slotsDocs }) };
        }
        if (name === 'votes') {
          return { get: async () => ({ docs: votesDocs }) };
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
    expect(newSchedulerSetMock).toHaveBeenCalled();
    expect(newSlotsSetMock).toHaveBeenCalled();
    expect(newVotesSetMock).toHaveBeenCalled();

    Date.now.mockRestore();
    crypto.randomUUID.mockRestore();
  });
});
