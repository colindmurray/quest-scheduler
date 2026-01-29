import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let legacy;

let userPublicDocs = [];
let usersPublicDoc = null;
let qsUsernameDoc = null;
let usersPublicByIdDoc = null;
let friendRequestsSize = 0;
let userDocExists = false;
let userDocData = null;
let schedulerDocs = [];
let blockedLegacyExists = false;
let blockedByUidExists = false;
let blockedByDiscordExists = false;
let blockedByQsExists = false;
let blockedByEmailExists = false;
let txGetMock;
let txSetMock;
const userSetMock = vi.fn();

const buildFirestoreMock = () => {
  const blockedCollection = {
    doc: () => ({
      get: async () => ({ exists: blockedLegacyExists }),
    }),
    where: (field) => ({
      limit: () => ({
        get: async () => {
          let empty = true;
          if (field === 'blockedUserId') empty = !blockedByUidExists;
          if (field === 'discordUsernameLower') empty = !blockedByDiscordExists;
          if (field === 'qsUsernameLower') empty = !blockedByQsExists;
          if (field === 'email') empty = !blockedByEmailExists;
          return { empty };
        },
      }),
      get: async () => {
        let empty = true;
        if (field === 'blockedUserId') empty = !blockedByUidExists;
        if (field === 'discordUsernameLower') empty = !blockedByDiscordExists;
        if (field === 'qsUsernameLower') empty = !blockedByQsExists;
        if (field === 'email') empty = !blockedByEmailExists;
        return { empty };
      },
    }),
  };

  return {
    runTransaction: async (fn) => {
      await fn({ get: txGetMock, set: txSetMock });
    },
    collection: vi.fn((name) => {
      if (name === 'usersPublic') {
        const usersPublicQuery = {
          limit: () => ({
            get: async () => ({
              empty: userPublicDocs.length === 0,
              docs: userPublicDocs,
              forEach: (cb) => userPublicDocs.forEach(cb),
            }),
          }),
          get: async () => ({
            docs: userPublicDocs,
            forEach: (cb) => userPublicDocs.forEach(cb),
          }),
        };
        return {
          where: () => usersPublicQuery,
          doc: () => ({
            get: async () =>
              usersPublicByIdDoc
                ? { exists: true, data: () => usersPublicByIdDoc }
                : { exists: false },
          }),
        };
      }
      if (name === 'qsUsernames') {
        return {
          doc: () => ({
            get: async () =>
              qsUsernameDoc
                ? { exists: true, data: () => qsUsernameDoc }
                : { exists: false },
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: () => ({
            get: async () =>
              userDocExists ? { exists: true, data: () => userDocData } : { exists: false },
            set: userSetMock,
            collection: () => blockedCollection,
          }),
        };
      }
      if (name === 'friendRequests') {
        return {
          where: () => ({
            where: () => ({
              get: async () => ({ size: friendRequestsSize }),
            }),
          }),
        };
      }
      if (name === 'schedulers') {
        return {
          where: () => ({
            where: () => ({
              get: async () => ({ size: schedulerDocs.length }),
            }),
            get: async () => ({
              forEach: (cb) => schedulerDocs.forEach(cb),
            }),
          }),
        };
      }
      return { doc: () => ({ get: async () => ({ exists: false }) }) };
    }),
  };
};

describe('legacy helpers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    userPublicDocs = [];
    usersPublicDoc = null;
    qsUsernameDoc = null;
    usersPublicByIdDoc = null;
    friendRequestsSize = 0;
    userDocExists = false;
    userDocData = null;
    schedulerDocs = [];
    blockedLegacyExists = false;
    blockedByUidExists = false;
    blockedByDiscordExists = false;
    blockedByQsExists = false;
    blockedByEmailExists = false;
    txGetMock = vi.fn();
    txSetMock = vi.fn();

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => buildFirestoreMock(),
    };
    adminMock.firestore.FieldValue = {
      serverTimestamp: vi.fn(() => 'server-time'),
      delete: vi.fn(() => 'deleted'),
    };

    const functionsMock = {
      https: {
        HttpsError: class HttpsError extends Error {
          constructor(code, message) {
            super(message);
            this.code = code;
          }
        },
        onCall: (handler) => {
          const fn = (data, context) => handler(data, context);
          fn.run = handler;
          return fn;
        },
        onRequest: (handler) => {
          const fn = (req, res) => handler(req, res);
          fn.run = handler;
          return fn;
        },
      },
      runWith: () => functionsMock,
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-functions/v1')] = { exports: functionsMock };
    require.cache[require.resolve('firebase-functions/params')] = {
      exports: { defineJsonSecret: () => ({ value: () => ({}) }) },
    };

    legacy = await import('./legacy');
  });

  test('normalizes and encodes emails', () => {
    const { normalizeEmail, encodeEmailId } = legacy.__test__;
    expect(normalizeEmail(' User@Example.com ')).toBe('user@example.com');
    expect(encodeEmailId('User@Example.com')).toBe('user%40example.com');
  });

  test('parses identifiers', () => {
    const { parseIdentifier } = legacy.__test__;
    expect(parseIdentifier('@Hero')).toEqual({ type: 'qsUsername', value: 'hero' });
    expect(parseIdentifier('user@example.com').type).toBe('email');
    expect(parseIdentifier('123456789012345678').type).toBe('discordId');
    expect(parseIdentifier('name#1234').type).toBe('legacyDiscordTag');
    expect(parseIdentifier('discorduser').type).toBe('discordUsername');
  });

  test('validates usernames', () => {
    const { isDiscordUsername, isValidQsUsername } = legacy.__test__;
    expect(isDiscordUsername('good.name')).toBe(true);
    expect(isDiscordUsername('.bad')).toBe(false);
    expect(isValidQsUsername('hero_1')).toBe(true);
    expect(isValidQsUsername('admin')).toBe(false);
  });

  test('finds user id by email', async () => {
    userPublicDocs = [{ id: 'user1', data: () => ({ email: 'user@example.com' }) }];
    const { findUserIdByEmail } = legacy.__test__;
    await expect(findUserIdByEmail('USER@example.com')).resolves.toBe('user1');
  });

  test('finds user by discord username', async () => {
    userPublicDocs = [{ id: 'user1', data: () => ({ email: 'user@example.com' }) }];
    const { findUserByDiscordUsername } = legacy.__test__;
    const result = await findUserByDiscordUsername('tester');
    expect(result).toEqual({ uid: 'user1', email: 'user@example.com', data: { email: 'user@example.com' } });
  });

  test('finds user by qs username', async () => {
    qsUsernameDoc = { uid: 'user1' };
    usersPublicByIdDoc = { email: 'user@example.com' };
    const { findUserByQsUsername } = legacy.__test__;
    const result = await findUserByQsUsername('hero');
    expect(result).toEqual({ uid: 'user1', email: 'user@example.com', data: { email: 'user@example.com' } });
  });

  test('finds user ids by emails in chunks', async () => {
    userPublicDocs = [
      { id: 'user1', data: () => ({ email: 'user1@example.com' }) },
      { id: 'user2', data: () => ({ email: 'user2@example.com' }) },
    ];
    const { findUserIdsByEmails } = legacy.__test__;
    const result = await findUserIdsByEmails(['user1@example.com', 'user2@example.com']);
    expect(result).toEqual({
      'user1@example.com': 'user1',
      'user2@example.com': 'user2',
    });
  });

  test('ensures user status with default allowance', async () => {
    userDocExists = false;
    const { ensureUserStatus } = legacy.__test__;
    const result = await ensureUserStatus('user1');
    expect(result.data.inviteAllowance).toBe(50);
    expect(userSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteAllowance: 50,
        suspended: false,
      }),
      { merge: true }
    );
  });

  test('counts pending friend requests', async () => {
    friendRequestsSize = 3;
    const { countPendingFriendRequests } = legacy.__test__;
    const count = await countPendingFriendRequests('user1');
    expect(count).toBe(3);
  });

  test('counts pending poll invites across schedulers', async () => {
    schedulerDocs = [
      { data: () => ({ pendingInvites: ['a@example.com', 'b@example.com'] }) },
      { data: () => ({ pendingInvites: ['c@example.com'] }) },
    ];
    const { countPendingPollInvites } = legacy.__test__;
    const count = await countPendingPollInvites('user1');
    expect(count).toBe(3);
  });

  test('counts outstanding invites', async () => {
    friendRequestsSize = 2;
    schedulerDocs = [{ data: () => ({ pendingInvites: ['a@example.com'] }) }];
    const { countOutstandingInvites } = legacy.__test__;
    const count = await countOutstandingInvites('user1');
    expect(count).toBe(3);
  });

  test('detects blocked users from legacy email doc', async () => {
    blockedLegacyExists = true;
    const { isBlockedByUser } = legacy.__test__;
    const result = await isBlockedByUser('target', 'sender@example.com');
    expect(result).toBe(true);
  });

  test('detects blocked users by uid and email fallback', async () => {
    blockedByUidExists = true;
    const { isBlockedByUser } = legacy.__test__;
    const result = await isBlockedByUser('target', 'sender@example.com', 'sender-uid');
    expect(result).toBe(true);

    blockedByUidExists = false;
    blockedByEmailExists = true;
    const fallback = await isBlockedByUser('target', 'sender@example.com');
    expect(fallback).toBe(true);
  });

  test('adjusts invite allowance and suspension flags', async () => {
    txGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ inviteAllowance: 2, suspended: false }),
    });

    const { adjustInviteAllowance } = legacy.__test__;
    await adjustInviteAllowance('user1', -5);
    expect(txSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inviteAllowance: 0,
        suspended: true,
      }),
      { merge: true }
    );

    txGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ inviteAllowance: 0, suspended: true }),
    });
    await adjustInviteAllowance('user1', 5);
    expect(txSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inviteAllowance: 5,
        suspended: false,
      }),
      { merge: true }
    );
  });

  test('extracts oauth config', () => {
    const { extractOAuthConfig } = legacy.__test__;
    const config = extractOAuthConfig({
      web: {
        client_id: 'id',
        client_secret: 'secret',
        redirect_uris: ['https://example.com/googleCalendarOAuthCallback'],
      },
    });
    expect(config).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://example.com/googleCalendarOAuthCallback',
    });
  });

  test('encrypts and decrypts tokens', () => {
    const encKey = Buffer.alloc(32, 5).toString('base64');
    process.env.QS_ENC_KEY_B64 = encKey;
    const { encrypt, decrypt } = legacy.__test__;
    const payload = encrypt('secret');
    expect(decrypt(payload)).toBe('secret');
    delete process.env.QS_ENC_KEY_B64;
  });
});
