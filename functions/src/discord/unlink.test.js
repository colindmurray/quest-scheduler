import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

const authGetUserMock = vi.fn();
const userGetMock = vi.fn();
const batchSetMock = vi.fn();
const batchDeleteMock = vi.fn();
const batchCommitMock = vi.fn();

const userDocRef = { get: userGetMock };
const publicDocRef = {};
const secretsDocRef = {};
const discordLinkDocRef = {};

let discordUnlink;

describe('discord unlink', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    authGetUserMock.mockResolvedValue({ providerData: [] });
    userGetMock.mockResolvedValue({ exists: true, data: () => ({}) });

    const collectionMock = vi.fn((name) => {
      if (name === 'users') return { doc: () => userDocRef };
      if (name === 'usersPublic') return { doc: () => publicDocRef };
      if (name === 'userSecrets') return { doc: () => secretsDocRef };
      if (name === 'discordUserLinks') return { doc: () => discordLinkDocRef };
      return { doc: () => ({}) };
    });

    const batchMock = {
      set: batchSetMock,
      delete: batchDeleteMock,
      commit: batchCommitMock,
    };

    const firestoreDb = {
      collection: collectionMock,
      batch: () => batchMock,
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      auth: () => ({ getUser: authGetUserMock }),
      firestore: () => firestoreDb,
    };
    adminMock.firestore.FieldValue = {
      delete: vi.fn(() => 'delete'),
      serverTimestamp: vi.fn(() => 'server-time'),
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-functions/v2/https')] = {
      exports: {
        onCall: (opts, handler) => {
          const fn = (req) => handler(req);
          fn.run = handler;
          return fn;
        },
        HttpsError: class HttpsError extends Error {
          constructor(code, message) {
            super(message);
            this.code = code;
          }
        },
      },
    };
    require.cache[require.resolve('./config')] = {
      exports: {
        DISCORD_REGION: 'us-central1',
        DISCORD_NOTIFICATION_DEFAULTS: {
          finalizationEvents: true,
          slotChanges: true,
          voteSubmitted: false,
        },
      },
    };

    const unlinkModule = await import('./unlink');
    discordUnlink = unlinkModule.discordUnlink;
  });

  test('requires auth', async () => {
    await expect(discordUnlink.run({ auth: null })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  test('rejects when no alternate provider exists', async () => {
    authGetUserMock.mockResolvedValue({
      providerData: [{ providerId: 'discord.com' }],
    });

    await expect(
      discordUnlink.run({ auth: { uid: 'user1' } })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  test('clears discord fields and updates public identifier', async () => {
    authGetUserMock.mockResolvedValue({
      providerData: [{ providerId: 'google.com' }],
    });
    userGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        discord: { userId: '123' },
        qsUsername: 'hero',
        email: 'hero@example.com',
        publicIdentifierType: 'discordUsername',
      }),
    });

    const result = await discordUnlink.run({ auth: { uid: 'user1' } });

    expect(result).toEqual({ unlinked: true });
    expect(batchSetMock).toHaveBeenCalledWith(
      userDocRef,
      expect.objectContaining({
        discord: 'delete',
        publicIdentifierType: 'qsUsername',
        updatedAt: 'server-time',
      }),
      { merge: true }
    );
    expect(batchSetMock).toHaveBeenCalledWith(
      publicDocRef,
      expect.objectContaining({
        discordUsername: 'delete',
        discordUsernameLower: 'delete',
        publicIdentifierType: 'qsUsername',
        publicIdentifier: '@hero',
        updatedAt: 'server-time',
      }),
      { merge: true }
    );
    expect(batchDeleteMock).toHaveBeenCalledWith(discordLinkDocRef);
    expect(batchSetMock).toHaveBeenCalledWith(
      secretsDocRef,
      expect.objectContaining({ discord: 'delete' }),
      { merge: true }
    );
    expect(batchCommitMock).toHaveBeenCalled();
  });
});
