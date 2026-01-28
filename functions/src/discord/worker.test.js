const { describe, expect, test, beforeEach, vi } = require('vitest');

const logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

vi.mock('firebase-functions', () => ({ logger }));
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
vi.mock('firebase-admin', () => adminMock);

vi.mock('./config', () => ({
  DISCORD_APPLICATION_ID: { value: () => 'app123' },
  DISCORD_BOT_TOKEN: { value: () => 'token' },
  DISCORD_REGION: 'us-central1',
  APP_URL: 'https://app.example.com',
}));

vi.mock('./discord-client', () => ({
  editOriginalInteractionResponse: vi.fn(),
  fetchChannel: vi.fn(),
}));

vi.mock('./link-utils', () => ({
  hashLinkCode: vi.fn(() => 'hash'),
}));

vi.mock('./error-messages', () => ({
  ERROR_MESSAGES: { missingPollId: 'missing poll' },
  buildUserNotLinkedMessage: vi.fn(() => 'not linked'),
}));

const worker = require('./worker');

describe('discord worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('logs error when interaction payload missing', async () => {
    await worker.processDiscordInteraction.run({ data: null });

    expect(logger.error).toHaveBeenCalledWith('Missing interaction payload');
  });

  test('logs warning when applicationId mismatches', async () => {
    await worker.processDiscordInteraction.run({
      data: { id: 'interaction1', applicationId: 'wrong-app' },
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Discarding interaction with mismatched application ID',
      { interactionId: 'interaction1' }
    );
  });
});
