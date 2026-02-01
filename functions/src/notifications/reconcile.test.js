import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let reconcilePendingNotifications;
let reconcilePendingNotificationsForUser;
let notificationSetMock;
let batchDeleteMock;
let batchCommitMock;
let pendingDocs;

const buildContext = (uid = 'user1', email = 'user@example.com') => ({
  auth: {
    uid,
    token: { email },
  },
});

describe('pending notification reconciliation', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    notificationSetMock = vi.fn();
    batchDeleteMock = vi.fn();
    batchCommitMock = vi.fn();

    pendingDocs = [
      {
        data: () => ({
          eventType: 'POLL_INVITE_SENT',
          resource: { type: 'poll', id: 'poll1', title: 'Poll Title' },
          actor: { email: 'inviter@example.com' },
          payload: { pollTitle: 'Poll Title' },
        }),
        ref: { id: 'event1' },
      },
    ];

    const pendingEventsCollection = {
      get: vi.fn(async () => ({ empty: false, docs: pendingDocs })),
    };

    const pendingDocRef = {
      collection: vi.fn(() => pendingEventsCollection),
    };

    const notificationsCollection = {
      doc: vi.fn(() => ({ set: notificationSetMock })),
    };

    const usersCollection = {
      doc: vi.fn(() => ({
        collection: vi.fn((name) => (name === 'notifications' ? notificationsCollection : null)),
      })),
    };

    const batchMock = {
      delete: batchDeleteMock,
      commit: batchCommitMock,
    };

    const collectionMock = vi.fn((name) => {
      if (name === 'pendingNotifications') return { doc: vi.fn(() => pendingDocRef) };
      if (name === 'users') return usersCollection;
      return { doc: vi.fn() };
    });

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => ({
        collection: collectionMock,
        batch: () => batchMock,
      }),
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
        };
      })(),
    };

    const module = await import('./reconcile');
    reconcilePendingNotifications = module.reconcilePendingNotifications;
    reconcilePendingNotificationsForUser = module.reconcilePendingNotificationsForUser;
  });

  test('reconcilePendingNotificationsForUser creates notifications and deletes pending docs', async () => {
    const result = await reconcilePendingNotificationsForUser('user@example.com', 'user1');

    expect(notificationSetMock).toHaveBeenCalledTimes(1);
    expect(batchDeleteMock).toHaveBeenCalledWith(pendingDocs[0].ref);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ processed: 1 });
  });

  test('callable requires auth and email', async () => {
    await expect(reconcilePendingNotifications.run({}, {})).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    await expect(
      reconcilePendingNotifications.run({}, buildContext('user1', null))
    ).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
