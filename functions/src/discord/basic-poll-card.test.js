import { describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

require.cache[require.resolve('./config')] = {
  exports: {
    APP_URL: 'https://app.example.com',
  },
};

const { buildBasicPollCard, CARD_COLORS } = require('./basic-poll-card');

describe('buildBasicPollCard', () => {
  test('renders open poll card with vote and finalize buttons', () => {
    const card = buildBasicPollCard({
      groupId: 'g1',
      pollId: 'p1',
      poll: {
        title: 'Food vote',
        description: '  Bring your own snacks  ',
        status: 'OPEN',
        options: [
          { id: 'o1', label: 'Pizza' },
          { id: 'o2', label: 'Subs', note: 'Use coupon' },
        ],
        settings: {
          voteType: 'MULTIPLE_CHOICE',
          deadlineAt: '2026-02-20T12:00:00.000Z',
        },
      },
      voteCount: 2,
      totalParticipants: 5,
    });

    expect(card.embeds[0].color).toBe(CARD_COLORS.OPEN);
    expect(card.embeds[0].title).toBe('📊 Food vote');
    expect(card.embeds[0].description).toBe('Bring your own snacks');
    expect(card.embeds[0].fields.find((field) => field.name === 'Type')?.value).toBe('Multiple Choice');
    expect(card.embeds[0].fields.find((field) => field.name === 'Votes')?.value).toBe('2/5 voted (3 pending)');
    expect(card.embeds[0].fields.find((field) => field.name === 'Options')?.value).toContain('2. Subs ℹ️');
    expect(card.embeds[0].fields.find((field) => field.name === 'View on web')?.value).toBe(
      '[Open poll](https://app.example.com/groups/g1/polls/p1)'
    );
    expect(card.components[0].components[0]).toEqual(
      expect.objectContaining({ custom_id: 'bp_vote:p1', label: 'Vote', style: 1 })
    );
    expect(card.components[0].components[1]).toEqual(
      expect.objectContaining({ custom_id: 'bp_finalize:p1', label: 'Finalize', style: 2 })
    );
  });

  test('renders hidden vote progress label when vote count is not publicly visible', () => {
    const card = buildBasicPollCard({
      groupId: 'g1',
      pollId: 'p-hidden',
      poll: {
        title: 'Secret vote',
        status: 'OPEN',
        options: [{ id: 'o1', label: 'Pizza' }],
        settings: { voteType: 'MULTIPLE_CHOICE' },
      },
      voteCount: null,
      totalParticipants: 5,
    });

    expect(card.embeds[0].fields.find((field) => field.name === 'Votes')?.value).toBe(
      'Vote progress hidden'
    );
  });

  test('renders finalized poll card with disabled close button and results link', () => {
    const card = buildBasicPollCard({
      groupId: 'g1',
      pollId: 'p1',
      poll: {
        title: 'Campaign vote',
        status: 'FINALIZED',
        options: [
          { id: 'c1', label: 'Strahd' },
          { id: 'c2', label: 'Tomb' },
        ],
        settings: { voteType: 'RANKED_CHOICE' },
        finalResults: {
          voteType: 'RANKED_CHOICE',
          rounds: [{}, {}],
          winnerIds: ['c1'],
        },
      },
      voteCount: 4,
      totalParticipants: 4,
    });

    expect(card.embeds[0].color).toBe(CARD_COLORS.FINALIZED);
    expect(card.embeds[0].fields.find((field) => field.name === 'Status')?.value).toBe('Finalized');
    expect(card.embeds[0].fields.find((field) => field.name === 'Results')?.value).toContain('Winner: **c1** (2 rounds).');
    expect(card.embeds[0].fields.find((field) => field.name === 'View on web')?.value).toBe(
      '[Open poll](https://app.example.com/groups/g1/polls/p1)'
    );
    expect(card.components[0].components[0]).toEqual(
      expect.objectContaining({ label: 'Voting Closed', disabled: true })
    );
    expect(card.components[0].components[1]).toEqual(
      expect.objectContaining({
        label: 'View Results',
        style: 5,
        url: 'https://app.example.com/groups/g1/polls/p1',
      })
    );
  });

  test('renders MC finalized results with winner highlighting', () => {
    const card = buildBasicPollCard({
      groupId: 'g1',
      pollId: 'p2',
      poll: {
        title: 'Snack vote',
        status: 'FINALIZED',
        options: [
          { id: 'a', label: 'Nachos' },
          { id: 'b', label: 'Pretzels' },
        ],
        settings: { voteType: 'MULTIPLE_CHOICE' },
        finalResults: {
          voteType: 'MULTIPLE_CHOICE',
          winnerIds: ['a'],
          rows: [
            { key: 'a', label: 'Nachos', count: 3, order: 0 },
            { key: 'b', label: 'Pretzels', count: 1, order: 1 },
          ],
        },
      },
      voteCount: 4,
      totalParticipants: 5,
    });

    const results = card.embeds[0].fields.find((field) => field.name === 'Results')?.value;
    expect(results).toContain('**Nachos**: 3');
    expect(results).toContain('Pretzels: 1');
  });

  test('truncates oversized poll descriptions with quest scheduler link', () => {
    const card = buildBasicPollCard({
      groupId: 'g1',
      pollId: 'p3',
      poll: {
        title: 'Huge description poll',
        status: 'OPEN',
        description: Array.from({ length: 220 }, (_, index) => `line-${index + 1}`).join('\n'),
        settings: { voteType: 'MULTIPLE_CHOICE' },
        options: [{ id: 'a', label: 'A' }],
      },
      voteCount: 1,
      totalParticipants: 2,
    });

    expect(card.embeds[0].description).toContain(
      'View full content on [Quest Scheduler](https://app.example.com/groups/g1/polls/p3).'
    );
  });
});
