import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const functionsMock = {
  https: {
    HttpsError,
    functions: { https: { HttpsError } },
  },
  region: vi.fn(() => ({
    runWith: vi.fn(() => ({
      https: {
        onCall: (handler) => {
          const fn = (data, context) => handler(data, context);
          fn.run = handler;
          return fn;
        },
      },
    })),
  })),
};

vi.mock('firebase-functions/v1', () => functionsMock);

const collectionMock = vi.fn(() => ({
  doc: () => ({
    get: vi.fn(async () => ({ exists: false })),
  }),
}));

const firestoreDb = {
  collection: collectionMock,
};

const firestoreNamespace = Object.assign(() => firestoreDb, {
  FieldValue: { serverTimestamp: vi.fn(() => 'server-time') },
  FieldPath: { documentId: vi.fn() },
});

const adminMock = {
  apps: [],
  initializeApp: vi.fn(),
  firestore: firestoreNamespace,
};

let nudge;

describe('discord nudge', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('./config', () => ({
      DISCORD_REGION: 'us-central1',
      DISCORD_BOT_TOKEN: { value: () => 'token' },
      APP_URL: 'https://app.example.com',
      default: {
        DISCORD_REGION: 'us-central1',
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        APP_URL: 'https://app.example.com',
      },
    }));
    vi.doMock('./discord-client', () => ({
      createChannelMessage: vi.fn(),
    }));
    vi.doMock('firebase-admin', () => ({ default: adminMock, ...adminMock }));
    nudge = await import('./nudge');
  });

  test('returns not-found when poll is missing', async () => {
    await expect(
      nudge.nudgeDiscordParticipants.run(
        { schedulerId: 'sched1' },
        { auth: { uid: 'user1' } }
      )
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
