const { describe, expect, test, beforeEach, vi } = require('vitest');

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

vi.mock('./config', () => ({
  DISCORD_REGION: 'us-central1',
  DISCORD_BOT_TOKEN: { value: () => 'token' },
  APP_URL: 'https://app.example.com',
}));

vi.mock('./discord-client', () => ({
  createChannelMessage: vi.fn(),
}));

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

vi.mock('firebase-admin', () => adminMock);

const nudge = require('./nudge');

describe('discord nudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
