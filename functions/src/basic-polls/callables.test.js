import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let callables;
let createdPollSetMock;
let pollUpdateMock;
let pollDeleteMock;
let voteDeleteMock;
let notificationEventSetMock;

let groupData;
let pollData;
let voteDocs;
let schedulerData;
let schedulerPollData;
let schedulerVoteDocs;
let usersPublicById;
let schedulerExists;

function makeVoteDoc(id, data) {
  return {
    id,
    data: () => data,
    ref: {
      delete: voteDeleteMock,
    },
  };
}

function buildFirestoreMock() {
  const createdPollRef = {
    id: 'poll-new',
    set: createdPollSetMock,
  };

  const pollRef = {
    get: vi.fn(async () => ({ exists: true, data: () => pollData })),
    update: pollUpdateMock,
    delete: pollDeleteMock,
    collection: vi.fn((name) => {
      if (name !== 'votes') return { get: vi.fn(async () => ({ empty: true, docs: [] })) };
      return {
        get: vi.fn(async () => ({
          empty: voteDocs.length === 0,
          docs: voteDocs,
        })),
      };
    }),
  };

  const schedulerPollRef = {
    get: vi.fn(async () => ({ exists: true, data: () => schedulerPollData })),
    update: pollUpdateMock,
    delete: pollDeleteMock,
    collection: vi.fn((name) => {
      if (name !== 'votes') return { get: vi.fn(async () => ({ empty: true, docs: [] })) };
      return {
        get: vi.fn(async () => ({
          empty: schedulerVoteDocs.length === 0,
          docs: schedulerVoteDocs,
        })),
      };
    }),
  };

  const parentRef = {
    get: vi.fn(async () => ({ exists: true, data: () => groupData })),
    collection: vi.fn((name) => {
      if (name !== 'basicPolls') return { doc: vi.fn() };
      return {
        doc: vi.fn((id) => (id ? pollRef : createdPollRef)),
      };
    }),
  };

  const schedulerRef = {
    get: vi.fn(async () => ({ exists: schedulerExists, data: () => schedulerData })),
    collection: vi.fn((name) => {
      if (name !== 'basicPolls') return { doc: vi.fn() };
      return {
        get: vi.fn(async () => ({
          empty: false,
          docs: [
            {
              id: 'poll-1',
              data: () => schedulerPollData,
              ref: schedulerPollRef,
            },
          ],
        })),
        doc: vi.fn(() => schedulerPollRef),
      };
    }),
  };

  let eventCounter = 0;

  return {
    collection: vi.fn((name) => {
      if (name === 'questingGroups') {
        return {
          doc: vi.fn(() => parentRef),
        };
      }

      if (name === 'schedulers') {
        return {
          doc: vi.fn(() => schedulerRef),
        };
      }

      if (name === 'notificationEvents') {
        return {
          doc: vi.fn(() => ({
            id: `event-${++eventCounter}`,
            set: notificationEventSetMock,
          })),
        };
      }

      if (name === 'usersPublic') {
        return {
          doc: vi.fn((id) => ({
            get: vi.fn(async () => {
              const data = usersPublicById[id] || null;
              return {
                exists: Boolean(data),
                data: () => data || {},
              };
            }),
          })),
        };
      }

      return {
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: false, data: () => ({}) })),
        })),
      };
    }),
  };
}

function buildContext(uid = 'owner-1', email = 'owner@example.com') {
  return {
    auth: {
      uid,
      token: {
        email,
        name: 'Owner',
      },
    },
  };
}

