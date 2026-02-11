import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let moduleUnderTest;
let createChannelMessageMock;
let editChannelMessageMock;
let deleteChannelMessageMock;
let enqueueMock;
let pollSetMock;

let state;

describe('basic poll Discord sync triggers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    createChannelMessageMock = vi.fn().mockResolvedValue({ id: 'discord-msg-1' });
    editChannelMessageMock = vi.fn().mockResolvedValue({ ok: true });
    deleteChannelMessageMock = vi.fn().mockResolvedValue({ ok: true });
    enqueueMock = vi.fn().mockResolvedValue(undefined);
    pollSetMock = vi.fn().mockResolvedValue(undefined);

    state = {
      groupExists: true,
      pollExists: true,
      groupData: {
        creatorId: 'owner-1',
        memberIds: ['u1', 'u2'],
        discord: {
          channelId: 'channel-1',
          guildId: 'guild-1',
        },
      },
      pollData: {
        title: 'Food poll',
        status: 'OPEN',
        settings: { voteType: 'MULTIPLE_CHOICE' },
        options: [
          { id: 'pizza', label: 'Pizza', order: 0 },
          { id: 'tacos', label: 'Tacos', order: 1 },
        ],
      },
      votes: [{ optionIds: ['pizza'] }, { optionIds: ['tacos'] }],
    };

    const pollRef = {
      id: 'poll-1',
      get: async () => ({ exists: state.pollExists, data: () => state.pollData }),
      set: (...args) => pollSetMock(...args),
      collection: (name) => {
        if (name === 'votes') {
          return {
            get: async () => ({
              docs: state.votes.map((vote) => ({ data: () => vote })),
            }),
          };
        }
        return { doc: () => ({}) };
      },
    };

    const groupRef = {
      id: 'group-1',
      get: async () => ({ exists: state.groupExists, data: () => state.groupData }),
      collection: (name) => {
        if (name === 'basicPolls') {
          return {
            doc: () => pollRef,
          };
        }
        return { doc: () => ({}) };
      },
    };

    const firestoreDb = {
      collection: (name) => {
        if (name === 'questingGroups') {
          return {
            doc: () => groupRef,
          };
        }
        return { doc: () => ({}) };
      },
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => firestoreDb,
    };
    adminMock.firestore.FieldValue = {
      serverTimestamp: vi.fn(() => 'server-time'),
      delete: vi.fn(() => 'delete-value'),
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-functions/v2/firestore')] = {
      exports: {
        onDocumentWritten: (opts, handler) => handler,
      },
    };
    require.cache[require.resolve('firebase-functions/v2/tasks')] = {
      exports: {
        onTaskDispatched: (opts, handler) => handler,
      },
    };
    require.cache[require.resolve('firebase-functions')] = {
      exports: {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
    };
    require.cache[require.resolve('firebase-admin/functions')] = {
      exports: {
        getFunctions: () => ({
          taskQueue: () => ({
            enqueue: (...args) => enqueueMock(...args),
          }),
        }),
      },
    };
    require.cache[require.resolve('../discord/config')] = {
      exports: {
        DISCORD_REGION: 'us-central1',
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        DISCORD_BASIC_POLL_TASK_QUEUE: 'processDiscordBasicPollUpdate',
      },
    };
    require.cache[require.resolve('../discord/discord-client')] = {
      exports: {
        createChannelMessage: (...args) => createChannelMessageMock(...args),
        editChannelMessage: (...args) => editChannelMessageMock(...args),
        deleteChannelMessage: (...args) => deleteChannelMessageMock(...args),
      },
    };
    require.cache[require.resolve('../discord/basic-poll-card')] = {
      exports: {
        buildBasicPollCard: vi.fn(() => ({ embeds: [{ title: 'card' }], components: [] })),
      },
    };

    moduleUnderTest = await import('./basic-poll-card');
  });

  test('computeBasicPollSyncHash changes when votes change', () => {
    const { computeBasicPollSyncHash } = moduleUnderTest.__test__;
    const hashA = computeBasicPollSyncHash({ title: 'A', status: 'OPEN', options: [] }, 1, 3);
    const hashB = computeBasicPollSyncHash({ title: 'A', status: 'OPEN', options: [] }, 2, 3);
    expect(hashA).not.toBe(hashB);
  });

  test('computeBasicPollSyncHash changes for title/status/options but stays stable for unrelated fields', () => {
    const { computeBasicPollSyncHash } = moduleUnderTest.__test__;
    const basePoll = {
      title: 'Food poll',
      status: 'OPEN',
      options: [{ id: 'pizza', label: 'Pizza', order: 0 }],
      settings: { voteType: 'MULTIPLE_CHOICE' },
    };
    const baseHash = computeBasicPollSyncHash(basePoll, 1, 3);
    const titleHash = computeBasicPollSyncHash({ ...basePoll, title: 'Snack poll' }, 1, 3);
    const statusHash = computeBasicPollSyncHash({ ...basePoll, status: 'FINALIZED' }, 1, 3);
    const optionsHash = computeBasicPollSyncHash(
      {
        ...basePoll,
        options: [
          ...basePoll.options,
          { id: 'tacos', label: 'Tacos', order: 1 },
        ],
      },
      1,
      3
    );
    const unrelatedHash = computeBasicPollSyncHash(
      {
        ...basePoll,
        updatedAt: 'later',
        discord: { messageId: 'msg-1' },
      },
      1,
      3
    );

    expect(baseHash).not.toBe(titleHash);
    expect(baseHash).not.toBe(statusHash);
    expect(baseHash).not.toBe(optionsHash);
    expect(baseHash).toBe(unrelatedHash);
  });

  test('enqueueDiscordBasicPollSync includes deletedDiscord metadata on delete', async () => {
    await moduleUnderTest.enqueueDiscordBasicPollSync({
      params: { groupId: 'group-1', pollId: 'poll-1' },
      data: {
        before: {
          exists: () => true,
          data: () => ({ discord: { channelId: 'channel-1', messageId: 'message-1' } }),
        },
        after: {
          exists: () => false,
        },
      },
    });

    expect(enqueueMock).toHaveBeenCalledWith(
      {
        groupId: 'group-1',
        pollId: 'poll-1',
        deletedDiscord: { channelId: 'channel-1', messageId: 'message-1' },
      },
      { scheduleDelaySeconds: 1 }
    );
  });

  test('processDiscordBasicPollUpdate posts new card and stores discord metadata', async () => {
    await moduleUnderTest.processDiscordBasicPollUpdate({
      data: {
        groupId: 'group-1',
        pollId: 'poll-1',
      },
    });

    expect(createChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'channel-1' })
    );
    expect(pollSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        discord: expect.objectContaining({
          messageId: 'discord-msg-1',
          channelId: 'channel-1',
          guildId: 'guild-1',
        }),
      }),
      { merge: true }
    );
  });

  test('processDiscordBasicPollUpdate edits existing card when message already linked', async () => {
    state.pollData = {
      ...state.pollData,
      discord: {
        messageId: 'existing-msg',
        channelId: 'channel-1',
        guildId: 'guild-1',
        lastSyncedHash: 'old-hash',
      },
    };

    await moduleUnderTest.processDiscordBasicPollUpdate({
      data: {
        groupId: 'group-1',
        pollId: 'poll-1',
      },
    });

    expect(editChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        messageId: 'existing-msg',
      })
    );
  });

  test('processDiscordBasicPollUpdate no-ops when sync hash is unchanged', async () => {
    const { computeBasicPollSyncHash } = moduleUnderTest.__test__;
    const unchangedHash = computeBasicPollSyncHash(state.pollData, state.votes.length, 3);
    state.pollData = {
      ...state.pollData,
      discord: {
        messageId: 'existing-msg',
        channelId: 'channel-1',
        guildId: 'guild-1',
        lastSyncedHash: unchangedHash,
      },
      updatedAt: 'later',
    };

    await moduleUnderTest.processDiscordBasicPollUpdate({
      data: {
        groupId: 'group-1',
        pollId: 'poll-1',
      },
    });

    expect(editChannelMessageMock).not.toHaveBeenCalled();
    expect(createChannelMessageMock).not.toHaveBeenCalled();
    expect(pollSetMock).not.toHaveBeenCalled();
  });

  test('processDiscordBasicPollUpdate deletes Discord message when poll was removed', async () => {
    state.pollExists = false;

    await moduleUnderTest.processDiscordBasicPollUpdate({
      data: {
        groupId: 'group-1',
        pollId: 'poll-1',
        deletedDiscord: {
          channelId: 'channel-1',
          messageId: 'msg-gone',
        },
      },
    });

    expect(deleteChannelMessageMock).toHaveBeenCalledWith({
      channelId: 'channel-1',
      messageId: 'msg-gone',
    });
  });
});
