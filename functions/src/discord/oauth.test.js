import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

let oauth;
let lastDocId = null;

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
    vi.spyOn(config.DISCORD_CLIENT_ID, 'value').mockReturnValue('client-id');
    vi.spyOn(config.DISCORD_CLIENT_SECRET, 'value').mockReturnValue('client-secret');
    config.APP_URL = 'https://app.example.com';

    oauth = await import('./oauth');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    lastDocId = null;
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
});
