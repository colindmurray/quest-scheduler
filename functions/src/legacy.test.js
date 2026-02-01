import { beforeEach, describe, expect, test, vi } from 'vitest';

const adminMock = {
  apps: [],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({ collection: vi.fn() })),
};
adminMock.firestore.Timestamp = { fromDate: vi.fn(() => 'expires-at') };

vi.mock('firebase-admin', () => ({ default: adminMock, ...adminMock }));

import * as legacy from './legacy';

describe('legacy callables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('registerQsUsername requires auth', async () => {
    await expect(legacy.registerQsUsername.run({}, { auth: null })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  test('registerQsUsername rejects invalid username', async () => {
    await expect(
      legacy.registerQsUsername.run(
        { username: '!!' },
        { auth: { uid: 'user1', token: { email: 'user@example.com' } } }
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('sendFriendRequest requires auth', async () => {
    await expect(legacy.sendFriendRequest.run({}, { auth: null })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  test('sendFriendRequest requires target email', async () => {
    await expect(
      legacy.sendFriendRequest.run(
        { toEmail: '' },
        { auth: { uid: 'user1', token: { email: 'user@example.com' } } }
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('sendPollInvites requires scheduler id', async () => {
    await expect(
      legacy.sendPollInvites.run(
        { schedulerId: '' },
        { auth: { uid: 'user1', token: { email: 'user@example.com' } } }
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
