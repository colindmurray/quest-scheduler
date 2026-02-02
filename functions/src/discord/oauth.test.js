import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

let oauth;
let lastDocId = null;
const originalEnv = { ...process.env };

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
};

const setMock = vi.fn();
const docMock = vi.fn((id) => {
  lastDocId = id;
  return { set: setMock };
});
const collectionMock = vi.fn(() => ({ doc: docMock }));

const firestoreDb = {
  collection: collectionMock,
};

const firestoreNamespace = {
  Timestamp: {
    fromDate: vi.fn((date) => ({ toDate: () => date })),
  },
  FieldValue: {
    serverTimestamp: vi.fn(() => 'server-time'),
  },
};

describe('discord oauth functions', () => {
  beforeAll(async () => {
    const discordClientId = process.env.DISCORD_CLIENT_ID || 'test-client-id';
    const discordClientSecret =
      process.env.DISCORD_CLIENT_SECRET || 'test-client-secret';
    const adminModule = await import('firebase-admin');
    const admin = adminModule.default || adminModule;
    vi.spyOn(admin, 'initializeApp').mockImplementation(() => ({}));
    vi.spyOn(admin, 'apps', 'get').mockReturnValue([]);
    vi.spyOn(admin, 'firestore').mockReturnValue(firestoreDb);
    admin.firestore.Timestamp = firestoreNamespace.Timestamp;
    admin.firestore.FieldValue = firestoreNamespace.FieldValue;

    const configModule = await import('./config');
    const config = configModule.default || configModule;
    config.DISCORD_REGION = 'us-central1';
    vi.spyOn(config.DISCORD_CLIENT_ID, 'value').mockReturnValue(discordClientId);
    vi.spyOn(config.DISCORD_CLIENT_SECRET, 'value').mockReturnValue(
      discordClientSecret
    );
    config.APP_URL = 'https://app.example.com';

    oauth = await import('./oauth');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    lastDocId = null;
    resetEnv();
  });

  test('discordOAuthStart requires auth', async () => {
    await expect(oauth.discordOAuthStart.run({ auth: null })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  test('discordOAuthStart stores state and returns authUrl', async () => {
    const result = await oauth.discordOAuthStart.run({ auth: { uid: 'user1' } });

    expect(collectionMock).toHaveBeenCalledWith('oauthStates');
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'user1',
        provider: 'discord',
        intent: 'link',
      })
    );

    const url = new URL(result.authUrl);
    expect(url.searchParams.get('scope')).toBe('identify');
    expect(url.searchParams.get('state')).toBe(lastDocId);
  });

  test('discordOAuthLoginStart stores returnTo and returns authUrl', async () => {
    const result = await oauth.discordOAuthLoginStart.run({
      data: { returnTo: 'https://evil.com' },
    });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'discord',
        intent: 'login',
        returnTo: '/dashboard',
      })
    );

    const url = new URL(result.authUrl);
    expect(url.searchParams.get('scope')).toBe('identify email');
  });

  test('discordOAuthStart ignores localhost override outside emulator', async () => {
    process.env.DISCORD_OAUTH_REDIRECT_URI =
      'http://127.0.0.1:5001/test-project/us-central1/discordOAuthCallback';
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.FIREBASE_EMULATOR_HUB;
    process.env.GCLOUD_PROJECT = 'test-project';

    const result = await oauth.discordOAuthStart.run({ auth: { uid: 'user1' } });
    const url = new URL(result.authUrl);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://us-central1-test-project.cloudfunctions.net/discordOAuthCallback'
    );
  });

  test('discordOAuthStart allows localhost override in emulator', async () => {
    process.env.DISCORD_OAUTH_REDIRECT_URI =
      'http://127.0.0.1:5001/test-project/us-central1/discordOAuthCallback';
    process.env.FUNCTIONS_EMULATOR = 'true';

    const result = await oauth.discordOAuthStart.run({ auth: { uid: 'user1' } });
    const url = new URL(result.authUrl);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:5001/test-project/us-central1/discordOAuthCallback'
    );
  });
});
