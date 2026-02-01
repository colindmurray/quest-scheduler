import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let worker;
let editOriginalInteractionResponseMock;
let linkGetMock;
let userGetMock;
let groupGetMock;
let authGetUserMock;
let txGetMock;
let txSetMock;
let interactionSetMock;
let interactionDeleteMock;

describe('discord worker data helpers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    editOriginalInteractionResponseMock = vi.fn();
    linkGetMock = vi.fn();
    userGetMock = vi.fn();
    groupGetMock = vi.fn();
    authGetUserMock = vi.fn();
    txGetMock = vi.fn();
    txSetMock = vi.fn();
    interactionSetMock = vi.fn();
    interactionDeleteMock = vi.fn(() => Promise.resolve());

    const db = {
      runTransaction: async (fn) => {
        await fn({ get: txGetMock, set: txSetMock });
      },
      collection: (name) => {
        if (name === 'discordInteractionIds') {
          return { doc: () => ({ set: interactionSetMock, delete: interactionDeleteMock }) };
        }
        if (name === 'discordUserLinks') {
          return { doc: () => ({ get: linkGetMock }) };
        }
        if (name === 'users') {
          return { doc: () => ({ get: userGetMock }) };
        }
        if (name === 'questingGroups') {
          return { doc: () => ({ get: groupGetMock }) };
        }
        return { doc: () => ({}) };
      },
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => db,
      auth: () => ({ getUser: authGetUserMock }),
    };
    adminMock.firestore.FieldValue = { serverTimestamp: vi.fn(() => 'server-time') };
    adminMock.firestore.Timestamp = { fromDate: vi.fn(() => ({ toDate: () => new Date() })) };

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
          notParticipant: 'not participant',
          notInvited: 'not invited',
          pendingInvite: 'pending invite',
          groupMissing: 'group missing',
          notGroupMember: 'not group member',
          pollFinalized: 'poll closed',
        },
        buildUserNotLinkedMessage: vi.fn(),
      },
    };
    require.cache[require.resolve('./discord-client')] = {
      exports: {
        editOriginalInteractionResponse: (...args) => editOriginalInteractionResponseMock(...args),
        fetchChannel: vi.fn(),
      },
    };

    worker = await import('./worker');
  });

  test('acquireInteractionLock returns true when lock is free', async () => {
    txGetMock.mockResolvedValueOnce({ exists: false });
    const result = await worker.__test__.acquireInteractionLock('i1');
    expect(result).toBe(true);
    expect(txSetMock).toHaveBeenCalled();
  });

  test('acquireInteractionLock returns false when already exists', async () => {
    txGetMock.mockResolvedValueOnce({ exists: true });
    const result = await worker.__test__.acquireInteractionLock('i1');
    expect(result).toBe(false);
  });

  test('markInteractionDone writes status', async () => {
    await worker.__test__.markInteractionDone('i1');
    expect(interactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done', completedAt: 'server-time' }),
      { merge: true }
    );
  });

  test('releaseInteractionLock deletes doc', async () => {
    await worker.__test__.releaseInteractionLock('i1');
    expect(interactionDeleteMock).toHaveBeenCalled();
  });

  test('respondWithMessage returns null without token', async () => {
    const result = await worker.__test__.respondWithMessage({ id: 'i1' }, { content: 'hi' });
    expect(result).toBeNull();
  });

  test('respondWithMessage sends response when valid', async () => {
    editOriginalInteractionResponseMock.mockResolvedValueOnce({ ok: true });
    const result = await worker.__test__.respondWithMessage(
      { id: 'i1', token: 'tok', applicationId: 'app', receivedAt: Date.now() },
      { content: 'hi' }
    );
    expect(editOriginalInteractionResponseMock).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  test('getLinkedUser returns user data', async () => {
    linkGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ qsUserId: 'user1' }),
    });
    userGetMock.mockResolvedValueOnce({ exists: true, data: () => ({ email: 'user@example.com' }) });

    const result = await worker.__test__.getLinkedUser('discord1');
    expect(result).toEqual({ uid: 'user1', email: 'user@example.com' });
  });

  test('getLinkedUser falls back to auth lookup', async () => {
    linkGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ qsUserId: 'user1' }),
    });
    userGetMock.mockResolvedValueOnce({ exists: false });
    authGetUserMock.mockResolvedValueOnce({ email: 'auth@example.com', photoURL: 'photo' });

    const result = await worker.__test__.getLinkedUser('discord1');
    expect(result).toEqual({ uid: 'user1', email: 'auth@example.com', photoURL: 'photo' });
  });

  test('getParticipationDecision respects group membership', async () => {
    groupGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ memberIds: ['user2'] }),
    });
    const result = await worker.__test__.getParticipationDecision(
      { questingGroupId: 'group1', participantIds: [] },
      { uid: 'user2' }
    );
    expect(result).toEqual({ allowed: true });
  });
});
