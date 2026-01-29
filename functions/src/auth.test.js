import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

const getUserByEmailMock = vi.fn();
const mailAddMock = vi.fn();
const userSetMock = vi.fn();
const publicSetMock = vi.fn();
const batchUpdateMock = vi.fn();
const batchCommitMock = vi.fn();

const friendRequestDocs = [
  { data: () => ({ toUserId: null }), ref: { id: 'req1' } },
  { data: () => ({ toUserId: 'existing' }), ref: { id: 'req2' } },
];

const friendRequestsQuery = {
  where: vi.fn(function () {
    return this;
  }),
  get: vi.fn(async () => ({ empty: false, docs: friendRequestDocs })),
};

let sendPasswordResetInfo;
let onUserCreate;

describe('auth functions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    getUserByEmailMock.mockResolvedValue({ providerData: [{ providerId: 'google.com' }] });
    friendRequestsQuery.where.mockClear();
    friendRequestsQuery.get.mockResolvedValue({ empty: false, docs: friendRequestDocs });

    const collectionMock = vi.fn((name) => {
      if (name === 'mail') return { add: mailAddMock };
      if (name === 'users') return { doc: () => ({ set: userSetMock }) };
      if (name === 'usersPublic') return { doc: () => ({ set: publicSetMock }) };
      if (name === 'friendRequests') return friendRequestsQuery;
      return { doc: () => ({}) };
    });

    const firestoreDb = {
      collection: collectionMock,
      batch: () => ({
        update: batchUpdateMock,
        commit: batchCommitMock,
      }),
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      auth: () => ({ getUserByEmail: getUserByEmailMock }),
      firestore: () => firestoreDb,
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-admin/firestore')] = {
      exports: { FieldValue: { serverTimestamp: vi.fn(() => 'server-time') } },
    };
    require.cache[require.resolve('firebase-functions/v1')] = {
      exports: (() => {
        class HttpsError extends Error {
          constructor(code, message) {
            super(message);
            this.code = code;
          }
        }
        return {
          https: {
            HttpsError,
            onCall: (handler) => {
              const fn = (data, context) => handler(data, context);
              fn.run = handler;
              return fn;
            },
          },
          auth: {
            user: () => ({
              onCreate: (handler) => {
                const fn = (user) => handler(user);
                fn.run = handler;
                return fn;
              },
            }),
          },
        };
      })(),
    };

    const authModule = await import('./auth');
    sendPasswordResetInfo = authModule.sendPasswordResetInfo;
    onUserCreate = authModule.onUserCreate;
  });

  test('sendPasswordResetInfo requires email', async () => {
    await expect(sendPasswordResetInfo.run({ email: '' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  test('sendPasswordResetInfo emails google-only users', async () => {
    const result = await sendPasswordResetInfo.run({ email: 'User@Example.com' });

    expect(result).toEqual({ success: true });
    expect(getUserByEmailMock).toHaveBeenCalledWith('user@example.com');
    expect(mailAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        message: expect.objectContaining({ subject: expect.stringContaining('Password Reset') }),
      })
    );
  });

  test('sendPasswordResetInfo skips email for password users', async () => {
    getUserByEmailMock.mockResolvedValue({
      providerData: [{ providerId: 'password' }],
    });

    const result = await sendPasswordResetInfo.run({ email: 'test@example.com' });

    expect(result).toEqual({ success: true });
    expect(mailAddMock).not.toHaveBeenCalled();
  });

  test('sendPasswordResetInfo ignores missing users', async () => {
    getUserByEmailMock.mockRejectedValue({ code: 'auth/user-not-found' });

    const result = await sendPasswordResetInfo.run({ email: 'missing@example.com' });

    expect(result).toEqual({ success: true });
    expect(mailAddMock).not.toHaveBeenCalled();
  });

  test('onUserCreate writes user and public docs and backfills requests', async () => {
    const user = {
      uid: 'user1',
      email: 'User@Example.com',
      displayName: 'Hero',
      photoURL: 'https://example.com/avatar.png',
    };

    await onUserCreate.run(user);

    expect(userSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        displayName: 'Hero',
        photoURL: 'https://example.com/avatar.png',
        publicIdentifierType: 'email',
        createdAt: 'server-time',
        updatedAt: 'server-time',
      }),
      { merge: true }
    );
    expect(publicSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        displayName: 'Hero',
        publicIdentifierType: 'email',
        publicIdentifier: 'user@example.com',
        updatedAt: 'server-time',
      }),
      { merge: true }
    );
    expect(batchUpdateMock).toHaveBeenCalledWith(friendRequestDocs[0].ref, {
      toUserId: 'user1',
    });
    expect(batchCommitMock).toHaveBeenCalled();
  });
});