describe('basic-poll callables', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    createdPollSetMock = vi.fn().mockResolvedValue(undefined);
    pollUpdateMock = vi.fn().mockResolvedValue(undefined);
    pollDeleteMock = vi.fn().mockResolvedValue(undefined);
    voteDeleteMock = vi.fn().mockResolvedValue(undefined);
    notificationEventSetMock = vi.fn().mockResolvedValue(undefined);

    groupData = {
      creatorId: 'owner-1',
      memberIds: ['owner-1', 'member-1', 'member-2'],
      memberPermissionsEnabled: false,
      memberPermissions: {},
    };
    pollData = {
      title: 'Snack vote',
      settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
      options: [
        { id: 'opt-a', label: 'Pizza', order: 0 },
        { id: 'opt-b', label: 'Tacos', order: 1 },
      ],
    };
    voteDocs = [makeVoteDoc('owner-1', { optionIds: ['opt-a'] })];
    schedulerData = {
      creatorId: 'owner-1',
      participantIds: ['owner-1', 'member-1'],
      questingGroupId: 'g1',
    };
    schedulerPollData = {
      title: 'Embedded snack vote',
      required: true,
      settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
      options: [
        { id: 'opt-a', label: 'Pizza', order: 0 },
        { id: 'opt-b', label: 'Tacos', order: 1 },
      ],
    };
    schedulerVoteDocs = [makeVoteDoc('owner-1', { optionIds: ['opt-a'] })];
    schedulerExists = true;
    usersPublicById = {
      'owner-1': { email: 'owner@example.com', displayName: 'Owner' },
      'member-1': { email: 'member-1@example.com', displayName: 'Member One' },
      'member-2': { email: 'member-2@example.com', displayName: 'Member Two' },
    };

    const firestoreMock = buildFirestoreMock();

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => firestoreMock,
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-admin/firestore')] = {
      exports: {
        FieldValue: {
          serverTimestamp: vi.fn(() => 'server-time'),
        },
        Timestamp: { fromDate: vi.fn(() => 'expires-at') },
      },
    };
    require.cache[require.resolve('firebase-functions/v1')] = {
      exports: (() => {
        class HttpsError extends Error {
          constructor(code, message) {
            super(message);
            this.code = code;
          }
        }
        return {
          https: {
            HttpsError,
            onCall: (handler) => {
              const fn = (data, context) => handler(data, context);
              fn.run = handler;
              return fn;
            },
          },
        };
      })(),
    };

    callables = await import('./callables');
  });

  test('createBasicPoll rejects unauthenticated caller', async () => {
    await expect(callables.createBasicPoll.run({}, {})).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  test('createBasicPoll enforces manager permissions', async () => {
    await expect(
      callables.createBasicPoll.run(
        {
          parentType: 'group',
          parentId: 'g1',
          pollData: { title: 'Snack vote' },
        },
        buildContext('member-2', 'member-2@example.com')
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('createBasicPoll writes poll and emits BASIC_POLL_CREATED event', async () => {
    const result = await callables.createBasicPoll.run(
      {
        parentType: 'group',
        parentId: 'g1',
        pollData: {
          title: 'Snack vote',
          options: pollData.options,
          settings: pollData.settings,
          voteVisibility: 'hidden_while_voting',
        },
      },
      buildContext('owner-1')
    );

    expect(result).toEqual({ pollId: 'poll-new' });
    expect(createdPollSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Snack vote',
        status: 'OPEN',
        voteVisibility: 'hidden_while_voting',
        voteAnonymization: 'none',
        hideVoterIdentities: false,
        createdAt: 'server-time',
      })
    );
    expect(notificationEventSetMock).toHaveBeenCalledTimes(1);
    expect(notificationEventSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_CREATED',
        status: 'queued',
      })
    );
    const createdEvent = notificationEventSetMock.mock.calls[0][0];
    expect(createdEvent?.resource).toEqual(
      expect.objectContaining({
        type: 'basicPoll',
        title: 'Snack vote',
      })
    );
    expect(createdEvent?.payload).toEqual(
      expect.objectContaining({
        parentType: 'group',
        parentId: 'g1',
        basicPollTitle: 'Snack vote',
      })
    );
    expect(createdEvent?.recipients?.userIds).toEqual(
      expect.arrayContaining(['owner-1', 'member-1', 'member-2'])
    );
  });

  test('createBasicPoll defaults invalid vote visibility to full visibility', async () => {
    await callables.createBasicPoll.run(
      {
        parentType: 'group',
        parentId: 'g1',
        pollData: {
          title: 'Fallback vote visibility',
          options: pollData.options,
          settings: pollData.settings,
          voteVisibility: 'not-a-mode',
        },
      },
      buildContext('owner-1')
    );

    expect(createdPollSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voteVisibility: 'full_visibility',
      })
    );
  });

  test('createBasicPoll defaults invalid vote anonymization to none', async () => {
    await callables.createBasicPoll.run(
      {
        parentType: 'group',
        parentId: 'g1',
        pollData: {
          title: 'Fallback vote anonymization',
          options: pollData.options,
          settings: pollData.settings,
          voteAnonymization: 'not-a-mode',
        },
      },
      buildContext('owner-1')
    );

    expect(createdPollSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voteAnonymization: 'none',
      })
    );
  });

  test('createBasicPoll keeps hideVoterIdentities for non-full visibility', async () => {
    await callables.createBasicPoll.run(
      {
        parentType: 'group',
        parentId: 'g1',
        pollData: {
          title: 'Identity toggle',
          options: pollData.options,
          settings: pollData.settings,
          voteVisibility: 'hidden',
          hideVoterIdentities: true,
        },
      },
      buildContext('owner-1')
    );

    expect(createdPollSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hideVoterIdentities: true,
      })
    );
  });

  test('createBasicPoll forces hideVoterIdentities off for full visibility', async () => {
    await callables.createBasicPoll.run(
      {
        parentType: 'group',
        parentId: 'g1',
        pollData: {
          title: 'Identity toggle full',
          options: pollData.options,
          settings: pollData.settings,
          voteVisibility: 'full_visibility',
          hideVoterIdentities: true,
        },
      },
      buildContext('owner-1')
    );

    expect(createdPollSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voteVisibility: 'full_visibility',
        hideVoterIdentities: false,
      })
    );
  });

  test('finalizeBasicPoll supports scheduler embedded polls for scheduler creator', async () => {
    await callables.finalizeBasicPoll.run(
      {
        parentType: 'scheduler',
        parentId: 'sched-1',
        pollId: 'poll-1',
      },
      buildContext('owner-1')
    );

    expect(pollUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FINALIZED',
        finalizedAt: 'server-time',
        finalResults: expect.objectContaining({
          voteType: 'MULTIPLE_CHOICE',
        }),
      })
    );

    const eventTypes = notificationEventSetMock.mock.calls.map((call) => call[0]?.eventType);
    expect(eventTypes).toContain('BASIC_POLL_FINALIZED');
    expect(eventTypes).toContain('BASIC_POLL_RESULTS');
  });

  test('finalizeBasicPoll enforces manager permissions', async () => {
    await expect(
      callables.finalizeBasicPoll.run(
        {
          parentType: 'group',
          parentId: 'g1',
          pollId: 'poll-1',
        },
        buildContext('member-2', 'member-2@example.com')
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('finalizeBasicPoll enforces scheduler creator permissions', async () => {
    await expect(
      callables.finalizeBasicPoll.run(
        {
          parentType: 'scheduler',
          parentId: 'sched-1',
          pollId: 'poll-1',
        },
        buildContext('member-1', 'member-1@example.com')
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('finalizeBasicPoll snapshots results and emits finalized/results events', async () => {
    await callables.finalizeBasicPoll.run(
      {
        parentType: 'group',
        parentId: 'g1',
        pollId: 'poll-1',
      },
      buildContext('owner-1')
    );

    expect(pollUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FINALIZED',
        finalizedAt: 'server-time',
        finalResults: expect.objectContaining({
          voteType: 'MULTIPLE_CHOICE',
        }),
      })
    );

    const eventTypes = notificationEventSetMock.mock.calls.map((call) => call[0]?.eventType);
    expect(eventTypes).toContain('BASIC_POLL_FINALIZED');
    expect(eventTypes).toContain('BASIC_POLL_RESULTS');
  });

  test('resetBasicPollVotes deletes vote docs and emits BASIC_POLL_RESET', async () => {
    voteDocs = [
      makeVoteDoc('owner-1', { optionIds: ['opt-a'] }),
      makeVoteDoc('member-1', { optionIds: ['opt-b'] }),
    ];

    const result = await callables.resetBasicPollVotes.run(
      {
        parentType: 'group',
        parentId: 'g1',
        pollId: 'poll-1',
      },
      buildContext('owner-1')
    );

    expect(result).toEqual({ deletedVotes: 2 });
    expect(voteDeleteMock).toHaveBeenCalledTimes(2);
    expect(notificationEventSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_RESET',
      })
    );
  });

  test('reopenBasicPoll reopens poll and emits BASIC_POLL_REOPENED', async () => {
    const result = await callables.reopenBasicPoll.run(
      {
        parentType: 'group',
        parentId: 'g1',
        pollId: 'poll-1',
      },
      buildContext('owner-1')
    );

    expect(result).toEqual({ status: 'OPEN' });
    expect(pollUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'OPEN',
        updatedAt: 'server-time',
      })
    );
    expect(notificationEventSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_REOPENED',
      })
    );
  });

  test('reopenBasicPoll supports scheduler embedded polls for scheduler creator', async () => {
    const result = await callables.reopenBasicPoll.run(
      {
        parentType: 'scheduler',
        parentId: 'sched-1',
        pollId: 'poll-1',
      },
      buildContext('owner-1')
    );

    expect(result).toEqual({ status: 'OPEN' });
    expect(pollUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'OPEN',
        updatedAt: 'server-time',
      })
    );
    expect(notificationEventSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_REOPENED',
      })
    );
  });

  test('removeBasicPoll deletes poll/votes and emits BASIC_POLL_REMOVED', async () => {
    voteDocs = [makeVoteDoc('owner-1', { optionIds: ['opt-a'] })];

    const result = await callables.removeBasicPoll.run(
      {
        parentType: 'group',
        parentId: 'g1',
        pollId: 'poll-1',
      },
      buildContext('owner-1')
    );

    expect(result).toEqual({ removed: true });
    expect(voteDeleteMock).toHaveBeenCalledTimes(1);
    expect(pollDeleteMock).toHaveBeenCalledTimes(1);
    expect(notificationEventSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_REMOVED',
      })
    );
  });

  test('resetBasicPollVotes enforces manager permissions', async () => {
    await expect(
      callables.resetBasicPollVotes.run(
        {
          parentType: 'group',
          parentId: 'g1',
          pollId: 'poll-1',
        },
        buildContext('member-2', 'member-2@example.com')
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('notifyBasicPollRequiredChanged enforces scheduler creator permissions', async () => {
    await expect(
      callables.notifyBasicPollRequiredChanged.run(
        {
          schedulerId: 'sched-1',
          basicPollId: 'poll-1',
        },
        buildContext('member-1', 'member-1@example.com')
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('notifyBasicPollRequiredChanged rejects unauthenticated caller', async () => {
    await expect(
      callables.notifyBasicPollRequiredChanged.run(
        {
          schedulerId: 'sched-1',
          basicPollId: 'poll-1',
        },
        {}
      )
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  test('notifyBasicPollRequiredChanged validates required ids', async () => {
    await expect(
      callables.notifyBasicPollRequiredChanged.run(
        {
          schedulerId: 'sched-1',
        },
        buildContext('owner-1')
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('notifyBasicPollRequiredChanged emits missing-voter recipients', async () => {
    const result = await callables.notifyBasicPollRequiredChanged.run(
      {
        schedulerId: 'sched-1',
        basicPollId: 'poll-1',
      },
      buildContext('owner-1')
    );

    expect(result).toEqual({
      ok: true,
      required: true,
      eligibleCount: 3,
      missingVoterIds: expect.arrayContaining(['member-1', 'member-2']),
    });
    expect(notificationEventSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_REQUIRED_CHANGED',
        recipients: expect.objectContaining({
          userIds: expect.arrayContaining(['member-1', 'member-2']),
        }),
      })
    );
  });

  test('getRequiredEmbeddedPollFinalizeSummary returns required poll missing-vote details', async () => {
    const result = await callables.getRequiredEmbeddedPollFinalizeSummary.run(
      {
        schedulerId: 'sched-1',
      },
      buildContext('owner-1')
    );

    expect(result).toEqual({
      schedulerId: 'sched-1',
      eligibleCount: 3,
      totalMissingVotes: 2,
      hasMissingRequiredVotes: true,
      requiredPolls: [
        expect.objectContaining({
          basicPollId: 'poll-1',
          basicPollTitle: 'Embedded snack vote',
          missingCount: 2,
          missingUserIds: expect.arrayContaining(['member-1', 'member-2']),
          missingUsers: expect.arrayContaining([
            expect.objectContaining({
              userId: 'member-1',
              email: 'member-1@example.com',
            }),
            expect.objectContaining({
              userId: 'member-2',
              email: 'member-2@example.com',
            }),
          ]),
        }),
      ],
    });
  });

  test('getRequiredEmbeddedPollFinalizeSummary validates scheduler id', async () => {
    await expect(
      callables.getRequiredEmbeddedPollFinalizeSummary.run({}, buildContext('owner-1'))
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('getRequiredEmbeddedPollFinalizeSummary returns not-found when scheduler is missing', async () => {
    schedulerExists = false;

    await expect(
      callables.getRequiredEmbeddedPollFinalizeSummary.run(
        {
          schedulerId: 'missing-scheduler',
        },
        buildContext('owner-1')
      )
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
