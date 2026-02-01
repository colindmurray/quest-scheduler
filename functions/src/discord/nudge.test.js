import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const functionsMock = {
  https: {
    HttpsError,
    functions: { https: { HttpsError } },
  },
  region: vi.fn(() => ({
    runWith: vi.fn(() => ({
      https: {
        onCall: (handler) => {
          const fn = (data, context) => handler(data, context);
          fn.run = handler;
          return fn;
        },
      },
    })),
  })),
};

// Use require cache stubs to ensure commonjs modules resolve to mocks.

let schedulerExists = false;
let schedulerData = null;
let groupExists = false;
let groupData = null;
let votesDocs = [];
let usersDocs = [];
let slotsDocs = [];

const schedulerGetMock = vi.fn();
const schedulerUpdateMock = vi.fn();
const groupGetMock = vi.fn();
const votesGetMock = vi.fn();
const usersGetMock = vi.fn();
const slotsGetMock = vi.fn();

const schedulerRef = {
  get: schedulerGetMock,
  update: schedulerUpdateMock,
  collection: vi.fn((name) => {
    if (name === 'votes') {
      return { get: votesGetMock };
    }
    if (name === 'slots') {
      return {
        orderBy: () => ({
          limit: () => ({ get: slotsGetMock }),
        }),
      };
    }
    return { get: vi.fn() };
  }),
};

const usersQuery = {
  where: vi.fn(function () {
    return this;
  }),
  get: usersGetMock,
};

const collectionMock = vi.fn((name) => {
  if (name === 'schedulers') return { doc: () => schedulerRef };
  if (name === 'questingGroups') return { doc: () => ({ get: groupGetMock }) };
  if (name === 'users') return { where: () => usersQuery };
  return { doc: () => ({ get: vi.fn() }) };
});

const firestoreDb = {
  collection: collectionMock,
};

const firestoreNamespace = Object.assign(() => firestoreDb, {
  FieldValue: { serverTimestamp: vi.fn(() => 'server-time') },
  FieldPath: { documentId: vi.fn(() => 'documentId') },
});

const adminMock = {
  apps: [],
  initializeApp: vi.fn(),
  firestore: firestoreNamespace,
};

let nudge;
let createChannelMessageMock;

