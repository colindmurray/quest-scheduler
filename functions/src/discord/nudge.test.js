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

let schedulerDocsById;
let schedulerVotesById;
let schedulerSlotsById;
let schedulerBasicPollsBySchedulerId;
let groupDocsById;
let groupBasicPollsByGroupId;
let usersById;
let schedulerUpdates;
let groupBasicPollUpdates;

const usersWhereMock = vi.fn();

function toQuerySnapshot(docs = []) {
  return {
    docs,
    empty: docs.length === 0,
    forEach: (cb) => docs.forEach(cb),
  };
}

function toDocSnapshot(id, data) {
  if (!data) {
    return {
      id,
      exists: false,
      data: () => undefined,
    };
  }

  return {
    id,
    exists: true,
    data: () => data,
  };
}

function toVoteDoc(id, data) {
  return {
    id,
    data: () => data || {},
  };
}

function buildSchedulerRef(schedulerId) {
  return {
    get: vi.fn(async () => toDocSnapshot(schedulerId, schedulerDocsById[schedulerId] || null)),
    update: vi.fn(async (payload) => {
      schedulerUpdates.push({ schedulerId, payload });
    }),
    collection: vi.fn((name) => {
      if (name === 'votes') {
        const voteDocs = (schedulerVotesById[schedulerId] || []).map((vote) =>
          toVoteDoc(vote.id, vote.data)
        );
        return {
          get: vi.fn(async () => toQuerySnapshot(voteDocs)),
        };
      }

      if (name === 'slots') {
        const slotDocs = (schedulerSlotsById[schedulerId] || []).map((slot, index) => ({
          id: slot.id || `slot-${index + 1}`,
          data: () => slot.data || {},
        }));
        return {
          orderBy: vi.fn(() => ({
            limit: vi.fn((count) => ({
              get: vi.fn(async () => toQuerySnapshot(slotDocs.slice(0, count))),
            })),
          })),
        };
      }

      if (name === 'basicPolls') {
        const pollDocs = (schedulerBasicPollsBySchedulerId[schedulerId] || []).map((poll) => ({
          id: poll.id,
          data: () => poll.data || {},
          ref: {
            collection: vi.fn((sub) => {
              if (sub !== 'votes') return { get: vi.fn(async () => toQuerySnapshot([])) };
              const voteDocs = (poll.votes || []).map((vote) => toVoteDoc(vote.id, vote.data));
              return {
                get: vi.fn(async () => toQuerySnapshot(voteDocs)),
              };
            }),
          },
        }));

        return {
          get: vi.fn(async () => toQuerySnapshot(pollDocs)),
        };
      }

      return {
        get: vi.fn(async () => toQuerySnapshot([])),
      };
    }),
  };
}

function buildGroupPollRef(groupId, pollId) {
  return {
    get: vi.fn(async () => {
      const pollData = groupBasicPollsByGroupId[groupId]?.[pollId]?.data || null;
      return toDocSnapshot(pollId, pollData);
    }),
    update: vi.fn(async (payload) => {
      groupBasicPollUpdates.push({ groupId, pollId, payload });
    }),
    collection: vi.fn((name) => {
      if (name !== 'votes') return { get: vi.fn(async () => toQuerySnapshot([])) };
      const votes = groupBasicPollsByGroupId[groupId]?.[pollId]?.votes || [];
      return {
        get: vi.fn(async () => toQuerySnapshot(votes.map((vote) => toVoteDoc(vote.id, vote.data)))),
      };
    }),
  };
}

function buildGroupRef(groupId) {
  return {
    get: vi.fn(async () => toDocSnapshot(groupId, groupDocsById[groupId] || null)),
    collection: vi.fn((name) => {
      if (name !== 'basicPolls') {
        return { doc: vi.fn(() => ({ get: vi.fn(async () => toDocSnapshot('', null)) })) };
      }

      return {
        doc: vi.fn((pollId) => buildGroupPollRef(groupId, pollId)),
      };
    }),
  };
}

