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

  test('buildDiscordMessage includes mention for poll created events', async () => {
    const module = await import('./discord');
    const result = module.buildDiscordMessage(
      NOTIFICATION_EVENTS.POLL_CREATED,
      {
        resource: { type: 'poll', id: 'poll1', title: 'Quest' },
        payload: { pollTitle: 'Quest' },
      },
      { notifyRoleId: 'role1' }
    );

    expect(result.content).toContain('<@&role1>');
    expect(result.content).toContain('New session poll created');
    expect(result.allowed_mentions).toEqual({ roles: ['role1'] });
  });

  test('buildDiscordMessage includes mention for basic poll created events', async () => {
    const module = await import('./discord');
    const result = module.buildDiscordMessage(
      NOTIFICATION_EVENTS.BASIC_POLL_CREATED,
      {
        resource: { type: 'basicPoll', id: 'bp1', title: 'Snacks vote' },
      },
      {
        notifyRoleId: 'role1',
        pollTitle: 'Snacks vote',
        pollUrl: 'https://app.example.com/groups/g1/polls/bp1',
      }
    );

    expect(result.content).toContain('<@&role1>');
    expect(result.content).toContain('New general poll created');
    expect(result.allowed_mentions).toEqual({ roles: ['role1'] });
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

  test('sendDiscordNotification routes BASIC_POLL_CREATED through group discord context', async () => {
    const module = await import('./discord');
    const db = {
      collection: (name) => {
        if (name === 'questingGroups') {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                data: () => ({
                  discord: {
                    channelId: 'group-chan',
                    guildId: 'group-guild',
                    notifyRoleId: 'role1',
                    notifications: { finalizationEvents: true },
                  },
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
      eventType: NOTIFICATION_EVENTS.BASIC_POLL_CREATED,
      event: {
        resource: { type: 'basicPoll', id: 'poll1', title: 'Snacks vote' },
        payload: { parentType: 'group', parentId: 'group1' },
      },
    });

    expect(result.success).toBe(true);
    expect(createChannelMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'group-chan',
        body: expect.objectContaining({
          content: expect.stringContaining('New general poll created'),
        }),
      })
    );
  });
});
