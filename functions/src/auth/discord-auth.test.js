import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRequire } from "module";

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

function makeRes() {
  const res = {
    status: vi.fn(() => res),
    send: vi.fn(() => res),
    redirect: vi.fn(() => res),
  };
  return res;
}

function mockLoginState(overrides = {}) {
  stateGetMock.mockResolvedValueOnce({
    exists: true,
    data: () => ({
      provider: "discord",
      intent: "login",
      returnTo: "/dashboard",
      expiresAt: { toDate: () => new Date(Date.now() + 60_000) },
      ...overrides,
    }),
  });
}

function mockDiscordFetches({
  tokenBody = { access_token: "discord-access-token" },
  userBody = {
    id: "discord-user-1",
    username: "Tester",
    global_name: "Test User",
    avatar: "hash",
    verified: true,
    email: "tester@example.com",
  },
} = {}) {
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => tokenBody,
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => userBody,
    });
}

describe("discord auth (oauth callback login)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    fetchMock = vi.fn();
    global.fetch = fetchMock;

    const firestoreDb = {
      collection: vi.fn((name) => {
        if (name === "oauthStates") {
          return {
            doc: () => ({
              get: stateGetMock,
              delete: stateDeleteMock,
              set: stateSetMock,
            }),
          };
        }
        if (name === "discordUserLinks") {
          return {
            doc: () => ({
              get: linkGetMock,
              set: linkSetMock,
            }),
          };
        }
        if (name === "users") {
          return {
            doc: () => ({
              get: userGetMock,
              set: userSetMock,
            }),
          };
        }
        if (name === "usersPublic") {
          return {
            doc: () => ({
              set: publicSetMock,
            }),
          };
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
    adminMock.firestore.FieldValue = { serverTimestamp: vi.fn(() => "server-time") };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve("firebase-admin")] = { exports: adminMock };
    require.cache[require.resolve("firebase-admin/firestore")] = {
      exports: {
        Timestamp: { fromDate: vi.fn((date) => ({ toDate: () => date })) },
        FieldValue: { serverTimestamp: vi.fn(() => "server-time") },
      },
    };
    require.cache[require.resolve("firebase-functions/v2/https")] = {
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
    require.cache[require.resolve("../discord/config")] = {
      exports: {
        DISCORD_REGION: "us-central1",
        DISCORD_CLIENT_ID: { value: () => "test-client-id" },
        DISCORD_CLIENT_SECRET: { value: () => "test-client-secret" },
        APP_URL: "https://app.example.com",
      },
    };

    oauth = await import("../discord/oauth");
  });

  afterEach(() => {
    delete global.fetch;
    delete process.env.DISCORD_OAUTH_REDIRECT_URI;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GCP_PROJECT;
  });

  test("discordOAuthStart rejects unauthenticated callers", async () => {
    await expect(oauth.discordOAuthStart.run({ auth: null })).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("discordOAuthStart creates link oauth state for authenticated users", async () => {
    process.env.GCLOUD_PROJECT = "test-project";
    const result = await oauth.discordOAuthStart.run({
      auth: { uid: "qs-user-1" },
    });

    expect(stateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "qs-user-1",
        provider: "discord",
        intent: "link",
      })
    );
    const parsed = new URL(result.authUrl);
    expect(parsed.searchParams.get("scope")).toBe("identify");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://us-central1-test-project.cloudfunctions.net/discordOAuthCallback"
    );
  });

  test("discordOAuthLoginStart ignores invalid or localhost redirect overrides outside emulator", async () => {
    process.env.GCLOUD_PROJECT = "test-project";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    process.env.DISCORD_OAUTH_REDIRECT_URI = "::invalid-url::";
    const invalidOverride = await oauth.discordOAuthLoginStart.run({ data: {} });
    expect(new URL(invalidOverride.authUrl).searchParams.get("redirect_uri")).toBe(
      "https://us-central1-test-project.cloudfunctions.net/discordOAuthCallback"
    );

    process.env.DISCORD_OAUTH_REDIRECT_URI = "http://localhost:5001/callback";
    const localhostOverride = await oauth.discordOAuthLoginStart.run({ data: {} });
    expect(new URL(localhostOverride.authUrl).searchParams.get("redirect_uri")).toBe(
      "https://us-central1-test-project.cloudfunctions.net/discordOAuthCallback"
    );

    expect(warnSpy).toHaveBeenCalledWith("Ignoring invalid DISCORD_OAUTH_REDIRECT_URI value.");
    expect(warnSpy).toHaveBeenCalledWith(
      "Ignoring localhost DISCORD_OAUTH_REDIRECT_URI in non-emulator environment."
    );
    warnSpy.mockRestore();
  });

  test("discordOAuthLoginStart sanitizes unsafe returnTo values", async () => {
    const result = await oauth.discordOAuthLoginStart.run({
      data: { returnTo: "https://evil.example/path" },
    });

    expect(stateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "discord",
        intent: "login",
        returnTo: "/dashboard",
      })
    );
    expect(new URL(result.authUrl).searchParams.get("scope")).toBe("identify email");
  });

  test("discord login redirects with email_required when Discord account has no verified email", async () => {
    mockLoginState();
    linkGetMock.mockResolvedValueOnce({ exists: false });
    mockDiscordFetches({
      userBody: {
        id: "discord-user-2",
        username: "NoVerifiedEmail",
        verified: false,
        email: "no-verified-email@example.com",
      },
    });

    const res = makeRes();
    await oauth.discordOAuthCallback(
      { query: { code: "oauth-code", state: "state-1" } },
      res
    );

    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      "https://app.example.com/auth?error=email_required"
    );
  });

  test("discord login redirects with email_conflict when user email is tied to another Discord user", async () => {
    mockLoginState();
    linkGetMock.mockResolvedValueOnce({ exists: false });
    authGetUserByEmailMock.mockResolvedValueOnce({ uid: "existing-user" });
    authGetUserMock.mockResolvedValueOnce({ email: "tester@example.com" });
    userGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        discord: { userId: "different-discord-id" },
      }),
    });
    mockDiscordFetches({
      userBody: {
        id: "discord-user-3",
        username: "ConflictUser",
        verified: true,
        email: "tester@example.com",
      },
    });

    const res = makeRes();
    await oauth.discordOAuthCallback(
      { query: { code: "oauth-code", state: "state-2" } },
      res
    );

    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      "https://app.example.com/auth?error=email_conflict"
    );
    expect(linkSetMock).not.toHaveBeenCalled();
  });

  test("discord login redirects with discord_in_use when stored link points at a different user id", async () => {
    mockLoginState();
    linkGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ qsUserId: null }),
    });
    authGetUserByEmailMock.mockResolvedValueOnce({ uid: "resolved-user-id" });
    authGetUserMock.mockResolvedValueOnce({ email: "tester@example.com" });
    userGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ discord: { userId: "discord-user-4" } }),
    });
    mockDiscordFetches({
      userBody: {
        id: "discord-user-4",
        username: "AlreadyLinkedElsewhere",
        verified: true,
        email: "tester@example.com",
      },
    });

    const res = makeRes();
    await oauth.discordOAuthCallback(
      { query: { code: "oauth-code", state: "state-3" } },
      res
    );

    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      "https://app.example.com/auth?error=discord_in_use"
    );
    expect(linkSetMock).not.toHaveBeenCalled();
  });

  test("discord login returns 400 when token exchange omits access_token", async () => {
    mockLoginState();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const res = makeRes();
    await oauth.discordOAuthCallback(
      { query: { code: "oauth-code", state: "state-4" } },
      res
    );

    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith("Missing access token");
  });

  test("discord login redirects with server_error when auth lookup fails unexpectedly", async () => {
    mockLoginState();
    linkGetMock.mockResolvedValueOnce({ exists: false });
    authGetUserByEmailMock.mockRejectedValueOnce({ code: "auth/internal-error" });
    mockDiscordFetches({
      userBody: {
        id: "discord-user-lookup-error",
        username: "LookupError",
        verified: true,
        email: "lookup-error@example.com",
      },
    });

    const res = makeRes();
    await oauth.discordOAuthCallback(
      { query: { code: "oauth-code", state: "state-5" } },
      res
    );

    expect(stateDeleteMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith("https://app.example.com/auth?error=server_error");
  });

  test("discord login creates a new firebase user when no existing account matches the discord email", async () => {
    mockLoginState();
    linkGetMock.mockResolvedValueOnce({ exists: false });
    authGetUserByEmailMock.mockRejectedValueOnce({ code: "auth/user-not-found" });
    authCreateUserMock.mockResolvedValueOnce({ uid: "newly-created-uid" });
    userGetMock.mockResolvedValueOnce({ exists: false, data: () => ({}) });
    authCreateCustomTokenMock.mockResolvedValueOnce("custom-token");
    mockDiscordFetches({
      userBody: {
        id: "1234567890123",
        username: "NewDiscordUser",
        global_name: "New Discord User",
        verified: true,
        email: "new-discord-user@example.com",
        avatar: null,
      },
    });

    const res = makeRes();
    await oauth.discordOAuthCallback(
      { query: { code: "oauth-code", state: "state-6" } },
      res
    );

    expect(authCreateUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new-discord-user@example.com",
        emailVerified: true,
      })
    );
    expect(linkSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ qsUserId: "newly-created-uid" })
    );
    expect(userSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new-discord-user@example.com",
        publicIdentifierType: "discordUsername",
      }),
      { merge: true }
    );
    expect(publicSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new-discord-user@example.com",
        publicIdentifierType: "discordUsername",
      }),
      { merge: true }
    );
    expect(res.redirect).toHaveBeenCalledWith(
      "https://app.example.com/auth/discord/finish?token=custom-token&returnTo=%2Fdashboard"
    );
  });

  test("discord login continues when emailVerified update fails for an existing account", async () => {
    mockLoginState();
    linkGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ qsUserId: "existing-user-id" }),
    });
    authGetUserMock.mockResolvedValueOnce({ email: "tester@example.com" });
    authUpdateUserMock.mockRejectedValueOnce(new Error("update failed"));
    userGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ email: "tester@example.com", avatarSource: "discord" }),
    });
    authCreateCustomTokenMock.mockResolvedValueOnce("custom-token-existing");
    mockDiscordFetches({
      userBody: {
        id: "discord-existing-user",
        username: "ExistingDiscord",
        global_name: "Existing Discord",
        avatar: "a_animatedhash",
        verified: true,
        email: "tester@example.com",
      },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = makeRes();
    await oauth.discordOAuthCallback(
      { query: { code: "oauth-code", state: "state-7" } },
      res
    );

    expect(authUpdateUserMock).toHaveBeenCalledWith("existing-user-id", { emailVerified: true });
    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to update emailVerified for Discord login",
      expect.any(Error)
    );
    expect(res.redirect).toHaveBeenCalledWith(
      "https://app.example.com/auth/discord/finish?token=custom-token-existing&returnTo=%2Fdashboard"
    );
    warnSpy.mockRestore();
  });
});
