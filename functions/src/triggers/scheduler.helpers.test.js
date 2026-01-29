import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let schedulerModule;
let editChannelMessageMock;
let buildPollStatusCardMock;

let groupExists = false;
let groupData = null;

describe('scheduler helper functions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    groupExists = false;
    groupData = null;

    editChannelMessageMock = vi.fn();
    buildPollStatusCardMock = vi.fn(() => ({ embeds: [] }));

    const firestoreDb = {
      collection: vi.fn((name) => {
        if (name === 'questingGroups') {
          return {
            doc: () => ({
              get: async () => ({ exists: groupExists, data: () => groupData }),
            }),
          };
        }
        return { doc: () => ({}) };
      }),
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => firestoreDb,
    };
    adminMock.firestore.FieldValue = {
      serverTimestamp: vi.fn(() => 'server-time'),
      delete: vi.fn(),
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-functions/v2/firestore')] = {
      exports: {
        onDocumentCreated: (opts, handler) => handler,
        onDocumentUpdated: (opts, handler) => handler,
        onDocumentDeleted: (opts, handler) => handler,
        onDocumentWritten: (opts, handler) => handler,
      },
    };
    require.cache[require.resolve('firebase-functions/v2/tasks')] = {
      exports: { onTaskDispatched: (opts, handler) => handler },
    };
    require.cache[require.resolve('firebase-functions')] = {
      exports: { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
    };
    require.cache[require.resolve('../discord/config')] = {
      exports: {
        DISCORD_REGION: 'us-central1',
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        DISCORD_SCHEDULER_TASK_QUEUE: 'processDiscordSchedulerUpdate',
        APP_URL: 'https://app.example.com',
      },
    };
    require.cache[require.resolve('../discord/discord-client')] = {
      exports: {
        createChannelMessage: vi.fn(),
        editChannelMessage: (...args) => editChannelMessageMock(...args),
      },
    };
    require.cache[require.resolve('../discord/poll-card')] = {
      exports: {
        buildPollCard: vi.fn(),
        buildPollStatusCard: (...args) => buildPollStatusCardMock(...args),
      },
    };

    schedulerModule = await import('./scheduler');
  });

  test('buildFinalizationMention handles role variants', () => {
    const { buildFinalizationMention } = schedulerModule.__test__;
    expect(buildFinalizationMention(null)).toEqual({ mention: '', allowedMentions: { parse: [] } });
    expect(buildFinalizationMention('everyone')).toEqual({
      mention: '@everyone ',
      allowedMentions: { parse: ['everyone'] },
    });
    expect(buildFinalizationMention('role1')).toEqual({
      mention: '<@&role1> ',
      allowedMentions: { roles: ['role1'] },
    });
  });

  test('hasNonDiscordChanges ignores discord-only updates', () => {
    const { hasNonDiscordChanges } = schedulerModule.__test__;
    expect(
      hasNonDiscordChanges({ title: 'A', discord: { a: 1 } }, { title: 'A', discord: { a: 2 } })
    ).toBe(false);
    expect(
      hasNonDiscordChanges({ title: 'A', discord: { a: 1 } }, { title: 'B', discord: { a: 1 } })
    ).toBe(true);
  });

  test('computeSchedulerSyncHash changes when slots change', () => {
    const { computeSchedulerSyncHash } = schedulerModule.__test__;
    const base = computeSchedulerSyncHash(
      { title: 'Quest', status: 'OPEN' },
      [{ id: 'a', start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }],
      1,
      2
    );
    const next = computeSchedulerSyncHash(
      { title: 'Quest', status: 'OPEN' },
      [{ id: 'b', start: '2025-01-02T10:00:00Z', end: '2025-01-02T11:00:00Z' }],
      1,
      2
    );
    expect(base).not.toBe(next);
  });

  test('updateDiscordStatusMessage sends status card', async () => {
    const { updateDiscordStatusMessage } = schedulerModule.__test__;
    await updateDiscordStatusMessage({
      discord: { channelId: 'chan1', messageId: 'msg1' },
      title: 'Quest',
      status: 'CLOSED',
      description: 'Closed',
    });
    expect(buildPollStatusCardMock).toHaveBeenCalled();
    expect(editChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'chan1', messageId: 'msg1' })
    );
  });

  test('getVoteStats merges group members', async () => {
    const { getVoteStats } = schedulerModule.__test__;
    groupExists = true;
    groupData = { memberIds: ['user2'] };
    const schedulerRef = {
      collection: () => ({
        get: async () => ({
          size: 1,
          docs: [{ data: () => ({ votes: { slot1: 'FEASIBLE' }, noTimesWork: false }) }],
        }),
      }),
    };
    const stats = await getVoteStats(schedulerRef, { participantIds: ['user1'], questingGroupId: 'group1' });
    expect(stats).toEqual({ voteCount: 1, totalParticipants: 2, attendingCount: 1 });
  });
});
