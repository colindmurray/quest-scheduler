import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('firebase-functions', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('firebase-functions/v2/tasks', () => ({
  onTaskDispatched: (opts, handler) => {
    const fn = (req) => handler(req);
    fn.run = handler;
    return fn;
  },
}));

const firestoreDb = { collection: vi.fn(() => ({ doc: vi.fn(() => ({}) ) })) };
const firestoreNamespace = Object.assign(() => firestoreDb, {
  FieldValue: { serverTimestamp: vi.fn(() => 'server-time') },
});
const adminMock = {
  apps: [],
  initializeApp: vi.fn(),
  firestore: firestoreNamespace,
};
let worker;

describe('discord worker', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('firebase-admin', () => ({ default: adminMock, ...adminMock }));
    vi.doMock('./config', () => ({
      DISCORD_APPLICATION_ID: { value: () => 'app123' },
      DISCORD_BOT_TOKEN: { value: () => 'token' },
      DISCORD_REGION: 'us-central1',
      APP_URL: 'https://app.example.com',
      default: {
        DISCORD_APPLICATION_ID: { value: () => 'app123' },
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        DISCORD_REGION: 'us-central1',
        APP_URL: 'https://app.example.com',
      },
    }));
    vi.doMock('./discord-client', () => ({
      editOriginalInteractionResponse: vi.fn(),
      fetchChannel: vi.fn(),
    }));
    vi.doMock('./link-utils', () => ({
      hashLinkCode: vi.fn(() => 'hash'),
    }));
    vi.doMock('./error-messages', () => ({
      ERROR_MESSAGES: { missingPollId: 'missing poll' },
      buildUserNotLinkedMessage: vi.fn(() => 'not linked'),
    }));
    worker = await import('./worker');
  });

  test('returns early when interaction payload missing', async () => {
    await expect(worker.processDiscordInteraction.run({ data: null })).resolves.toBeUndefined();
  });

  test('returns early when applicationId mismatches', async () => {
    await expect(
      worker.processDiscordInteraction.run({
        data: { id: 'interaction1', applicationId: 'wrong-app' },
      })
    ).resolves.toBeUndefined();
  });
});
