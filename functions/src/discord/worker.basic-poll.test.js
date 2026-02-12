import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let worker;
let editOriginalInteractionResponseMock;
let editChannelMessageMock;
let createChannelMessageMock;
let queueNotificationEventMock;

const buildInteraction = (custom = {}) => ({
  id: 'interaction-basic-poll',
  token: 'token',
  applicationId: 'app',
  member: { user: { id: 'discord-user-1' } },
  channelId: 'channel-1',
  guildId: 'guild-1',
  ...custom,
});

describe('discord worker basic poll voting', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    editOriginalInteractionResponseMock = vi.fn().mockResolvedValue({ ok: true });
    editChannelMessageMock = vi.fn().mockResolvedValue({ ok: true });
    createChannelMessageMock = vi.fn().mockResolvedValue({ id: 'discord-message-1' });
    queueNotificationEventMock = vi.fn().mockResolvedValue({ eventId: 'evt-1' });

    const state = {
      pollData: {
        id: 'poll-1',
        title: 'Snack vote',
        status: 'OPEN',
        settings: {
          voteType: 'MULTIPLE_CHOICE',
          allowMultiple: true,
          maxSelections: 2,
        },
        options: [
          { id: 'pizza', label: 'Pizza' },
          { id: 'tacos', label: 'Tacos' },
          { id: 'curry', label: 'Curry' },
        ],
      },
      groupData: {
        creatorId: 'owner-1',
        memberIds: ['qs-user-1'],
        discord: {
          channelId: 'channel-1',
          guildId: 'guild-1',
        },
      },
      linkData: { qsUserId: 'qs-user-1' },
      userData: { email: 'user@example.com', photoURL: 'avatar' },
      votes: new Map(),
      sessions: new Map(),
      writes: {
        voteSetCalls: [],
        sessionSetCalls: [],
        pollSetCalls: [],
      },
    };

    let pollRef;
    const groupRef = {
      id: 'group-1',
      parent: { id: 'questingGroups' },
      get: async () => ({ exists: true, data: () => state.groupData }),
      collection: (name) => {
        if (name !== 'basicPolls') return { doc: () => ({ get: async () => ({ exists: false }) }) };
        return {
          doc: (id) => ({
            get: async () => {
              if (id !== 'poll-1') return { exists: false, data: () => null };
              return { exists: true, data: () => state.pollData, ref: pollRef };
            },
          }),
        };
      },
    };
    const pollCollectionRef = { id: 'basicPolls', parent: groupRef };

    pollRef = {
      id: 'poll-1',
      parent: pollCollectionRef,
      set: async (payload, options) => {
        const merge = options?.merge === true;
        if (merge) {
          state.pollData = { ...state.pollData, ...payload };
        } else {
          state.pollData = { ...payload };
        }
        state.writes.pollSetCalls.push({ payload, options });
      },
      collection: (name) => {
        if (name === 'votes') {
          return {
            get: async () => ({
              docs: Array.from(state.votes.entries()).map(([id, data]) => ({
                id,
                data: () => data,
              })),
            }),
            doc: (uid) => ({
              get: async () => {
                if (!state.votes.has(uid)) {
                  return { exists: false, data: () => null };
                }
                return { exists: true, data: () => state.votes.get(uid) };
              },
              set: async (payload, options) => {
                state.votes.set(uid, payload);
                state.writes.voteSetCalls.push({ uid, payload, options });
              },
              delete: async () => {
                state.votes.delete(uid);
              },
            }),
          };
        }
        return { doc: () => ({}) };
      },
    };

    const collectionGroupGet = async () => ({
      empty: false,
      docs: [
        {
          ref: pollRef,
          data: () => state.pollData,
        },
      ],
    });
    const collectionGroupWhereMock = vi.fn((fieldPath) => {
      if (fieldPath === '__name__') {
        throw new Error('invalid documentId query for collection group');
      }
      return {
        limit: () => ({
          get: collectionGroupGet,
        }),
      };
    });

    const db = {
      runTransaction: async (fn) =>
        fn({
          get: async () => ({ exists: false }),
          set: vi.fn(),
        }),
      collection: (name) => {
        if (name === 'discordInteractionIds') {
          return {
            doc: () => ({
              set: vi.fn(),
              delete: vi.fn().mockResolvedValue(undefined),
            }),
          };
        }
        if (name === 'discordUserLinks') {
          return {
            doc: () => ({
              get: async () => ({ exists: true, data: () => state.linkData }),
            }),
          };
        }
        if (name === 'users') {
          return {
            doc: () => ({
              get: async () => ({ exists: true, data: () => state.userData }),
            }),
          };
        }
        if (name === 'discordVoteSessions') {
          return {
            doc: (sessionId) => ({
              get: async () => {
                if (!state.sessions.has(sessionId)) {
                  return { exists: false, data: () => null };
                }
                return { exists: true, data: () => state.sessions.get(sessionId) };
              },
              set: async (payload) => {
                const current = state.sessions.get(sessionId) || {};
                state.sessions.set(sessionId, { ...current, ...payload });
                state.writes.sessionSetCalls.push({ sessionId, payload });
              },
              delete: async () => {
                state.sessions.delete(sessionId);
              },
            }),
          };
        }
        if (name === 'questingGroups') {
          return {
            where: (fieldPath, op, value) => ({
              get: async () => {
                if (
                  fieldPath === 'discord.channelId' &&
                  op === '==' &&
                  value === state.groupData?.discord?.channelId
                ) {
                  return {
                    empty: false,
                    docs: [
                      {
                        id: 'group-1',
                        ref: groupRef,
                        data: () => state.groupData,
                      },
                    ],
                  };
                }
                return { empty: true, docs: [] };
              },
            }),
            doc: () => groupRef,
          };
        }
        return { doc: () => ({}) };
      },
      collectionGroup: (name) => {
        if (name !== 'basicPolls') throw new Error('unexpected collectionGroup');
        return {
          where: collectionGroupWhereMock,
        };
      },
    };
    state.collectionGroupWhereMock = collectionGroupWhereMock;

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => db,
      auth: () => ({ getUser: vi.fn() }),
    };
    adminMock.firestore.FieldPath = { documentId: () => '__name__' };
    adminMock.firestore.FieldValue = { serverTimestamp: vi.fn(() => 'server-time') };
    adminMock.firestore.Timestamp = { fromDate: vi.fn(() => ({ toDate: () => new Date() })) };

    const require = createRequire(import.meta.url);
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
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
    };
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('discord-api-types/v10')] = {
      exports: {
        InteractionType: { ApplicationCommand: 2, MessageComponent: 3 },
      },
    };
    require.cache[require.resolve('./config')] = {
      exports: {
        DISCORD_APPLICATION_ID: { value: () => 'app' },
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        DISCORD_REGION: 'us-central1',
        APP_URL: 'https://app.example.com',
        DISCORD_NOTIFICATION_DEFAULTS: {
          finalizationEvents: true,
          slotChanges: true,
          voteSubmitted: false,
        },
      },
    };
    require.cache[require.resolve('./link-utils')] = {
      exports: { hashLinkCode: vi.fn(() => 'hash') },
    };
    require.cache[require.resolve('../notifications/write-event')] = {
      exports: {
        queueNotificationEvent: (...args) => queueNotificationEventMock(...args),
      },
    };
    require.cache[require.resolve('./error-messages')] = {
      exports: {
        ERROR_MESSAGES: {
          pollNotFound: 'poll missing',
          pollFinalized: 'poll closed',
          channelMismatch: 'channel mismatch',
          guildMismatch: 'guild mismatch',
          missingDiscordUser: 'missing user',
          sessionExpired: 'session expired',
          notGroupMember: 'not group member',
          notGroupManager: 'not group manager',
          pollAlreadyFinalized: 'poll already finalized',
          pollTieBreakWeb: 'poll tie break on web',
          basicPollNotFound: 'basic poll missing',
          basicPollClosed: 'basic poll closed',
          selectAtLeastOne: 'select one',
          staleSlots: 'stale',
          noOptions: 'no options',
        },
        buildUserNotLinkedMessage: vi.fn(() => 'link account'),
      },
    };
    require.cache[require.resolve('./discord-client')] = {
      exports: {
        editOriginalInteractionResponse: (...args) => editOriginalInteractionResponseMock(...args),
        editChannelMessage: (...args) => editChannelMessageMock(...args),
        createChannelMessage: (...args) => createChannelMessageMock(...args),
        deleteChannelMessage: vi.fn(),
        fetchChannel: vi.fn(),
      },
    };

    worker = await import('./worker');
    worker.__testState = state;
  });

  test('opens MC vote session and renders select UI', async () => {
    await worker.__test__.handleBasicPollVoteButton(buildInteraction(), 'poll-1');

    const responseBody = editOriginalInteractionResponseMock.mock.calls.at(-1)[0].body;
    expect(responseBody.content).toContain('Basic poll: **Snack vote**');
    expect(responseBody.components[0].components[0].custom_id).toBe('bp_mc_select:poll-1');
    expect(responseBody.components[1].components[0].custom_id).toBe('bp_submit:poll-1');
  });

  test('opens ranked vote flow with first-choice select UI', async () => {
    const state = worker.__testState;
    state.pollData = {
      id: 'poll-1',
      title: 'Campaign vote',
      status: 'OPEN',
      settings: { voteType: 'RANKED_CHOICE' },
      options: [
        { id: 'strahd', label: 'Strahd' },
        { id: 'tomb', label: 'Tomb' },
      ],
    };

    await worker.__test__.handleBasicPollVoteButton(buildInteraction(), 'poll-1');

    const responseBody = editOriginalInteractionResponseMock.mock.calls.at(-1)[0].body;
    expect(responseBody.content).toContain('Ranked poll: **Campaign vote**');
    expect(responseBody.components[0].components[0].custom_id).toBe('bp_rank_select:poll-1');
    expect(responseBody.components[0].components[0].placeholder).toContain('Pick rank #1');
    expect(
      state.collectionGroupWhereMock.mock.calls.some((call) => call[0] === '__name__')
    ).toBe(false);
  });

  test('stores MC selection and submits vote doc', async () => {
    const state = worker.__testState;
    state.sessions.set('discord-user-1:basicPoll:poll-1', {
      pollId: 'poll-1',
      parentType: 'group',
      parentId: 'group-1',
      qsUserId: 'qs-user-1',
      voteType: 'MULTIPLE_CHOICE',
      selectedOptionIds: [],
    });

    await worker.__test__.handleBasicPollMcSelect(
      buildInteraction({ data: { values: ['pizza', 'tacos'] } }),
      'poll-1'
    );

    const sessionData = state.sessions.get('discord-user-1:basicPoll:poll-1');
    expect(sessionData.selectedOptionIds).toEqual(['pizza', 'tacos']);

    await worker.__test__.handleBasicPollSubmit(buildInteraction(), 'poll-1');

    expect(state.writes.voteSetCalls.at(-1)?.payload).toEqual(
      expect.objectContaining({ optionIds: ['pizza', 'tacos'], source: 'discord' })
    );
    expect(state.sessions.has('discord-user-1:basicPoll:poll-1')).toBe(false);
  });

  test('ranked flow supports select, undo, reset, and submit', async () => {
    const state = worker.__testState;
    state.pollData = {
      id: 'poll-1',
      title: 'Campaign vote',
      status: 'OPEN',
      settings: { voteType: 'RANKED_CHOICE' },
      options: [
        { id: 'strahd', label: 'Strahd' },
        { id: 'tomb', label: 'Tomb' },
        { id: 'wild', label: 'Wild Beyond the Witchlight' },
      ],
    };

    await worker.__test__.handleBasicPollVoteButton(buildInteraction(), 'poll-1');
    await worker.__test__.handleBasicPollRankSelect(
      buildInteraction({ data: { values: ['strahd'] } }),
      'poll-1'
    );

    let sessionData = state.sessions.get('discord-user-1:basicPoll:poll-1');
    expect(sessionData.rankings).toEqual(['strahd']);

    await worker.__test__.handleBasicPollRankUndo(buildInteraction(), 'poll-1');
    sessionData = state.sessions.get('discord-user-1:basicPoll:poll-1');
    expect(sessionData.rankings).toEqual([]);

    await worker.__test__.handleBasicPollRankSelect(
      buildInteraction({ data: { values: ['tomb'] } }),
      'poll-1'
    );
    await worker.__test__.handleBasicPollRankReset(buildInteraction(), 'poll-1');
    sessionData = state.sessions.get('discord-user-1:basicPoll:poll-1');
    expect(sessionData.rankings).toEqual([]);

    await worker.__test__.handleBasicPollRankSelect(
      buildInteraction({ data: { values: ['wild'] } }),
      'poll-1'
    );
    await worker.__test__.handleBasicPollRankSubmit(buildInteraction(), 'poll-1');

    expect(state.writes.voteSetCalls.at(-1)?.payload).toEqual(
      expect.objectContaining({ rankings: ['wild'], source: 'discord' })
    );
    expect(state.sessions.has('discord-user-1:basicPoll:poll-1')).toBe(false);
  });

  test('clear deletes vote and session', async () => {
    const state = worker.__testState;
    state.votes.set('qs-user-1', { optionIds: ['pizza'] });
    state.sessions.set('discord-user-1:basicPoll:poll-1', {
      pollId: 'poll-1',
      voteType: 'MULTIPLE_CHOICE',
      qsUserId: 'qs-user-1',
      selectedOptionIds: ['pizza'],
    });

    await worker.__test__.handleBasicPollClear(buildInteraction(), 'poll-1');

    expect(state.votes.has('qs-user-1')).toBe(false);
    expect(state.sessions.has('discord-user-1:basicPoll:poll-1')).toBe(false);
  });

  test('submit rejects when poll is closed before write', async () => {
    const state = worker.__testState;
    state.pollData.status = 'FINALIZED';
    state.sessions.set('discord-user-1:basicPoll:poll-1', {
      pollId: 'poll-1',
      parentType: 'group',
      parentId: 'group-1',
      qsUserId: 'qs-user-1',
      voteType: 'MULTIPLE_CHOICE',
      selectedOptionIds: ['pizza'],
    });

    await worker.__test__.handleBasicPollSubmit(buildInteraction(), 'poll-1');

    const responseBody = editOriginalInteractionResponseMock.mock.calls.at(-1)[0].body;
    expect(responseBody.content).toContain('basic poll closed');
    expect(state.writes.voteSetCalls).toHaveLength(0);
  });

  test('finalize updates poll, updates card, posts results, and emits events', async () => {
    const state = worker.__testState;
    state.groupData.creatorId = 'qs-user-1';
    state.pollData.discord = {
      channelId: 'channel-1',
      guildId: 'guild-1',
      messageId: 'poll-msg-1',
    };
    state.votes.set('qs-user-1', { optionIds: ['pizza'] });
    state.votes.set('member-2', { optionIds: ['pizza', 'tacos'] });

    await worker.__test__.handleBasicPollFinalize(buildInteraction(), 'poll-1');

    expect(state.pollData.status).toBe('FINALIZED');
    expect(state.pollData.finalizedByUserId).toBe('qs-user-1');
    expect(state.pollData.finalResults?.voteType).toBe('MULTIPLE_CHOICE');

    expect(editChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        messageId: 'poll-msg-1',
      })
    );
    expect(createChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        body: expect.objectContaining({
          content: expect.stringContaining('📊 **Poll Results: "Snack vote"**'),
        }),
      })
    );
    expect(queueNotificationEventMock).toHaveBeenCalledTimes(2);
    expect(queueNotificationEventMock.mock.calls.map((call) => call[0]?.eventType)).toEqual(
      expect.arrayContaining(['BASIC_POLL_FINALIZED', 'BASIC_POLL_RESULTS'])
    );

    const responseBody = editOriginalInteractionResponseMock.mock.calls.at(-1)[0].body;
    expect(responseBody.content).toBe('Poll finalized and results posted.');
  });

  test('finalize rejects ranked ties and keeps poll open', async () => {
    const state = worker.__testState;
    state.groupData.creatorId = 'qs-user-1';
    state.pollData = {
      id: 'poll-1',
      title: 'Campaign vote',
      status: 'OPEN',
      settings: { voteType: 'RANKED_CHOICE' },
      options: [
        { id: 'strahd', label: 'Strahd' },
        { id: 'tomb', label: 'Tomb' },
      ],
    };
    state.votes.set('qs-user-1', { rankings: ['strahd'] });
    state.votes.set('member-2', { rankings: ['tomb'] });

    await worker.__test__.handleBasicPollFinalize(buildInteraction(), 'poll-1');

    expect(state.pollData.status).toBe('OPEN');
    expect(createChannelMessageMock).not.toHaveBeenCalled();
    expect(queueNotificationEventMock).not.toHaveBeenCalled();

    const responseBody = editOriginalInteractionResponseMock.mock.calls.at(-1)[0].body;
    expect(responseBody.content).toBe('poll tie break on web');
  });

  test('finalize requires group manager permission', async () => {
    const state = worker.__testState;
    state.groupData.creatorId = 'owner-1';
    state.groupData.memberIds = ['qs-user-1'];

    await worker.__test__.handleBasicPollFinalize(buildInteraction(), 'poll-1');

    expect(state.pollData.status).toBe('OPEN');
    expect(queueNotificationEventMock).not.toHaveBeenCalled();

    const responseBody = editOriginalInteractionResponseMock.mock.calls.at(-1)[0].body;
    expect(responseBody.content).toBe('not group manager');
  });
});
