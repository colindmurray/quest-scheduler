import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let triggers;
let queueNotificationEventMock;

let groupData;
let pollData;

function buildFirestoreMock() {
  const pollDocRef = {
    get: vi.fn(async () => ({ exists: true, data: () => pollData })),
  };

  const groupDocRef = {
    get: vi.fn(async () => ({ exists: true, data: () => groupData })),
    collection: vi.fn((name) => {
      if (name !== 'basicPolls') return { doc: vi.fn() };
      return {
        doc: vi.fn(() => pollDocRef),
      };
    }),
  };

  return {
    collection: vi.fn((name) => {
      if (name === 'questingGroups') {
        return {
          doc: vi.fn(() => groupDocRef),
        };
      }
      if (name === 'schedulers') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({}) })),
            collection: vi.fn(() => ({
              doc: vi.fn(() => ({
                get: vi.fn(async () => ({ exists: true, data: () => pollData })),
              })),
            })),
          })),
        };
      }
      return {
        doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false, data: () => ({}) })) })),
      };
    }),
  };
}

describe('basic poll notification triggers', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    queueNotificationEventMock = vi.fn().mockResolvedValue({ eventId: 'evt-1' });

    groupData = {
      creatorId: 'owner-1',
      memberIds: ['owner-1', 'member-1'],
    };
    pollData = {
      title: 'Snack vote',
      creatorId: 'owner-1',
      settings: {
        voteType: 'MULTIPLE_CHOICE',
        allowWriteIn: false,
        deadlineAt: null,
      },
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-functions/v2/firestore')] = {
      exports: {
        onDocumentWritten: (_path, handler) => {
          const fn = (event) => handler(event);
          fn.run = handler;
          return fn;
        },
        onDocumentUpdated: (_path, handler) => {
          const fn = (event) => handler(event);
          fn.run = handler;
          return fn;
        },
      },
    };
    require.cache[require.resolve('firebase-functions')] = {
      exports: {
        logger: {
          error: vi.fn(),
        },
      },
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => buildFirestoreMock(),
    };

    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('../notifications/write-event')] = {
      exports: {
        queueNotificationEvent: (...args) => queueNotificationEventMock(...args),
      },
    };

    triggers = await import('./basic-polls');
  });

  test('onGroupBasicPollVoteWritten emits BASIC_POLL_VOTE_SUBMITTED for submitted votes', async () => {
    await triggers.onGroupBasicPollVoteWritten.run({
      params: {
        groupId: 'group-1',
        pollId: 'poll-1',
        userId: 'member-1',
      },
      data: {
        before: {
          exists: () => false,
          data: () => null,
        },
        after: {
          exists: () => true,
          data: () => ({ optionIds: ['opt-a'], source: 'web' }),
        },
      },
    });

    expect(queueNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_VOTE_SUBMITTED',
        createdBy: 'member-1',
        source: 'web',
      })
    );
  });

  test('onSchedulerBasicPollVoteWritten emits BASIC_POLL_VOTE_SUBMITTED for scheduler parent', async () => {
    await triggers.onSchedulerBasicPollVoteWritten.run({
      params: {
        schedulerId: 'sched-1',
        pollId: 'poll-1',
        userId: 'member-1',
      },
      data: {
        before: {
          exists: () => false,
          data: () => null,
        },
        after: {
          exists: () => true,
          data: () => ({ optionIds: ['opt-a'], source: 'discord' }),
        },
      },
    });

    expect(queueNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_VOTE_SUBMITTED',
        source: 'discord',
        payload: expect.objectContaining({
          parentType: 'scheduler',
          parentId: 'sched-1',
        }),
      })
    );
  });

  test('onGroupBasicPollVoteWritten skips unchanged vote payloads', async () => {
    await triggers.onGroupBasicPollVoteWritten.run({
      params: {
        groupId: 'group-1',
        pollId: 'poll-1',
        userId: 'member-1',
      },
      data: {
        before: {
          exists: () => true,
          data: () => ({ optionIds: ['opt-a'], source: 'web' }),
        },
        after: {
          exists: () => true,
          data: () => ({ optionIds: ['opt-a'], source: 'web' }),
        },
      },
    });

    expect(queueNotificationEventMock).not.toHaveBeenCalled();
  });

  test('onGroupBasicPollDeadlineUpdated emits BASIC_POLL_DEADLINE_CHANGED when deadline changes', async () => {
    await triggers.onGroupBasicPollDeadlineUpdated.run({
      params: {
        groupId: 'group-1',
        pollId: 'poll-1',
      },
      data: {
        before: {
          data: () => ({
            title: 'Snack vote',
            settings: { deadlineAt: null },
          }),
        },
        after: {
          data: () => ({
            title: 'Snack vote',
            creatorId: 'owner-1',
            settings: { deadlineAt: '2026-03-01T12:00:00.000Z' },
          }),
        },
      },
    });

    expect(queueNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_DEADLINE_CHANGED',
        createdBy: 'owner-1',
      })
    );
  });

  test('onSchedulerBasicPollDeadlineUpdated emits BASIC_POLL_DEADLINE_CHANGED', async () => {
    await triggers.onSchedulerBasicPollDeadlineUpdated.run({
      params: {
        schedulerId: 'sched-1',
        pollId: 'poll-1',
      },
      data: {
        before: {
          data: () => ({
            title: 'Snack vote',
            settings: { deadlineAt: null },
          }),
        },
        after: {
          data: () => ({
            title: 'Snack vote',
            creatorId: 'owner-1',
            settings: { deadlineAt: '2026-04-01T12:00:00.000Z' },
          }),
        },
      },
    });

    expect(queueNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_DEADLINE_CHANGED',
        payload: expect.objectContaining({
          parentType: 'scheduler',
          parentId: 'sched-1',
        }),
      })
    );
  });

  test('onGroupBasicPollDeadlineUpdated does not emit when deadline is unchanged', async () => {
    await triggers.onGroupBasicPollDeadlineUpdated.run({
      params: {
        groupId: 'group-1',
        pollId: 'poll-1',
      },
      data: {
        before: {
          data: () => ({
            title: 'Snack vote',
            settings: { deadlineAt: null },
          }),
        },
        after: {
          data: () => ({
            title: 'Snack vote',
            creatorId: 'owner-1',
            settings: { deadlineAt: null },
          }),
        },
      },
    });

    expect(queueNotificationEventMock).not.toHaveBeenCalled();
  });
});
