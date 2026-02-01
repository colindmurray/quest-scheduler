import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let processNotificationEvent;
let notificationSetMock;
let notificationDocMock;
let mailAddMock;
let eventUpdateMock;
let collectionMock;
let userDocsById;
let sendDiscordNotificationMock;

const buildEvent = (data) => ({
  params: { eventId: 'event1' },
  data: { data: () => data },
});

describe('notification router', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    notificationSetMock = vi.fn();
    mailAddMock = vi.fn();
    eventUpdateMock = vi.fn();
    userDocsById = {};
    sendDiscordNotificationMock = vi.fn(async () => ({ success: true }));

    notificationDocMock = vi.fn(() => ({ set: notificationSetMock }));
    const notificationsCollection = { doc: notificationDocMock };
    const usersCollection = {
      doc: vi.fn((id) => ({
        collection: vi.fn((name) => (name === 'notifications' ? notificationsCollection : null)),
        get: vi.fn(async () => ({
          exists: true,
          data: () => userDocsById[id] || {},
        })),
      })),
    };
    const notificationEventsCollection = {
      doc: vi.fn(() => ({ update: eventUpdateMock })),
    };
    const mailCollection = { add: mailAddMock };

    collectionMock = vi.fn((name) => {
      if (name === 'users') return usersCollection;
      if (name === 'notificationEvents') return notificationEventsCollection;
      if (name === 'mail') return mailCollection;
      return { doc: vi.fn() };
    });

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => ({ collection: collectionMock }),
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-admin/firestore')] = {
      exports: { FieldValue: { serverTimestamp: vi.fn(() => 'server-time') } },
    };
    require.cache[require.resolve('firebase-functions/v2/firestore')] = {
      exports: {
        onDocumentCreated: (opts, handler) => {
          const fn = (event) => handler(event);
          fn.run = handler;
          return fn;
        },
      },
    };
    require.cache[require.resolve('firebase-functions')] = {
      exports: {
        logger: {
          warn: vi.fn(),
        },
      },
    };
    require.cache[require.resolve('./auto-clear')] = {
      exports: { applyAutoClear: vi.fn() },
    };
    require.cache[require.resolve('./discord')] = {
      exports: { sendDiscordNotification: (...args) => sendDiscordNotificationMock(...args) },
    };

    const module = await import('./router');
    processNotificationEvent = module.processNotificationEvent;
  });

  test('writes in-app and email notifications for poll invite', async () => {
    const data = {
      eventType: 'POLL_INVITE_SENT',
      resource: { type: 'poll', id: 'poll1', title: 'Poll Title' },
      actor: { uid: 'inviter', email: 'inviter@example.com', displayName: 'Inviter' },
      payload: { pollTitle: 'Poll Title' },
      recipients: { userIds: ['user1'], emails: ['invitee@example.com'] },
    };
    userDocsById.user1 = {
      email: 'invitee@example.com',
      settings: { emailNotifications: true },
    };

    await processNotificationEvent.run(buildEvent(data));

    expect(notificationSetMock).toHaveBeenCalledTimes(1);
    expect(mailAddMock).toHaveBeenCalledTimes(1);
    expect(eventUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing', eventType: 'POLL_INVITE_SENT' })
    );
    expect(eventUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'processed' }));
  });

  test('skips in-app when no user recipients are provided', async () => {
    const data = {
      eventType: 'POLL_INVITE_SENT',
      resource: { type: 'poll', id: 'poll1', title: 'Poll Title' },
      actor: { uid: 'inviter', email: 'inviter@example.com', displayName: 'Inviter' },
      payload: { pollTitle: 'Poll Title' },
      recipients: { userIds: [], emails: ['invitee@example.com'] },
    };

    await processNotificationEvent.run(buildEvent(data));

    expect(notificationSetMock).not.toHaveBeenCalled();
    expect(mailAddMock).toHaveBeenCalledTimes(1);
    expect(eventUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'processed' }));
  });

  test('respects simple email toggle for user recipients', async () => {
    const data = {
      eventType: 'POLL_INVITE_SENT',
      resource: { type: 'poll', id: 'poll1', title: 'Poll Title' },
      actor: { uid: 'inviter', email: 'inviter@example.com', displayName: 'Inviter' },
      payload: { pollTitle: 'Poll Title' },
      recipients: { userIds: ['user1'], emails: [] },
    };
    userDocsById.user1 = {
      email: 'user1@example.com',
      settings: { emailNotifications: false },
    };

    await processNotificationEvent.run(buildEvent(data));

    expect(notificationSetMock).toHaveBeenCalledTimes(1);
    expect(mailAddMock).not.toHaveBeenCalled();
  });

  test('respects advanced muted preferences for user recipients', async () => {
    const data = {
      eventType: 'POLL_INVITE_SENT',
      resource: { type: 'poll', id: 'poll1', title: 'Poll Title' },
      actor: { uid: 'inviter', email: 'inviter@example.com', displayName: 'Inviter' },
      payload: { pollTitle: 'Poll Title' },
      recipients: { userIds: ['user1'], emails: [] },
    };
    userDocsById.user1 = {
      email: 'user1@example.com',
      settings: {
        notificationMode: 'advanced',
        notificationPreferences: {
          POLL_INVITE_SENT: 'muted',
        },
      },
    };

    await processNotificationEvent.run(buildEvent(data));

    expect(notificationSetMock).not.toHaveBeenCalled();
    expect(mailAddMock).not.toHaveBeenCalled();
  });

  test('marks unsupported event types as failed', async () => {
    const data = { eventType: 'UNKNOWN_EVENT' };

    await processNotificationEvent.run(buildEvent(data));

    expect(eventUpdateMock).toHaveBeenCalledWith({
      status: 'failed',
      error: { message: 'Unsupported eventType' },
    });
  });

  test('uses dedupe doc id when dedupeKey is provided', async () => {
    const data = {
      eventType: 'POLL_INVITE_SENT',
      resource: { type: 'poll', id: 'poll1', title: 'Poll Title' },
      actor: { uid: 'inviter', email: 'inviter@example.com' },
      recipients: { userIds: ['user1'] },
      dedupeKey: 'poll:poll1:invite:user1',
    };

    await processNotificationEvent.run(buildEvent(data));

    expect(notificationDocMock).toHaveBeenCalledWith('dedupe:poll:poll1:invite:user1');
  });

  test('marks discord failures as partial', async () => {
    sendDiscordNotificationMock.mockResolvedValueOnce({
      success: false,
      error: 'Discord failed',
    });
    const data = {
      eventType: 'POLL_INVITE_SENT',
      resource: { type: 'poll', id: 'poll1', title: 'Poll Title' },
      actor: { uid: 'inviter', email: 'inviter@example.com', displayName: 'Inviter' },
      payload: { pollTitle: 'Poll Title' },
      recipients: { userIds: ['user1'], emails: [] },
    };
    userDocsById.user1 = {
      email: 'user1@example.com',
      settings: { emailNotifications: false },
    };

    await processNotificationEvent.run(buildEvent(data));

    expect(eventUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'partial',
        error: expect.objectContaining({ discord: 'Discord failed' }),
      })
    );
  });
});
