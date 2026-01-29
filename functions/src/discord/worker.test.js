import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let worker;
let editOriginalInteractionResponseMock;
let loggerMock;
let appIdValue;
let sessionGetMock;

describe('discord worker', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    appIdValue = 'app123';
    editOriginalInteractionResponseMock = vi.fn();
    loggerMock = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    };
    sessionGetMock = vi.fn().mockResolvedValue({ exists: false });

    const txSetMock = vi.fn();
    const interactionSetMock = vi.fn();
    const interactionDeleteMock = vi.fn().mockResolvedValue(undefined);
    const firestoreDb = {
      collection: vi.fn((name) => {
        if (name === 'discordInteractionIds') {
          return {
            doc: () => ({
              set: interactionSetMock,
              delete: interactionDeleteMock,
            }),
          };
        }
        if (name === 'discordVoteSessions') {
          return {
            doc: () => ({
              get: sessionGetMock,
              set: vi.fn(),
              delete: vi.fn(),
            }),
          };
        }
        return { doc: vi.fn(() => ({}) ) };
      }),
      runTransaction: async (fn) =>
        fn({
          get: async () => ({ exists: false }),
          set: txSetMock,
        }),
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => firestoreDb,
    };
    adminMock.firestore.FieldValue = { serverTimestamp: vi.fn(() => 'server-time') };
    adminMock.firestore.Timestamp = { fromDate: vi.fn((date) => ({ toDate: () => date })) };

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
      exports: { logger: loggerMock },
    };
    require.cache[require.resolve('firebase-functions/params')] = {
      exports: {
        defineSecret: (name) => ({
          value: () => (name === 'DISCORD_APPLICATION_ID' ? appIdValue : 'token'),
        }),
      },
    };
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('discord-api-types/v10')] = {
      exports: {
        InteractionType: { ApplicationCommand: 2, MessageComponent: 3 },
        ComponentType: { Button: 2, StringSelect: 3 },
      },
    };
    require.cache[require.resolve('./config')] = {
      exports: {
        DISCORD_APPLICATION_ID: { value: () => appIdValue },
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        DISCORD_REGION: 'us-central1',
        APP_URL: 'https://app.example.com',
      },
    };
    require.cache[require.resolve('./discord-client')] = {
      exports: {
        editOriginalInteractionResponse: (...args) =>
          editOriginalInteractionResponseMock(...args),
        fetchChannel: vi.fn(),
      },
    };
    require.cache[require.resolve('./link-utils')] = {
      exports: { hashLinkCode: vi.fn(() => 'hash') },
    };
    require.cache[require.resolve('./error-messages')] = {
      exports: {
        ERROR_MESSAGES: {
          missingPollId: 'missing poll',
          genericError: 'generic error',
          sessionExpired: 'session expired',
        },
        buildUserNotLinkedMessage: vi.fn(() => 'not linked'),
      },
    };

    worker = await import('./worker');
  });

  test('returns early when interaction payload missing', async () => {
    await expect(worker.processDiscordInteraction.run({ data: null })).resolves.toBeUndefined();
  });

  test('returns early when applicationId mismatches', async () => {
    await expect(
      worker.processDiscordInteraction.run({
        data: { id: 'interaction1', applicationId: `${appIdValue}-wrong` },
      })
    ).resolves.toBeUndefined();
  });

  test('responds with fallback message for unsupported action', async () => {
    editOriginalInteractionResponseMock.mockResolvedValueOnce({ ok: true });

    await worker.processDiscordInteraction.run({
      data: {
        id: 'interaction2',
        applicationId: appIdValue,
        token: 'token',
        type: 3,
        data: { custom_id: 'unknown' },
      },
    });

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: 'Action not supported.' }),
      })
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      'Discord interaction handled',
      expect.objectContaining({ handled: false })
    );
  });

  test('responds with fallback message for unsupported command', async () => {
    editOriginalInteractionResponseMock.mockResolvedValueOnce({ ok: true });

    await worker.processDiscordInteraction.run({
      data: {
        id: 'interaction2b',
        applicationId: appIdValue,
        token: 'token',
        type: 2,
        data: { name: 'unknown' },
      },
    });

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: 'Command not supported yet.' }),
      })
    );
  });

  test('returns missing poll error for vote_feasible without id', async () => {
    editOriginalInteractionResponseMock.mockResolvedValueOnce({ ok: true });

    await worker.processDiscordInteraction.run({
      data: {
        id: 'interaction2c',
        applicationId: appIdValue,
        token: 'token',
        type: 3,
        data: { custom_id: 'vote_feasible:' },
      },
    });

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: 'missing poll' }),
      })
    );
  });

  test('returns missing poll error for vote_pref without id', async () => {
    editOriginalInteractionResponseMock.mockResolvedValueOnce({ ok: true });

    await worker.processDiscordInteraction.run({
      data: {
        id: 'interaction2d',
        applicationId: appIdValue,
        token: 'token',
        type: 3,
        data: { custom_id: 'vote_pref:' },
      },
    });

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: 'missing poll' }),
      })
    );
  });

  test('returns session expired for vote_pref with id', async () => {
    editOriginalInteractionResponseMock.mockResolvedValueOnce({ ok: true });

    await worker.processDiscordInteraction.run({
      data: {
        id: 'interaction2e',
        applicationId: appIdValue,
        token: 'token',
        type: 3,
        data: { custom_id: 'vote_pref:sched1' },
        member: { user: { id: 'discord1' } },
      },
    });

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: 'session expired' }),
      })
    );
  });

  test('returns session expired for vote_feasible with id', async () => {
    editOriginalInteractionResponseMock.mockResolvedValueOnce({ ok: true });

    await worker.processDiscordInteraction.run({
      data: {
        id: 'interaction2f',
        applicationId: appIdValue,
        token: 'token',
        type: 3,
        data: { custom_id: 'vote_feasible:sched1' },
        member: { user: { id: 'discord1' } },
      },
    });

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: 'session expired' }),
      })
    );
  });

  test('returns missing poll error for none_work without id', async () => {
    editOriginalInteractionResponseMock.mockResolvedValueOnce({ ok: true });

    await worker.processDiscordInteraction.run({
      data: {
        id: 'interaction2g',
        applicationId: appIdValue,
        token: 'token',
        type: 3,
        data: { custom_id: 'none_work:' },
        member: { user: { id: 'discord1' } },
      },
    });

    expect(editOriginalInteractionResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ content: 'missing poll' }),
      })
    );
  });

  test('handles errors and responds with generic error', async () => {
    editOriginalInteractionResponseMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true });

    await worker.processDiscordInteraction.run({
      data: {
        id: 'interaction3',
        applicationId: appIdValue,
        token: 'token',
        type: 3,
        data: { custom_id: 'unknown' },
      },
    });

    expect(loggerMock.error).toHaveBeenCalledWith(
      'Discord worker error',
      expect.objectContaining({ interactionId: 'interaction3' })
    );
    expect(editOriginalInteractionResponseMock).toHaveBeenCalledTimes(2);
  });
});
