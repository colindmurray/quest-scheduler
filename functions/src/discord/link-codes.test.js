const { describe, expect, test, beforeEach, vi } = require('vitest');

const generateLinkCode = vi.fn(() => 'CODE123');
const hashLinkCode = vi.fn(() => 'HASHED');

vi.mock('./link-utils', () => ({
  generateLinkCode,
  hashLinkCode,
}));

vi.mock('./config', () => ({
  DISCORD_REGION: 'us-central1',
}));

let groupSnap = { exists: true, data: () => ({ creatorId: 'user1', memberManaged: false }) };

const linkCodeSet = vi.fn();
const groupGet = vi.fn(async () => groupSnap);

const collectionMock = vi.fn((name) => {
  if (name === 'questingGroups') {
    return { doc: () => ({ get: groupGet }) };
  }
  if (name === 'discordLinkCodes') {
    return { doc: () => ({ set: linkCodeSet }) };
  }
  if (name === 'discordLinkCodeRateLimits') {
    return { doc: () => ({}) };
  }
  return { doc: () => ({}) };
});

const runTransaction = vi.fn(async (fn) => {
  const tx = {
    get: vi.fn(async () => ({ exists: false })),
    set: vi.fn(),
  };
  await fn(tx);
});

const firestoreDb = {
  collection: collectionMock,
  runTransaction,
};

const firestoreNamespace = Object.assign(() => firestoreDb, {
  Timestamp: {
    now: vi.fn(() => ({
      toMillis: () => Date.now(),
      toDate: () => new Date(),
    })),
    fromDate: vi.fn((date) => ({ toDate: () => date })),
  },
  FieldValue: {
    serverTimestamp: vi.fn(() => 'server-time'),
  },
});

const adminMock = {
  apps: [],
  initializeApp: vi.fn(),
  firestore: firestoreNamespace,
};

vi.mock('firebase-admin', () => adminMock);

const linkCodes = require('./link-codes');

describe('discord link codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    groupSnap = { exists: true, data: () => ({ creatorId: 'user1', memberManaged: false }) };
  });

  test('requires authentication', async () => {
    await expect(
      linkCodes.discordGenerateLinkCode.run({ data: { groupId: 'g1' }, auth: null })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  test('requires groupId', async () => {
    await expect(
      linkCodes.discordGenerateLinkCode.run({ data: {}, auth: { uid: 'user1' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('errors when group missing', async () => {
    groupSnap = { exists: false };
    await expect(
      linkCodes.discordGenerateLinkCode.run({ data: { groupId: 'g1' }, auth: { uid: 'user1' } })
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  test('errors when user lacks permissions', async () => {
    groupSnap = {
      exists: true,
      data: () => ({ creatorId: 'other', memberManaged: false, memberIds: [] }),
    };
    await expect(
      linkCodes.discordGenerateLinkCode.run({ data: { groupId: 'g1' }, auth: { uid: 'user1' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('generates link code for creator', async () => {
    const result = await linkCodes.discordGenerateLinkCode.run({
      data: { groupId: 'g1' },
      auth: { uid: 'user1' },
    });

    expect(runTransaction).toHaveBeenCalled();
    expect(linkCodeSet).toHaveBeenCalledWith(
      expect.objectContaining({
        codeHash: 'HASHED',
        groupId: 'g1',
        uid: 'user1',
      })
    );
    expect(result).toEqual({
      code: 'CODE123',
      expiresAt: expect.any(String),
    });
  });
});