const collectionMock = vi.fn((name) => {
  if (name === 'schedulers') {
    return {
      doc: vi.fn((schedulerId) => buildSchedulerRef(schedulerId)),
    };
  }

  if (name === 'questingGroups') {
    return {
      doc: vi.fn((groupId) => buildGroupRef(groupId)),
    };
  }

  if (name === 'users') {
    return {
      where: usersWhereMock,
    };
  }

  return {
    doc: vi.fn(() => ({ get: vi.fn(async () => toDocSnapshot('', null)) })),
  };
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

    schedulerDocsById = {};
    schedulerVotesById = {};
    schedulerSlotsById = {};
    schedulerBasicPollsBySchedulerId = {};
    groupDocsById = {};
    groupBasicPollsByGroupId = {};
    usersById = {};
    schedulerUpdates = [];
    groupBasicPollUpdates = [];

    usersWhereMock.mockImplementation((field, operator, value) => {
      if (field !== 'documentId' || operator !== 'in') {
        return {
          get: vi.fn(async () => toQuerySnapshot([])),
        };
      }

      const docs = (value || [])
        .map((userId) => {
          const userData = usersById[userId];
          if (!userData) return null;
          return {
            id: userId,
            data: () => userData,
          };
        })
        .filter(Boolean);

      return {
        get: vi.fn(async () => toQuerySnapshot(docs)),
      };
    });

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

  test('requires auth for scheduler nudge', async () => {
    await expect(
      nudge.nudgeDiscordParticipants.run({ schedulerId: 'sched1' }, { auth: null })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  test('requires scheduler id', async () => {
    await expect(
      nudge.nudgeDiscordParticipants.run({ schedulerId: '' }, { auth: { uid: 'user1' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('rejects scheduler nudge when everyone has voted and required polls are complete', async () => {
    schedulerDocsById.sched1 = {
      creatorId: 'user1',
      status: 'OPEN',
      participantIds: ['user2'],
      discord: { channelId: 'chan1' },
    };
    schedulerVotesById.sched1 = [{ id: 'user2', data: { votes: { slot1: 'yes' } } }];

    await expect(
      nudge.nudgeDiscordParticipants.run(
        { schedulerId: 'sched1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('scheduler nudge appends required poll callout when missing users match session non-voters', async () => {
    schedulerDocsById.sched1 = {
      creatorId: 'user1',
      title: 'Session Alpha',
      status: 'OPEN',
      participantIds: ['user2', 'user3', 'user4'],
      discord: { channelId: 'chan1', messageUrl: 'https://discord/scheduler/1' },
    };
    schedulerVotesById.sched1 = [{ id: 'user2', data: { votes: { slot1: 'yes' } } }];
    schedulerBasicPollsBySchedulerId.sched1 = [
      {
        id: 'bp1',
        data: {
          order: 1,
          title: 'Travel mode',
          required: true,
          status: 'OPEN',
          settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
        },
        votes: [{ id: 'user2', data: { optionIds: ['a'] } }],
      },
      {
        id: 'bp2',
        data: {
          order: 2,
          title: 'Party comp',
          required: true,
          status: 'OPEN',
          settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
        },
        votes: [{ id: 'user2', data: { optionIds: ['b'] } }],
      },
    ];

    usersById.user3 = { discord: { userId: 'discord-3' } };
    usersById.user4 = { discord: { userId: 'discord-4' } };

    const result = await nudge.nudgeDiscordParticipants.run(
      { schedulerId: 'sched1' },
      { auth: { uid: 'user1' } }
    );

    const sent = createChannelMessageMock.mock.calls[0][0];
    expect(sent.channelId).toBe('chan1');
    expect(sent.body.content).toContain('your votes are still needed for this session poll');
    expect(sent.body.content).toContain('also required in these associated polls');
    expect(sent.body.content).toContain('"Travel mode"');
    expect(sent.body.content).toContain('"Party comp"');
    expect(sent.body.content).toContain('<@discord-3> <@discord-4>');

    expect(schedulerUpdates).toEqual([
      {
        schedulerId: 'sched1',
        payload: { 'discord.nudgeLastSentAt': 'server-time' },
      },
    ]);
    expect(result).toEqual({ success: true, nudgedCount: 2, totalNonVoters: 2 });
  });

  test('scheduler nudge adds separate section when required polls have different missing users', async () => {
    schedulerDocsById.sched1 = {
      creatorId: 'user1',
      title: 'Session Beta',
      status: 'OPEN',
      participantIds: ['user2', 'user3', 'user4'],
      discord: { channelId: 'chan1' },
    };
    schedulerVotesById.sched1 = [];
    schedulerBasicPollsBySchedulerId.sched1 = [
      {
        id: 'bp1',
        data: {
          order: 1,
          title: 'Snacks',
          required: true,
          status: 'OPEN',
          settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
        },
        votes: [{ id: 'user4', data: { optionIds: ['chips'] } }],
      },
      {
        id: 'bp2',
        data: {
          order: 2,
          title: 'Travel mode',
          required: true,
          status: 'OPEN',
          settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
        },
        votes: [
          { id: 'user2', data: { optionIds: ['car'] } },
          { id: 'user4', data: { optionIds: ['car'] } },
        ],
      },
    ];

    usersById.user2 = { discord: { userId: 'discord-2' } };
    usersById.user3 = { discord: { userId: 'discord-3' } };
    usersById.user4 = { discord: { userId: 'discord-4' } };

    await nudge.nudgeDiscordParticipants.run(
      { schedulerId: 'sched1' },
      { auth: { uid: 'user1' } }
    );

    const content = createChannelMessageMock.mock.calls[0][0].body.content;
    expect(content).toContain('<@discord-2> <@discord-3> <@discord-4> your votes are still needed for this session poll.');
    expect(content).toContain('<@discord-2> <@discord-3> your votes are still required in this required associated poll: "Snacks".');
    expect(content).toContain('<@discord-3> your votes are still required in this required associated poll: "Travel mode".');
  });

  test('scheduler nudge groups required polls by identical missing-user set into one section', async () => {
    schedulerDocsById.sched1 = {
      creatorId: 'user1',
      title: 'Session Delta',
      status: 'OPEN',
      participantIds: ['user2', 'user3', 'user4'],
      discord: { channelId: 'chan1' },
    };
    schedulerVotesById.sched1 = [{ id: 'user2', data: { votes: { slot1: 'yes' } } }];
    schedulerBasicPollsBySchedulerId.sched1 = [
      {
        id: 'bp1',
        data: {
          order: 1,
          title: 'Food plan',
          required: true,
          status: 'OPEN',
          settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
        },
        votes: [{ id: 'user2', data: { optionIds: ['a'] } }],
      },
      {
        id: 'bp2',
        data: {
          order: 2,
          title: 'Travel mode',
          required: true,
          status: 'OPEN',
          settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
        },
        votes: [{ id: 'user2', data: { optionIds: ['b'] } }],
      },
    ];

    usersById.user3 = { discord: { userId: 'discord-3' } };
    usersById.user4 = { discord: { userId: 'discord-4' } };

    await nudge.nudgeDiscordParticipants.run(
      { schedulerId: 'sched1' },
      { auth: { uid: 'user1' } }
    );

    const content = createChannelMessageMock.mock.calls[0][0].body.content;
    const sections = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('associated polls'));

    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain('<@discord-3> <@discord-4>');
    expect(sections[0]).toContain('"Food plan"');
    expect(sections[0]).toContain('"Travel mode"');
  });

  test('scheduler nudge can target only required polls when session poll already has full votes', async () => {
    schedulerDocsById.sched1 = {
      creatorId: 'user1',
      title: 'Session Gamma',
      status: 'OPEN',
      participantIds: ['user2', 'user3'],
      discord: { channelId: 'chan1' },
    };
    schedulerVotesById.sched1 = [
      { id: 'user2', data: { votes: { slot1: 'yes' } } },
      { id: 'user3', data: { votes: { slot1: 'no' } } },
    ];
    schedulerBasicPollsBySchedulerId.sched1 = [
      {
        id: 'bp1',
        data: {
          title: 'Carpool',
          required: true,
          status: 'OPEN',
          settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
        },
        votes: [{ id: 'user2', data: { optionIds: ['yes'] } }],
      },
    ];

    usersById.user3 = { discord: { userId: 'discord-3' } };

    const result = await nudge.nudgeDiscordParticipants.run(
      { schedulerId: 'sched1' },
      { auth: { uid: 'user1' } }
    );

    const content = createChannelMessageMock.mock.calls[0][0].body.content;
    expect(content).toContain('your votes are still required in this required associated poll');
    expect(content).not.toContain('your votes are still needed for this session poll.');
    expect(result).toEqual({ success: true, nudgedCount: 1, totalNonVoters: 1 });
  });

  test('requires auth for basic poll nudge', async () => {
    await expect(
      nudge.nudgeDiscordBasicPollParticipants.run(
        { groupId: 'group1', pollId: 'poll1' },
        { auth: null }
      )
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  test('basic poll nudge requires poll creator', async () => {
    groupDocsById.group1 = {
      creatorId: 'owner',
      memberIds: ['user1', 'user2'],
    };
    groupBasicPollsByGroupId.group1 = {
      poll1: {
        data: {
          creatorId: 'owner',
          status: 'OPEN',
          discord: { channelId: 'chan-basic' },
          settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
        },
        votes: [],
      },
    };

    await expect(
      nudge.nudgeDiscordBasicPollParticipants.run(
        { groupId: 'group1', pollId: 'poll1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('sends nudge for standalone basic poll and updates poll cooldown', async () => {
    groupDocsById.group1 = {
      creatorId: 'owner',
      memberIds: ['user1', 'user2', 'user3'],
    };
    groupBasicPollsByGroupId.group1 = {
      poll1: {
        data: {
          title: 'General poll',
          creatorId: 'user1',
          status: 'OPEN',
          discord: {
            channelId: 'chan-basic',
            messageUrl: 'https://discord/basic/1',
          },
          settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
        },
        votes: [{ id: 'user2', data: { optionIds: ['opt-1'] } }],
      },
    };

    usersById.user3 = { discord: { userId: 'discord-3' } };

    const result = await nudge.nudgeDiscordBasicPollParticipants.run(
      { groupId: 'group1', pollId: 'poll1' },
      { auth: { uid: 'user1' } }
    );

    const sent = createChannelMessageMock.mock.calls[0][0];
    expect(sent.channelId).toBe('chan-basic');
    expect(sent.body.content).toContain('Your votes are still needed for this general poll');
    expect(sent.body.content).toContain('https://app.example.com/groups/group1/polls/poll1');

    expect(groupBasicPollUpdates).toEqual([
      {
        groupId: 'group1',
        pollId: 'poll1',
        payload: { 'discord.nudgeLastSentAt': 'server-time' },
      },
    ]);
    expect(result).toEqual({ success: true, nudgedCount: 1, totalNonVoters: 2 });
  });
});
