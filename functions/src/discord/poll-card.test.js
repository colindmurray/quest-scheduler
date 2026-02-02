import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let pollCard;
let previousAppUrl;

describe('discord poll card', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    previousAppUrl = process.env.QS_APP_URL;
    process.env.QS_APP_URL = 'https://app.example.com';
    pollCard = await import('./poll-card');
  });

  afterEach(() => {
    if (previousAppUrl === undefined) {
      delete process.env.QS_APP_URL;
    } else {
      process.env.QS_APP_URL = previousAppUrl;
    }
  });

  test('buildPollCard includes vote counts and range', () => {
    const scheduler = { title: 'Campaign', status: 'OPEN' };
    const slots = [
      { id: 'b', start: '2025-02-02T10:00:00.000Z', end: '2025-02-02T11:00:00.000Z' },
      { id: 'a', start: '2025-01-01T10:00:00.000Z', end: '2025-01-01T11:00:00.000Z' },
    ];

    const result = pollCard.buildPollCard({
      schedulerId: 'sched1',
      scheduler,
      slots,
      voteCount: 1,
      totalParticipants: 3,
    });

    expect(result.embeds[0].title).toBe('Campaign');
    expect(result.embeds[0].description).toContain('https://app.example.com/scheduler/sched1');

    const fields = result.embeds[0].fields;
    const votesField = fields.find((field) => field.name === 'Votes');
    expect(votesField?.value).toBe('1/3 voted (2 pending)');

    const rangeField = fields.find((field) => field.name === 'Range');
    expect(rangeField?.value).toContain('UTC');
  });

  test('buildPollCard marks finalized status and winning slot', () => {
    const scheduler = { title: 'Finale', status: 'FINALIZED', winningSlotId: 'b' };
    const slots = [
      { id: 'b', start: '2025-02-02T10:00:00.000Z', end: '2025-02-02T11:00:00.000Z' },
      { id: 'a', start: '2025-01-01T10:00:00.000Z', end: '2025-01-01T11:00:00.000Z' },
    ];

    const result = pollCard.buildPollCard({
      schedulerId: 'sched2',
      scheduler,
      slots,
    });

    const statusField = result.embeds[0].fields.find((field) => field.name === 'Status');
    expect(statusField?.value).toBe('FINALIZED');

    const winningField = result.embeds[0].fields.find((field) => field.name === 'Winning slot');
    expect(winningField?.value).toContain('UTC');

    const button = result.components[0].components[0];
    expect(button.label).toBe('Voting closed');
    expect(button.disabled).toBe(true);
  });

  test('buildPollStatusCard returns disabled status button', () => {
    const result = pollCard.buildPollStatusCard({
      title: 'Quest Session',
      status: 'CLOSED',
      description: 'Voting closed',
    });

    expect(result.embeds[0].fields[0]).toEqual({ name: 'Status', value: 'CLOSED' });
    const button = result.components[0].components[0];
    expect(button.label).toBe('CLOSED');
    expect(button.disabled).toBe(true);
  });
});