describe('discord nudge', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    schedulerExists = false;
    schedulerData = null;
    groupExists = false;
    groupData = null;
    votesDocs = [];
    usersDocs = [];
    slotsDocs = [];

    schedulerGetMock.mockImplementation(async () =>
      schedulerExists ? { exists: true, data: () => schedulerData } : { exists: false }
    );
    groupGetMock.mockImplementation(async () =>
      groupExists ? { exists: true, data: () => groupData } : { exists: false }
    );
    votesGetMock.mockImplementation(async () => ({
      docs: votesDocs,
      size: votesDocs.length,
    }));
    usersGetMock.mockImplementation(async () => ({
      forEach: (cb) => usersDocs.forEach(cb),
    }));
    slotsGetMock.mockImplementation(async () => ({
      empty: slotsDocs.length === 0,
      docs: slotsDocs,
    }));

    createChannelMessageMock = vi.fn();

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-functions/v1')] = {
      exports: functionsMock,
    };
    require.cache[require.resolve('./config')] = {
      exports: {
        DISCORD_REGION: 'us-central1',
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        APP_URL: 'https://app.example.com',
        DISCORD_NOTIFICATION_DEFAULTS: {
          finalizationEvents: true,
          slotChanges: true,
          voteSubmitted: false,
        },
      },
    };
    require.cache[require.resolve('./discord-client')] = {
      exports: {
        createChannelMessage: (...args) => createChannelMessageMock(...args),
      },
    };
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };

    nudge = await import('./nudge');
  });

  test('requires auth', async () => {
    await expect(
      nudge.nudgeDiscordParticipants.run({ schedulerId: 'sched1' }, { auth: null })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  test('requires scheduler id', async () => {
    await expect(
      nudge.nudgeDiscordParticipants.run({ schedulerId: '' }, { auth: { uid: 'user1' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('returns not-found when poll is missing', async () => {
    await expect(
      nudge.nudgeDiscordParticipants.run(
        { schedulerId: 'sched1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  test('rejects when user is not creator', async () => {
    schedulerExists = true;
    schedulerData = { creatorId: 'other' };
    await expect(
      nudge.nudgeDiscordParticipants.run(
        { schedulerId: 'sched1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('rejects when discord channel missing', async () => {
    schedulerExists = true;
    schedulerData = { creatorId: 'user1', status: 'OPEN', discord: {} };
    await expect(
      nudge.nudgeDiscordParticipants.run(
        { schedulerId: 'sched1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('rejects during cooldown window', async () => {
    schedulerExists = true;
    schedulerData = {
      creatorId: 'user1',
      status: 'OPEN',
      discord: {
        channelId: 'chan1',
        nudgeLastSentAt: { toDate: () => new Date(Date.now() - 1000) },
      },
    };
    await expect(
      nudge.nudgeDiscordParticipants.run(
        { schedulerId: 'sched1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  test('rejects when poll is not open', async () => {
    schedulerExists = true;
    schedulerData = {
      creatorId: 'user1',
      status: 'FINALIZED',
      discord: { channelId: 'chan1' },
    };
    await expect(
      nudge.nudgeDiscordParticipants.run(
        { schedulerId: 'sched1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('rejects when no participants to nudge', async () => {
    schedulerExists = true;
    schedulerData = {
      creatorId: 'user1',
      status: 'OPEN',
      participantIds: ['user1'],
      discord: { channelId: 'chan1' },
    };
    await expect(
      nudge.nudgeDiscordParticipants.run(
        { schedulerId: 'sched1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('rejects when everyone has voted', async () => {
    schedulerExists = true;
    schedulerData = {
      creatorId: 'user1',
      status: 'OPEN',
      participantIds: ['user2', 'user3'],
      discord: { channelId: 'chan1' },
    };
    votesDocs = [{ id: 'user2' }, { id: 'user3' }];
    await expect(
      nudge.nudgeDiscordParticipants.run(
        { schedulerId: 'sched1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('rejects when no non-voters have linked Discord', async () => {
    schedulerExists = true;
    schedulerData = {
      creatorId: 'user1',
      status: 'OPEN',
      participantIds: ['user2'],
      discord: { channelId: 'chan1' },
    };
    votesDocs = [];
    usersDocs = [
      {
        data: () => ({ discord: {} }),
      },
    ];
    await expect(
      nudge.nudgeDiscordParticipants.run(
        { schedulerId: 'sched1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('sends nudge and updates scheduler', async () => {
    schedulerExists = true;
    schedulerData = {
      creatorId: 'user1',
      status: 'OPEN',
      participantIds: ['user2', 'user3'],
      discord: { channelId: 'chan1', messageUrl: 'https://discord/poll' },
      title: 'Quest',
    };
    votesDocs = [{ id: 'user2' }];
    usersDocs = [
      {
        data: () => ({ discord: { userId: 'discord-123' } }),
      },
    ];
    slotsDocs = [{ data: () => ({ start: '2025-01-01T10:00:00Z' }) }];

    const result = await nudge.nudgeDiscordParticipants.run(
      { schedulerId: 'sched1' },
      { auth: { uid: 'user1' } }
    );

    expect(createChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'chan1',
        body: expect.objectContaining({ content: expect.stringContaining('Vote now') }),
      })
    );
    expect(schedulerUpdateMock).toHaveBeenCalledWith({
      'discord.nudgeLastSentAt': 'server-time',
    });
    expect(result).toEqual({ success: true, nudgedCount: 1, totalNonVoters: 1 });
  });
});
