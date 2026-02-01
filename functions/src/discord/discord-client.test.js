import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let discordClient;
let restInstance;

const restGetMock = vi.fn();
const restPostMock = vi.fn();
const restPatchMock = vi.fn();

describe('discord client', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    restInstance = {
      setToken: vi.fn(() => restInstance),
      get: restGetMock,
      post: restPostMock,
      patch: restPatchMock,
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('@discordjs/rest')] = {
      exports: {
        REST: class {
          constructor() {
            return restInstance;
          }
        },
      },
    };
    require.cache[require.resolve('discord-api-types/v10')] = {
      exports: {
        Routes: {
          webhookMessage: (appId, token, messageId) =>
            `/webhooks/${appId}/${token}/${messageId}`,
          channelMessages: (channelId) => `/channels/${channelId}/messages`,
          channelMessage: (channelId, messageId) => `/channels/${channelId}/messages/${messageId}`,
          channel: (channelId) => `/channels/${channelId}`,
          guildRoles: (guildId) => `/guilds/${guildId}/roles`,
        },
      },
    };
    require.cache[require.resolve('./config')] = {
      exports: {
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        DISCORD_NOTIFICATION_DEFAULTS: {
          finalizationEvents: true,
          slotChanges: true,
          voteSubmitted: false,
        },
      },
    };

    discordClient = await import('./discord-client');
  });

  test('createChannelMessage posts to channel route', async () => {
    restPostMock.mockResolvedValueOnce({ id: 'msg1' });

    const result = await discordClient.createChannelMessage({
      channelId: 'chan1',
      body: { content: 'hi' },
    });

    expect(restPostMock).toHaveBeenCalledWith('/channels/chan1/messages', {
      body: { content: 'hi' },
    });
    expect(result).toEqual({ id: 'msg1' });
  });

  test('editOriginalInteractionResponse patches webhook message', async () => {
    await discordClient.editOriginalInteractionResponse({
      applicationId: 'app',
      token: 'token',
      body: { content: 'done' },
    });

    expect(restPatchMock).toHaveBeenCalledWith('/webhooks/app/token/@original', {
      body: { content: 'done' },
    });
  });

  test('fetchGuildRoles calls guild roles route', async () => {
    restGetMock.mockResolvedValueOnce([{ id: 'r1' }]);

    const result = await discordClient.fetchGuildRoles({ guildId: 'guild1' });

    expect(restGetMock).toHaveBeenCalledWith('/guilds/guild1/roles');
    expect(result).toEqual([{ id: 'r1' }]);
  });

  test('editChannelMessage patches channel message', async () => {
    await discordClient.editChannelMessage({
      channelId: 'chan1',
      messageId: 'msg1',
      body: { content: 'update' },
    });

    expect(restPatchMock).toHaveBeenCalledWith('/channels/chan1/messages/msg1', {
      body: { content: 'update' },
    });
  });

  test('fetchChannel calls channel route', async () => {
    restGetMock.mockResolvedValueOnce({ id: 'chan1' });

    const result = await discordClient.fetchChannel({ channelId: 'chan1' });

    expect(restGetMock).toHaveBeenCalledWith('/channels/chan1');
    expect(result).toEqual({ id: 'chan1' });
  });

  test('createDiscordRestClient sets bot token', async () => {
    const client = discordClient.createDiscordRestClient();
    expect(client).toBe(restInstance);
    expect(restInstance.setToken).toHaveBeenCalledWith('token');
  });
});
