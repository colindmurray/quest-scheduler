import { describe, expect, test } from 'vitest';
import {
  computeSchedulerRequiredEmbeddedPollSummary,
  hasSubmittedVote,
} from './required-summary';

function makeVoteDoc(id, data) {
  return {
    id,
    data: () => data,
  };
}

function makeDb({
  schedulerExists = true,
  schedulerData = {},
  requiredPolls = [],
  groupExists = false,
  groupData = {},
  usersPublicById = {},
} = {}) {
  const schedulerRef = {
    get: async () => ({ exists: schedulerExists, data: () => schedulerData }),
    collection: (name) => {
      if (name !== 'basicPolls') {
        return { get: async () => ({ docs: [] }) };
      }
      return {
        get: async () => ({
          docs: requiredPolls.map((poll) => ({
            id: poll.id,
            data: () => poll.data,
            ref: {
              collection: (child) => {
                if (child !== 'votes') return { get: async () => ({ docs: [] }) };
                return {
                  get: async () => ({
                    docs: (poll.votes || []).map((vote) => makeVoteDoc(vote.id, vote.data)),
                  }),
                };
              },
            },
          })),
        }),
      };
    },
  };

  return {
    collection: (name) => {
      if (name === 'schedulers') {
        return { doc: () => schedulerRef };
      }
      if (name === 'questingGroups') {
        return {
          doc: () => ({
            get: async () => ({ exists: groupExists, data: () => groupData }),
          }),
        };
      }
      if (name === 'usersPublic') {
        return {
          doc: (id) => ({
            get: async () => {
              const data = usersPublicById[id];
              return { exists: Boolean(data), data: () => data || {} };
            },
          }),
        };
      }
      return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
    },
  };
}

describe('computeSchedulerRequiredEmbeddedPollSummary', () => {
  test('hasSubmittedVote handles ranked-choice, optionIds, and write-ins', () => {
    expect(hasSubmittedVote('RANKED_CHOICE', false, { rankings: ['a'] })).toBe(true);
    expect(hasSubmittedVote('RANKED_CHOICE', false, { rankings: [] })).toBe(false);
    expect(hasSubmittedVote('MULTIPLE_CHOICE', false, { optionIds: ['a'] })).toBe(true);
    expect(hasSubmittedVote('MULTIPLE_CHOICE', true, { optionIds: [], otherText: '  Other  ' })).toBe(true);
    expect(hasSubmittedVote('MULTIPLE_CHOICE', true, { optionIds: [], otherText: '   ' })).toBe(false);
  });

  test('throws when required args are missing', async () => {
    await expect(
      computeSchedulerRequiredEmbeddedPollSummary({ db: null, schedulerId: 'sched-1' })
    ).rejects.toThrow('db and schedulerId are required');

    await expect(
      computeSchedulerRequiredEmbeddedPollSummary({ db: makeDb(), schedulerId: '' })
    ).rejects.toThrow('db and schedulerId are required');
  });

  test('returns empty summary when scheduler does not exist', async () => {
    const db = makeDb({ schedulerExists: false });

    const summary = await computeSchedulerRequiredEmbeddedPollSummary({
      db,
      schedulerId: 'missing-scheduler',
    });

    expect(summary).toEqual({
      schedulerId: 'missing-scheduler',
      eligibleUserIds: [],
      eligibleCount: 0,
      requiredPolls: [],
      totalMissingVotes: 0,
      hasMissingRequiredVotes: false,
    });
  });

  test('falls back missing user details when usersPublic doc is absent', async () => {
    const db = makeDb({
      schedulerData: {
        creatorId: 'owner-1',
        participantIds: ['member-1'],
      },
      requiredPolls: [
        {
          id: 'poll-1',
          data: {
            title: 'Required Poll',
            required: true,
            settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
          },
          votes: [
            {
              id: 'owner-1',
              data: { optionIds: ['opt-a'] },
            },
          ],
        },
      ],
      usersPublicById: {
        'owner-1': { email: 'owner@example.com', displayName: 'Owner' },
      },
    });

    const summary = await computeSchedulerRequiredEmbeddedPollSummary({
      db,
      schedulerId: 'sched-1',
      includeMissingUsers: true,
    });

    expect(summary.requiredPolls).toEqual([
      expect.objectContaining({
        basicPollId: 'poll-1',
        missingUserIds: ['member-1'],
        missingUsers: [
          {
            userId: 'member-1',
            email: null,
            displayName: 'member-1',
          },
        ],
      }),
    ]);
  });

  test('resolves eligible users from scheduler + questing group and filters required/open polls', async () => {
    const db = makeDb({
      schedulerData: {
        creatorId: 'owner-1',
        participantIds: ['member-1'],
        questingGroupId: 'group-1',
      },
      groupExists: true,
      groupData: {
        creatorId: 'group-owner',
        memberIds: ['member-2', 'member-3'],
      },
      requiredPolls: [
        {
          id: 'mc-required',
          data: {
            title: 'MC Required',
            required: true,
            order: 2,
            settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
          },
          votes: [{ id: 'owner-1', data: { optionIds: ['opt-a'] } }],
        },
        {
          id: 'rc-required',
          data: {
            title: 'RC Required',
            required: true,
            order: 1,
            settings: { voteType: 'RANKED_CHOICE' },
          },
          votes: [{ id: 'member-1', data: { rankings: ['opt-a'] } }],
        },
        {
          id: 'optional',
          data: {
            title: 'Optional',
            required: false,
            order: 3,
            settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
          },
          votes: [],
        },
        {
          id: 'closed-required',
          data: {
            title: 'Closed Required',
            required: true,
            status: 'FINALIZED',
            order: 4,
            settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
          },
          votes: [],
        },
      ],
    });

    const summary = await computeSchedulerRequiredEmbeddedPollSummary({
      db,
      schedulerId: 'sched-2',
      includeMissingUsers: false,
    });

    expect(summary.eligibleUserIds).toEqual(
      expect.arrayContaining(['owner-1', 'member-1', 'member-2', 'member-3', 'group-owner'])
    );
    expect(summary.eligibleCount).toBe(5);
    expect(summary.requiredPolls).toHaveLength(2);
    expect(summary.requiredPolls.map((poll) => poll.basicPollId)).toEqual(['rc-required', 'mc-required']);
    expect(summary.totalMissingVotes).toBe(8);
    expect(summary.hasMissingRequiredVotes).toBe(true);
  });
});
