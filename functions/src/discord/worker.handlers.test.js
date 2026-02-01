import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let worker;
let editOriginalInteractionResponseMock;
let fetchChannelMock;
let codeGetMock;
let codeSetMock;
let codeDeleteMock;
let groupGetMock;
let groupSetMock;
let groupQueryDocs;

const buildDocSnap = (data, exists = true) => ({
  exists,
  data: () => data,
});

describe('discord worker handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    editOriginalInteractionResponseMock = vi.fn().mockResolvedValue({ ok: true });
    fetchChannelMock = vi.fn().mockResolvedValue({ name: 'general' });
    codeGetMock = vi.fn();
    codeSetMock = vi.fn();
    codeDeleteMock = vi.fn();
    groupGetMock = vi.fn();
    groupSetMock = vi.fn();
    groupQueryDocs = [];

    const db = {
      collection: (name) => {
        if (name === 'discordLinkCodes') {
          return {
            doc: () => ({
              get: codeGetMock,
              set: codeSetMock,
              delete: codeDeleteMock,
            }),
          };
        }
        if (name === 'questingGroups') {
          return {
            doc: () => ({
              get: groupGetMock,
              set: groupSetMock,
            }),
            where: () => ({
              get: async () => ({
                empty: groupQueryDocs.length === 0,
                docs: groupQueryDocs,
              }),
            }),
          };
        }
        return { doc: () => ({}) };
      },
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => db,
    };
    adminMock.firestore.FieldValue = {
      serverTimestamp: vi.fn(() => 'server-time'),
      delete: vi.fn(() => 'deleted'),
    };

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
        InteractionType: { ApplicationCommand: 2 },
        ComponentType: { Button: 2, StringSelect: 3 },
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
    require.cache[require.resolve('./error-messages')] = {
      exports: {
        ERROR_MESSAGES: {
          missingLinkCode: 'missing code',
          linkChannelOnly: 'channel only',
          linkPermissions: 'permissions',
          linkCodeInvalidOrExpired: 'invalid or expired',
          linkCodeInvalid: 'invalid',
          linkCodeExpired: 'expired',
          noLinkedGroup: 'no linked group',
        },
        buildUserNotLinkedMessage: vi.fn(),
      },
    };
    require.cache[require.resolve('./discord-client')] = {
      exports: {
        editOriginalInteractionResponse: (...args) => editOriginalInteractionResponseMock(...args),
        fetchChannel: (...args) => fetchChannelMock(...args),
      },
    };

    worker = await import('./worker');
  });

  test('handleLinkGroup requires link code', async () => {
    await worker.__test__.handleLinkGroup({
      id: 'invalid',
      token: 'tok',
      applicationId: 'app',
      data: { options: [] },
      guildId: 'guild1',
      channelId: 'chan1',
      member: { permissions: '8' },
    });

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: 'missing code' }),
      })
    );
  });

  test('handleLinkGroup returns error for invalid code', async () => {
    codeGetMock.mockResolvedValueOnce({ exists: false });

    await worker.__test__.handleLinkGroup({
      id: 'invalid',
      token: 'tok',
      applicationId: 'app',
      data: { options: [{ name: 'code', value: '123' }] },
      guildId: 'guild1',
      channelId: 'chan1',
      member: { permissions: '8' },
    });

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: 'invalid or expired' }),
      })
    );
  });

  test('handleLinkGroup stores discord link on success', async () => {
    codeGetMock.mockResolvedValueOnce(
      buildDocSnap({
        type: 'group-link',
        groupId: 'group1',
        uid: 'user1',
        attempts: 0,
        expiresAt: { toDate: () => new Date(Date.now() + 10000) },
      })
    );
    groupGetMock.mockResolvedValueOnce(buildDocSnap({ discord: { notifyRoleId: 'role1' } }));

    await worker.__test__.handleLinkGroup({
      id: 'invalid',
      token: 'tok',
      applicationId: 'app',
      data: { options: [{ name: 'code', value: '123' }] },
      guildId: 'guild1',
      channelId: 'chan1',
      member: { permissions: '8' },
    });

    expect(groupSetMock).toHaveBeenCalled();
    expect(codeDeleteMock).toHaveBeenCalled();
    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: expect.stringContaining('Discord channel linked') }),
      })
    );
  });

  test('handleUnlinkGroup rejects when no linked group', async () => {
    await worker.__test__.handleUnlinkGroup({
      id: 'invalid',
      token: 'tok',
      applicationId: 'app',
      guildId: 'guild1',
      channelId: 'chan1',
      member: { permissions: '8' },
    });

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: 'no linked group' }),
      })
    );
  });

  test('handleUnlinkGroup clears discord link', async () => {
    const setMock = vi.fn();
    groupQueryDocs = [
      {
        data: () => ({ discord: { guildId: 'guild1' } }),
        ref: { set: setMock },
      },
    ];

    await worker.__test__.handleUnlinkGroup({
      id: 'invalid',
      token: 'tok',
      applicationId: 'app',
      guildId: 'guild1',
      channelId: 'chan1',
      member: { permissions: '8' },
    });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        discord: 'deleted',
      }),
      { merge: true }
    );
  });
});
