import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let writeEvent;
let collectionMock;
let docMock;
let setMock;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();

  setMock = vi.fn().mockResolvedValue(undefined);
  docMock = vi.fn(() => ({ id: 'evt-1', set: setMock }));
  collectionMock = vi.fn(() => ({ doc: docMock }));

  const firestoreMock = () => ({ collection: collectionMock });
  firestoreMock.Timestamp = { fromDate: vi.fn(() => 'expires-at') };

  const require = createRequire(import.meta.url);
  require.cache[require.resolve('firebase-admin/firestore')] = {
    exports: {
      FieldValue: { serverTimestamp: vi.fn(() => 'server-time') },
      Timestamp: { fromDate: vi.fn(() => 'expires-at') },
    },
  };

  writeEvent = await import('./write-event');
});

describe('write-event helpers', () => {
  test('buildNotificationEventDocument resolves aliases and defaults source', () => {
    const doc = writeEvent.buildNotificationEventDocument({
      eventType: 'SESSION_INVITE',
      resource: { type: 'poll', id: 'poll-1' },
      actor: { uid: 'user-1' },
      createdBy: 'user-1',
    });

    expect(doc).toEqual(
      expect.objectContaining({
        eventType: 'POLL_INVITE_SENT',
        status: 'queued',
        source: 'web',
        createdBy: 'user-1',
        createdAt: 'server-time',
        expiresAt: 'expires-at',
      })
    );
  });

  test('queueNotificationEvent writes notificationEvents doc and returns id/type', async () => {
    const result = await writeEvent.queueNotificationEvent({
      db: { collection: collectionMock },
      eventType: 'BASIC_POLL_CREATED',
      resource: { type: 'basicPoll', id: 'poll-1' },
      actor: { uid: 'user-1' },
      payload: { basicPollTitle: 'Snack vote' },
      createdBy: 'user-1',
      source: 'server',
    });

    expect(result).toEqual({ eventId: 'evt-1', eventType: 'BASIC_POLL_CREATED' });
    expect(collectionMock).toHaveBeenCalledWith('notificationEvents');
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BASIC_POLL_CREATED',
        source: 'server',
      })
    );
  });
});
