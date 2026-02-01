import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const functionsMocks = {
  getFunctions: vi.fn(() => ({ name: 'functions' })),
  httpsCallable: vi.fn(),
};

vi.mock('firebase/functions', () => functionsMocks);

let notifications;

beforeAll(async () => {
  notifications = await import('./notification-events');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('emitNotificationEvent', () => {
  test('calls callable and returns data', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { eventId: 'event1' } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const payload = { eventType: 'POLL_INVITE_SENT', actor: { uid: 'user1' } };
    const result = await notifications.emitNotificationEvent(payload);

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'emitNotificationEvent'
    );
    expect(callable).toHaveBeenCalledWith(payload);
    expect(result).toEqual({ eventId: 'event1' });
  });
});

describe('buildNotificationActor', () => {
  test('normalizes email and prefers displayName', () => {
    const actor = notifications.buildNotificationActor({
      uid: 'user1',
      email: 'TEST@EXAMPLE.COM',
      displayName: 'Test User',
    });

    expect(actor).toEqual({
      uid: 'user1',
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });
});

describe('emitPollEvent', () => {
  test('wraps poll resource and payload', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { eventId: 'event2' } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await notifications.emitPollEvent({
      eventType: 'POLL_FINALIZED',
      schedulerId: 'poll1',
      pollTitle: 'Poll Title',
      actor: { uid: 'user1' },
      payload: { winningDate: 'Jan 1, 2026' },
      recipients: { userIds: ['user2'] },
      dedupeKey: 'poll:poll1:finalized',
    });

    expect(callable).toHaveBeenCalledWith({
      eventType: 'POLL_FINALIZED',
      resource: { type: 'poll', id: 'poll1', title: 'Poll Title' },
      actor: { uid: 'user1' },
      payload: { pollTitle: 'Poll Title', winningDate: 'Jan 1, 2026' },
      recipients: { userIds: ['user2'] },
      dedupeKey: 'poll:poll1:finalized',
    });
    expect(result).toEqual({ eventId: 'event2' });
  });
});

describe('reconcilePendingNotifications', () => {
  test('calls callable and returns data', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { processed: 2 } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await notifications.reconcilePendingNotifications();

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'reconcilePendingNotifications'
    );
    expect(callable).toHaveBeenCalledWith();
    expect(result).toEqual({ processed: 2 });
  });
});
