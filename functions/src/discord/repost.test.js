import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let repost;
let createChannelMessageMock;
let deleteChannelMessageMock;
let schedulerGetMock;
let schedulerSetMock;
let groupGetMock;
let slotsGetMock;
let votesGetMock;

const buildDocSnap = (data, exists = true) => ({
  exists,
  data: () => data,
});

describe('discord repost poll', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    createChannelMessageMock = vi.fn().mockResolvedValue({ id: 'msg-new' });
    deleteChannelMessageMock = vi.fn().mockResolvedValue({ ok: true });
    schedulerGetMock = vi.fn();
    schedulerSetMock = vi.fn();
    groupGetMock = vi.fn();
    slotsGetMock = vi.fn();
    votesGetMock = vi.fn();

    const schedulerRef = {
      get: schedulerGetMock,
      set: schedulerSetMock,
      collection: (name) => {
        if (name === 'slots') return { get: slotsGetMock };
        if (name === 'votes') return { get: votesGetMock };
        return { get: vi.fn() };
      },
    };

    const groupRef = {
      get: groupGetMock,
    };

    const db = {
      collection: (name) => {
        if (name === 'schedulers') {
          return { doc: () => schedulerRef };
        }
        if (name === 'questingGroups') {
          return { doc: () => groupRef };
        }
        return { doc: () => ({}) };
      },
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => db,
    };
    adminMock.firestore.FieldValue = {
      serverTimestamp: vi.fn(() => 'server-time'),
      delete: vi.fn(() => 'delete'),
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-functions/v2/https')] = {
      exports: {
        onCall: (opts, handler) => {
          const fn = (req) => handler(req);
          fn.run = handler;
          return fn;
        },
        HttpsError: class HttpsError extends Error {
          constructor(code, message) {
            super(message);
            this.code = code;
          }
        },
      },
    };
    require.cache[require.resolve('firebase-functions')] = {
      exports: { logger: { warn: vi.fn() } },
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
        deleteChannelMessage: (...args) => deleteChannelMessageMock(...args),
      },
    };

    repost = await import('./repost');
  });

  test('requires auth', async () => {
    await expect(repost.discordRepostPollCard.run({ auth: null, data: {} })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  test('rejects non-creator', async () => {
    schedulerGetMock.mockResolvedValueOnce(
      buildDocSnap({
        creatorId: 'other',
        questingGroupId: 'group1',
      })
    );

    await expect(
      repost.discordRepostPollCard.run({ auth: { uid: 'user1' }, data: { schedulerId: 'sched1' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('deletes old message and posts new one', async () => {
    schedulerGetMock.mockResolvedValueOnce(
      buildDocSnap({
        creatorId: 'user1',
        questingGroupId: 'group1',
        participantIds: ['user1'],
        status: 'OPEN',
        discord: { messageId: 'old-msg', channelId: 'old-chan' },
      })
    );
    groupGetMock.mockResolvedValueOnce(
      buildDocSnap({
        memberIds: ['user1'],
        discord: { channelId: 'chan1', guildId: 'guild1' },
      })
    );
    slotsGetMock.mockResolvedValueOnce({
      docs: [
        {
          id: 'slot1',
          data: () => ({ start: '2024-01-01T10:00:00Z', end: '2024-01-01T11:00:00Z' }),
        },
      ],
    });
    votesGetMock.mockResolvedValueOnce({ size: 0, docs: [] });

    const result = await repost.discordRepostPollCard.run({
      auth: { uid: 'user1' },
      data: { schedulerId: 'sched1' },
    });

    expect(deleteChannelMessageMock).toHaveBeenCalledWith({
      channelId: 'old-chan',
      messageId: 'old-msg',
    });
    expect(createChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'chan1' })
    );
    expect(schedulerSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        discord: expect.objectContaining({
          messageId: 'msg-new',
          channelId: 'chan1',
          guildId: 'guild1',
        }),
      }),
      { merge: true }
    );
    expect(result).toEqual({
      messageId: 'msg-new',
      messageUrl: 'https://discord.com/channels/guild1/chan1/msg-new',
    });
  });
});
