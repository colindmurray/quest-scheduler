import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { NOTIFICATION_EVENTS } = require('./constants');

let createChannelMessageMock;

describe('notification discord routing', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    createChannelMessageMock = vi.fn();

    require.cache[require.resolve('../discord/config')] = {
      exports: {
        APP_URL: 'https://app.example.com',
        DISCORD_NOTIFICATION_DEFAULTS: {
          finalizationEvents: true,
          slotChanges: true,
          voteSubmitted: false,
          allVotesIn: false,
        },
      },
    };
    require.cache[require.resolve('../discord/discord-client')] = {
      exports: {
        createChannelMessage: (...args) => createChannelMessageMock(...args),
      },
    };
  });

  test('buildDiscordMessage formats vote submitted content', async () => {
    const module = await import('./discord');
    const result = module.buildDiscordMessage(
      NOTIFICATION_EVENTS.VOTE_SUBMITTED,
      {
        resource: { type: 'poll', id: 'poll1', title: 'Quest' },
        actor: { displayName: 'Voter' },
        payload: { pollTitle: 'Quest' },
      },
      { notifyRoleId: 'none' }
    );

    expect(result.content).toContain('Voter');
    expect(result.content).toContain('Quest');
    expect(result.content).toContain('https://app.example.com/scheduler/poll1');
  });

  test('buildDiscordMessage formats all votes in content', async () => {
    const module = await import('./discord');
    const result = module.buildDiscordMessage(
      NOTIFICATION_EVENTS.POLL_READY_TO_FINALIZE,
      {
        resource: { type: 'poll', id: 'poll1', title: 'Quest' },
        payload: { pollTitle: 'Quest' },
      },
      { notifyRoleId: 'none' }
    );

    expect(result.content).toContain('All votes are in');
    expect(result.content).toContain('Quest');
    expect(result.content).toContain('https://app.example.com/scheduler/poll1');
  });

  test('buildDiscordMessage includes mention for finalization events', async () => {
    const module = await import('./discord');
    const result = module.buildDiscordMessage(
      NOTIFICATION_EVENTS.POLL_FINALIZED,
      {
        resource: { type: 'poll', id: 'poll1', title: 'Quest' },
        payload: { pollTitle: 'Quest', winningDate: 'Jan 1, 2026 · 6:00 PM' },
      },
      { notifyRoleId: 'everyone' }
    );

    expect(result.content).toContain('@everyone');
    expect(result.allowed_mentions).toEqual({ parse: ['everyone'] });
  });

  test('sendDiscordNotification posts when settings allow', async () => {
    const module = await import('./discord');
    const db = {
      collection: (name) => {
        if (name === 'schedulers') {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                data: () => ({
                  questingGroupId: 'group1',
                  discord: { channelId: 'chan1', guildId: 'guild1' },
                }),
              }),
            }),
          };
        }
        if (name === 'questingGroups') {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                data: () => ({
                  discord: { notifications: { voteSubmitted: true } },
                }),
              }),
            }),
          };
        }
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };

    const result = await module.sendDiscordNotification({
      db,
      eventType: NOTIFICATION_EVENTS.VOTE_SUBMITTED,
      event: {
        resource: { type: 'poll', id: 'poll1' },
        actor: { displayName: 'Voter' },
        payload: { pollTitle: 'Quest' },
      },
    });

    expect(result.success).toBe(true);
    expect(createChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'chan1' })
    );
  });
});
