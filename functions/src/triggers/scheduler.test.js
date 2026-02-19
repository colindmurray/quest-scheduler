import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let schedulerTriggers;
let createChannelMessageMock;
let editChannelMessageMock;
let buildPollCardMock;
let enqueueMock;

let schedulerData;
let groupData;
let groupExists;
let slotsDocs;
let votesSize;
let votesDocs;

const schedulerSetMock = vi.fn();
const schedulerGetMock = vi.fn();

const schedulerRef = {
  collection: vi.fn(() => ({
    get: vi.fn(async () => ({ docs: slotsDocs })),
  })),
  set: schedulerSetMock,
  get: schedulerGetMock,
};

describe('scheduler triggers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    schedulerData = null;
    groupData = null;
    groupExists = false;
    slotsDocs = [];
    votesSize = 0;
    votesDocs = [];

    schedulerGetMock.mockResolvedValue({ exists: true, data: () => schedulerData });

    createChannelMessageMock = vi.fn();
    editChannelMessageMock = vi.fn();
    buildPollCardMock = vi.fn(() => ({ embeds: [], components: [] }));
    enqueueMock = vi.fn();

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-functions/v2/firestore')] = {
      exports: {
        onDocumentCreated: (opts, handler) => {
          const fn = (event) => handler(event);
          fn.run = handler;
          return fn;
        },
        onDocumentUpdated: (opts, handler) => {
          const fn = (event) => handler(event);
          fn.run = handler;
          return fn;
        },
        onDocumentDeleted: (opts, handler) => {
          const fn = (event) => handler(event);
          fn.run = handler;
          return fn;
        },
        onDocumentWritten: (opts, handler) => {
          const fn = (event) => handler(event);
          fn.run = handler;
          return fn;
        },
      },
    };
    require.cache[require.resolve('firebase-functions/v2/tasks')] = {
      exports: {
        onTaskDispatched: (opts, handler) => {
          const fn = (req) => handler(req);
          fn.run = handler;
          return fn;
        },
      },
    };
    require.cache[require.resolve('firebase-functions')] = {
      exports: {
        logger: {
          error: vi.fn(),
          warn: vi.fn(),
          info: vi.fn(),
        },
      },
    };
    require.cache[require.resolve('../discord/config')] = {
      exports: {
        DISCORD_REGION: 'us-central1',
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        DISCORD_SCHEDULER_TASK_QUEUE: 'processDiscordSchedulerUpdate',
        APP_URL: 'https://app.example.com',
        DISCORD_NOTIFICATION_DEFAULTS: {
          finalizationEvents: true,
          slotChanges: true,
          voteSubmitted: false,
        },
      },
    };
    require.cache[require.resolve('../discord/discord-client')] = {
      exports: {
        createChannelMessage: (...args) => createChannelMessageMock(...args),
        editChannelMessage: (...args) => editChannelMessageMock(...args),
      },
    };
    require.cache[require.resolve('../discord/poll-card')] = {
      exports: {
        buildPollCard: (...args) => buildPollCardMock(...args),
        buildPollStatusCard: vi.fn(() => ({ embeds: [] })),
      },
    };
    require.cache[require.resolve('firebase-admin/functions')] = {
      exports: {
        getFunctions: () => ({
          taskQueue: () => ({ enqueue: enqueueMock }),
        }),
      },
    };

    const firestoreDb = {
      collection: vi.fn((name) => {
        if (name === 'questingGroups') {
          return { doc: () => ({ get: async () => ({ exists: groupExists, data: () => groupData }) }) };
        }
        if (name === 'schedulers') {
          return { doc: () => schedulerRef };
        }
        return { doc: () => ({}) };
      }),
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => firestoreDb,
    };
    adminMock.firestore.FieldValue = { serverTimestamp: vi.fn(() => 'server-time'), delete: vi.fn(() => 'deleted') };
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };

    schedulerTriggers = await import('./scheduler');

    schedulerRef.collection = vi.fn((name) => {
      if (name === 'slots') {
        return { get: vi.fn(async () => ({ docs: slotsDocs })) };
      }
      if (name === 'votes') {
        return {
          get: vi.fn(async () => ({
            size: votesSize,
            docs: votesDocs,
          })),
        };
      }
      return { get: vi.fn(async () => ({ docs: [] })) };
    });
  });

  test('postDiscordPollCard returns when no questing group', async () => {
    await schedulerTriggers.postDiscordPollCard.run({
      params: { schedulerId: 'sched1' },
      data: { data: () => ({}) },
    });
    expect(createChannelMessageMock).not.toHaveBeenCalled();
  });

  test('postDiscordPollCard returns when discord link missing', async () => {
    groupExists = true;
    groupData = { discord: {} };

    await schedulerTriggers.postDiscordPollCard.run({
      params: { schedulerId: 'sched1' },
      data: { data: () => ({ questingGroupId: 'group1' }) },
    });

    expect(createChannelMessageMock).not.toHaveBeenCalled();
  });

  test('postDiscordPollCard posts message and stores discord metadata', async () => {
    groupExists = true;
    groupData = { discord: { channelId: 'chan1', guildId: 'guild1' }, memberIds: [] };
    slotsDocs = [{ id: 'slot1', data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) }];
    createChannelMessageMock.mockResolvedValueOnce({ id: 'msg1' });

    await schedulerTriggers.postDiscordPollCard.run({
      params: { schedulerId: 'sched1' },
      data: { data: () => ({ questingGroupId: 'group1', participantIds: [], status: 'OPEN' }) },
    });

    expect(buildPollCardMock).toHaveBeenCalled();
    expect(createChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'chan1' })
    );
    expect(schedulerSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        discord: expect.objectContaining({ messageId: 'msg1', channelId: 'chan1' }),
      }),
      { merge: true }
    );
  });

  test('postDiscordPollCard flags pending sync on failure', async () => {
    groupExists = true;
    groupData = { discord: { channelId: 'chan1', guildId: 'guild1' }, memberIds: [] };
    createChannelMessageMock.mockRejectedValueOnce(new Error('boom'));

    await schedulerTriggers.postDiscordPollCard.run({
      params: { schedulerId: 'sched1' },
      data: { data: () => ({ questingGroupId: 'group1', participantIds: [], status: 'OPEN' }) },
    });

    expect(schedulerSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        discord: expect.objectContaining({ pendingSync: true }),
      }),
      { merge: true }
    );
  });

  test('updateDiscordPollCard posts to new group channel when group changes', async () => {
    groupExists = true;
    groupData = { discord: { channelId: 'chan2', guildId: 'guild2', notifyRoleId: 'role1' }, memberIds: [] };
    slotsDocs = [{ id: 'slot1', data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) }];
    votesSize = 2;
    createChannelMessageMock.mockResolvedValueOnce({ id: 'msg2' });

    await schedulerTriggers.updateDiscordPollCard.run({
      params: { schedulerId: 'sched1' },
      data: {
        before: { data: () => ({ questingGroupId: 'group1', discord: { messageId: 'msg1', channelId: 'chan1', guildId: 'guild1' }, title: 'Old' }) },
        after: { data: () => ({ questingGroupId: 'group2', status: 'OPEN' }) },
      },
    });

    expect(createChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'chan2' })
    );
    expect(schedulerSetMock).toHaveBeenCalled();
  });

  test('updateDiscordPollCard clears discord data when no next link', async () => {
    groupExists = false;

    await schedulerTriggers.updateDiscordPollCard.run({
      params: { schedulerId: 'sched1' },
      data: {
        before: { data: () => ({ questingGroupId: 'group1', discord: { messageId: 'msg1', channelId: 'chan1', guildId: 'guild1' }, title: 'Old' }) },
        after: { data: () => ({ questingGroupId: 'group2', status: 'OPEN' }) },
      },
    });

    expect(schedulerSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ discord: 'deleted' }),
      { merge: true }
    );
  });

  test('handleDiscordPollDelete posts deletion status and lifecycle ping when enabled', async () => {
    groupExists = true;
    groupData = {
      discord: {
        notifyRoleId: 'role1',
        notifications: { finalizationEvents: true },
      },
      memberIds: [],
    };

    await schedulerTriggers.handleDiscordPollDelete.run({
      params: { schedulerId: 'sched1' },
      data: {
        data: () => ({
          title: 'Quest Session',
          questingGroupId: 'group1',
          discord: { messageId: 'msg1', channelId: 'chan1', guildId: 'guild1' },
        }),
      },
    });

    expect(editChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'chan1', messageId: 'msg1' })
    );
    expect(createChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'chan1',
        body: expect.objectContaining({
          content: expect.stringContaining('Poll deleted for **Quest Session**.'),
          allowed_mentions: { roles: ['role1'] },
        }),
      })
    );
  });

  test('processDiscordSchedulerUpdate edits message without finalization note', async () => {
    schedulerData = {
      status: 'FINALIZED',
      title: 'Quest',
      questingGroupId: 'group2',
      winningSlotId: 'slot1',
      discord: { messageId: 'msg1', channelId: 'chan1', lastStatus: 'OPEN' },
    };
    groupExists = true;
    groupData = { discord: { notifyRoleId: 'everyone' }, memberIds: [] };
    slotsDocs = [{ id: 'slot1', data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) }];
    votesSize = 1;

    await schedulerTriggers.processDiscordSchedulerUpdate.run({ data: { schedulerId: 'sched1' } });

    expect(editChannelMessageMock).toHaveBeenCalled();
    expect(createChannelMessageMock).not.toHaveBeenCalled();
    expect(schedulerSetMock).toHaveBeenCalled();
  });

  test('processDiscordSchedulerUpdate skips finalization note when disabled', async () => {
    schedulerData = {
      status: 'FINALIZED',
      title: 'Quest',
      questingGroupId: 'group2',
      winningSlotId: 'slot1',
      discord: { messageId: 'msg1', channelId: 'chan1', lastStatus: 'OPEN' },
    };
    groupExists = true;
    groupData = {
      discord: { notifyRoleId: 'everyone', notifications: { finalizationEvents: false } },
      memberIds: [],
    };
    slotsDocs = [{ id: 'slot1', data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) }];
    votesSize = 1;

    await schedulerTriggers.processDiscordSchedulerUpdate.run({ data: { schedulerId: 'sched1' } });

    expect(editChannelMessageMock).toHaveBeenCalled();
    expect(createChannelMessageMock).not.toHaveBeenCalled();
    expect(schedulerSetMock).toHaveBeenCalled();
  });

  test('processDiscordSchedulerUpdate hides vote totals for non-public visibility', async () => {
    schedulerData = {
      status: 'OPEN',
      title: 'Quest',
      voteVisibility: 'hidden',
      participantIds: ['user-1', 'user-2'],
      discord: { messageId: 'msg1', channelId: 'chan1', lastStatus: 'OPEN' },
    };
    groupExists = false;
    slotsDocs = [{ id: 'slot1', data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) }];
    votesDocs = [
      { id: 'user-1', data: () => ({ noTimesWork: false, votes: { slot1: 'FEASIBLE' } }) },
      { id: 'user-2', data: () => ({ noTimesWork: true, votes: {} }) },
    ];
    votesSize = votesDocs.length;

    await schedulerTriggers.processDiscordSchedulerUpdate.run({ data: { schedulerId: 'sched1' } });

    expect(buildPollCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voteCount: null,
        totalParticipants: 2,
      })
    );
  });

  test('processDiscordSchedulerUpdate shows totals once hidden-until-all-voted unlocks', async () => {
    schedulerData = {
      status: 'OPEN',
      title: 'Quest',
      voteVisibility: 'hidden_until_all_voted',
      participantIds: ['user-1', 'user-2'],
      discord: { messageId: 'msg1', channelId: 'chan1', lastStatus: 'OPEN' },
    };
    groupExists = false;
    slotsDocs = [{ id: 'slot1', data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) }];
    votesDocs = [
      { id: 'user-1', data: () => ({ noTimesWork: false, votes: { slot1: 'FEASIBLE' } }) },
      { id: 'user-2', data: () => ({ noTimesWork: true, votes: {} }) },
    ];
    votesSize = votesDocs.length;

    await schedulerTriggers.processDiscordSchedulerUpdate.run({ data: { schedulerId: 'sched1' } });

    expect(buildPollCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voteCount: 2,
        totalParticipants: 2,
      })
    );
  });

  test('updateDiscordPollOnVote enqueues poll update when enabled', async () => {
    schedulerData = {
      status: 'OPEN',
      title: 'Quest',
      questingGroupId: 'group1',
      creatorId: 'creator',
      discord: { messageId: 'msg1', channelId: 'chan1' },
    };
    groupExists = true;
    groupData = { discord: { notifications: { voteSubmitted: true } } };

    await schedulerTriggers.updateDiscordPollOnVote.run({
      params: { schedulerId: 'sched1', voteId: 'voter1' },
      data: {
        after: { data: () => ({ userEmail: 'voter@example.com', noTimesWork: false }) },
      },
    });

    expect(enqueueMock).toHaveBeenCalled();
    expect(createChannelMessageMock).not.toHaveBeenCalled();
  });

  test('updateDiscordPollOnVote still enqueues poll update when disabled', async () => {
    schedulerData = {
      status: 'OPEN',
      title: 'Quest',
      questingGroupId: 'group1',
      creatorId: 'creator',
      discord: { messageId: 'msg1', channelId: 'chan1' },
    };
    groupExists = true;
    groupData = { discord: { notifications: { voteSubmitted: false } } };

    await schedulerTriggers.updateDiscordPollOnVote.run({
      params: { schedulerId: 'sched1', voteId: 'voter1' },
      data: {
        after: { data: () => ({ userEmail: 'voter@example.com', noTimesWork: false }) },
      },
    });

    expect(enqueueMock).toHaveBeenCalled();
    expect(createChannelMessageMock).not.toHaveBeenCalled();
  });

  test('notifyDiscordSlotChanges initializes snapshot without messaging', async () => {
    schedulerData = {
      status: 'OPEN',
      title: 'Quest',
      questingGroupId: 'group1',
      discord: { messageId: 'msg1', channelId: 'chan1' },
    };
    groupExists = true;
    groupData = { discord: { notifications: { slotChanges: true } }, memberIds: [] };
    slotsDocs = [{ id: 'slot1', data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) }];

    await schedulerTriggers.notifyDiscordSlotChanges.run({
      params: { schedulerId: 'sched1', slotId: 'slot1' },
      data: {
        before: { data: () => null },
        after: { data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) },
      },
    });

    expect(createChannelMessageMock).not.toHaveBeenCalled();
    expect(schedulerSetMock).toHaveBeenCalled();
  });

  test('notifyDiscordSlotChanges updates snapshot without messaging when enabled', async () => {
    schedulerData = {
      status: 'OPEN',
      title: 'Quest',
      questingGroupId: 'group1',
      discord: {
        messageId: 'msg1',
        channelId: 'chan1',
        slotSetHash: 'oldhash',
        slotSnapshot: [{ id: 'slot1', start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }],
      },
    };
    groupExists = true;
    groupData = { discord: { notifications: { slotChanges: true } }, memberIds: [] };
    slotsDocs = [{ id: 'slot2', data: () => ({ start: '2025-01-02T10:00:00Z', end: '2025-01-02T11:00:00Z' }) }];

    await schedulerTriggers.notifyDiscordSlotChanges.run({
      params: { schedulerId: 'sched1', slotId: 'slot1' },
      data: {
        before: { data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) },
        after: { data: () => null },
      },
    });

    expect(createChannelMessageMock).not.toHaveBeenCalled();
    expect(schedulerSetMock).toHaveBeenCalled();
  });

  test('notifyDiscordSlotChanges respects toggle', async () => {
    schedulerData = {
      status: 'OPEN',
      title: 'Quest',
      questingGroupId: 'group1',
      discord: {
        messageId: 'msg1',
        channelId: 'chan1',
        slotSetHash: 'oldhash',
        slotSnapshot: [{ id: 'slot1', start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }],
      },
    };
    groupExists = true;
    groupData = { discord: { notifications: { slotChanges: false } }, memberIds: [] };
    slotsDocs = [{ id: 'slot2', data: () => ({ start: '2025-01-02T10:00:00Z', end: '2025-01-02T11:00:00Z' }) }];

    await schedulerTriggers.notifyDiscordSlotChanges.run({
      params: { schedulerId: 'sched1', slotId: 'slot1' },
      data: {
        before: { data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) },
        after: { data: () => null },
      },
    });

    expect(createChannelMessageMock).not.toHaveBeenCalled();
  });
});
