import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let emitNotificationEvent;
let setMock;
let docMock;
let collectionMock;

const buildContext = (uid = 'user1') => ({
  auth: {
    uid,
    token: {
      email: 'user@example.com',
    },
  },
});

describe('emitNotificationEvent', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    setMock = vi.fn();
    docMock = vi.fn(() => ({ id: 'event123', set: setMock }));
    collectionMock = vi.fn(() => ({ doc: docMock }));

    const firestoreMock = () => ({ collection: collectionMock });
    firestoreMock.Timestamp = { fromDate: vi.fn(() => 'expires-at') };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: firestoreMock,
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

    const module = await import('./emit');
    emitNotificationEvent = module.emitNotificationEvent;
  });

  test('rejects unauthenticated calls', async () => {
    await expect(emitNotificationEvent.run({}, {})).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  test('rejects when actor uid mismatches auth', async () => {
    const context = buildContext('user1');

    await expect(
      emitNotificationEvent.run(
        {
          eventType: 'POLL_INVITE_SENT',
          actor: { uid: 'user2' },
          resource: { type: 'poll', id: 'poll1' },
        },
        context
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('rejects unsupported event types', async () => {
    const context = buildContext('user1');

    await expect(
      emitNotificationEvent.run(
        {
          eventType: 'UNKNOWN_EVENT',
          actor: { uid: 'user1' },
          resource: { type: 'poll', id: 'poll1' },
        },
        context
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('writes queued event with resolved event type', async () => {
    const context = buildContext('user1');

    const result = await emitNotificationEvent.run(
      {
        eventType: 'SESSION_INVITE',
        actor: { uid: 'user1', email: 'user@example.com' },
        resource: { type: 'poll', id: 'poll1', title: 'Test Poll' },
        payload: { pollTitle: 'Test Poll' },
      },
      context
    );

    expect(result).toEqual({ eventId: 'event123', eventType: 'POLL_INVITE_SENT' });
    expect(collectionMock).toHaveBeenCalledWith('notificationEvents');
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'POLL_INVITE_SENT',
        status: 'queued',
        createdBy: 'user1',
        source: 'web',
        expiresAt: expect.anything(),
      })
    );
  });
});
