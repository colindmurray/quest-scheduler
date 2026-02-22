import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let oauth;
let fetchMock;

const stateGetMock = vi.fn();
const stateDeleteMock = vi.fn();
const stateSetMock = vi.fn();

const linkGetMock = vi.fn();
const linkSetMock = vi.fn();
const userGetMock = vi.fn();
const userSetMock = vi.fn();
const publicSetMock = vi.fn();

const authGetUserByEmailMock = vi.fn();
const authCreateUserMock = vi.fn();
const authGetUserMock = vi.fn();
const authUpdateUserMock = vi.fn();
const authCreateCustomTokenMock = vi.fn();

const makeRes = () => {
  const res = {
    status: vi.fn(() => res),
    send: vi.fn(() => res),
    redirect: vi.fn(() => res),
  };
  return res;
};

describe('discord oauth callback', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    fetchMock = vi.fn();
    global.fetch = fetchMock;
    const discordClientId = process.env.DISCORD_CLIENT_ID || 'test-client-id';
    const discordClientSecret =
      process.env.DISCORD_CLIENT_SECRET || 'test-client-secret';

    const firestoreDb = {
      collection: vi.fn((name) => {
        if (name === 'oauthStates') {
          return {
            doc: () => ({
              get: stateGetMock,
              delete: stateDeleteMock,
              set: stateSetMock,
            }),
          };
        }
        if (name === 'discordUserLinks') {
          return { doc: () => ({ get: linkGetMock, set: linkSetMock }) };
        }
        if (name === 'users') {
          return { doc: () => ({ get: userGetMock, set: userSetMock }) };
        }
        if (name === 'usersPublic') {
          return { doc: () => ({ set: publicSetMock }) };
        }
        return { doc: () => ({}) };
      }),
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => firestoreDb,
      auth: () => ({
        getUserByEmail: authGetUserByEmailMock,
        createUser: authCreateUserMock,
        getUser: authGetUserMock,
        updateUser: authUpdateUserMock,
        createCustomToken: authCreateCustomTokenMock,
      }),
    };
    adminMock.firestore.FieldValue = { serverTimestamp: vi.fn(() => 'server-time') };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-admin/firestore')] = {
      exports: {
        Timestamp: { fromDate: vi.fn((date) => ({ toDate: () => date })) },
        FieldValue: { serverTimestamp: vi.fn(() => 'server-time') },
      },
    };
    require.cache[require.resolve('firebase-functions/v2/https')] = {
      exports: {
        onCall: (opts, handler) => {
          const fn = (req) => handler(req);
          fn.run = handler;
          return fn;
        },
        onRequest: (opts, handler) => {
          const fn = (req, res) => handler(req, res);
          fn.run = handler;
          return fn;
        },
        HttpsError: class HttpsError extends Error {
          constructor(code, message) {
            super(message);
            this.code = code;
          }
        },
      },
    };
    require.cache[require.resolve('./config')] = {
      exports: {
        DISCORD_REGION: 'us-central1',
        DISCORD_CLIENT_ID: { value: () => discordClientId },
        DISCORD_CLIENT_SECRET: { value: () => discordClientSecret },
        APP_URL: 'https://app.example.com',
        DISCORD_NOTIFICATION_DEFAULTS: {
          finalizationEvents: true,
          slotChanges: true,
          voteSubmitted: false,
        },
      },
    };

    oauth = await import('./oauth');
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('returns 400 when code or state missing', async () => {
    const res = makeRes();
    await oauth.discordOAuthCallback({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Missing code or state');
  });

  test('returns 400 when state is invalid', async () => {
    stateGetMock.mockResolvedValueOnce({ exists: false });
    const res = makeRes();
    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid state');
  });

  test('returns 400 when state provider is not discord', async () => {
    stateGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        provider: 'google',
        intent: 'link',
        expiresAt: { toDate: () => new Date(Date.now() + 1000) },
      }),
    });
    const res = makeRes();
    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);
    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid state');
  });

  test('expires invalid state', async () => {
    stateGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        provider: 'discord',
        intent: 'link',
        expiresAt: { toDate: () => new Date(Date.now() - 1000) },
      }),
    });
    const res = makeRes();
    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);
    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('State expired. Please retry.');
  });

  test('redirects when token exchange fails', async () => {
    stateGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        provider: 'discord',
        intent: 'link',
        expiresAt: { toDate: () => new Date(Date.now() + 1000) },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bad' }),
    });
    const res = makeRes();
    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);
    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/settings?discord=failed');
  });

  test('redirects when user fetch fails', async () => {
    stateGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        provider: 'discord',
        intent: 'link',
        expiresAt: { toDate: () => new Date(Date.now() + 1000) },
        uid: 'user1',
      }),
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'bad' }),
      });
    const res = makeRes();
    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);
    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/settings?discord=failed');
  });

  test('links discord account and redirects', async () => {
    stateGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        provider: 'discord',
        intent: 'link',
        expiresAt: { toDate: () => new Date(Date.now() + 1000) },
        uid: 'user1',
      }),
    });
    linkGetMock.mockResolvedValueOnce({ exists: false });
    userGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ avatarSource: 'discord', photoURL: null }),
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'discord1',
          username: 'Tester',
          global_name: 'Test User',
          avatar: 'hash',
          verified: true,
          email: 'user@example.com',
        }),
      });
    const res = makeRes();
    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);
    expect(linkSetMock).toHaveBeenCalled();
    expect(userSetMock).toHaveBeenCalled();
    expect(publicSetMock).toHaveBeenCalled();
    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/settings?discord=linked');
  });

  test('returns 400 when link intent state does not include a uid', async () => {
    stateGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        provider: 'discord',
        intent: 'link',
        expiresAt: { toDate: () => new Date(Date.now() + 1000) },
      }),
    });
    linkGetMock.mockResolvedValueOnce({ exists: false });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'discord1',
          username: 'Tester',
          global_name: 'Test User',
          avatar: 'hash',
        }),
      });

    const res = makeRes();
    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);
    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid state');
  });

  test('returns 409 when link intent finds discord account already linked to another user', async () => {
    stateGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        provider: 'discord',
        intent: 'link',
        uid: 'owner-user',
        expiresAt: { toDate: () => new Date(Date.now() + 1000) },
      }),
    });
    linkGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ qsUserId: 'other-user' }),
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'discord1',
          username: 'Tester',
          global_name: 'Test User',
          avatar: 'hash',
        }),
      });

    const res = makeRes();
    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);
    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith('Discord account already linked to another user');
  });

  test('login intent creates custom token and redirects', async () => {
    stateGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        provider: 'discord',
        intent: 'login',
        returnTo: '/dashboard',
        expiresAt: { toDate: () => new Date(Date.now() + 1000) },
      }),
    });
    linkGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ qsUserId: 'user1' }),
    });
    userGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ email: 'user@example.com', avatarSource: 'discord' }),
    });
    authGetUserMock.mockResolvedValueOnce({ email: 'user@example.com' });
    authCreateCustomTokenMock.mockResolvedValueOnce('token123');
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'discord1',
          username: 'user',
          global_name: 'User',
          avatar: 'hash',
          verified: true,
          email: 'user@example.com',
        }),
      });

    const res = makeRes();
    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);

    expect(linkSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ qsUserId: 'user1' })
    );
    expect(userSetMock).toHaveBeenCalled();
    expect(publicSetMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://app.example.com/auth/discord/finish?token=token123&returnTo=%2Fdashboard'
    );
  });

  test('redirects login intent to auth failure when callback throws unexpectedly', async () => {
    stateGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        provider: 'discord',
        intent: 'login',
        returnTo: '/dashboard',
        expiresAt: { toDate: () => new Date(Date.now() + 1000) },
      }),
    });
    fetchMock.mockRejectedValueOnce(new Error('network-down'));
    const res = makeRes();

    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);

    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/auth?error=discord_failed');
  });

  test('redirects link intent to settings failure when callback throws unexpectedly', async () => {
    stateGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        provider: 'discord',
        intent: 'link',
        uid: 'user1',
        expiresAt: { toDate: () => new Date(Date.now() + 1000) },
      }),
    });
    fetchMock.mockRejectedValueOnce(new Error('network-down'));
    const res = makeRes();

    await oauth.discordOAuthCallback({ query: { code: 'code', state: 'state1' } }, res);

    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/settings?discord=failed');
  });
});
