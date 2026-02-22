import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRequire } from "module";

const getUserByEmailMock = vi.fn();
const mailAddMock = vi.fn();
const userSetMock = vi.fn();
const publicSetMock = vi.fn();
const batchUpdateMock = vi.fn();
const batchCommitMock = vi.fn();
const reconcilePendingNotificationsForUserMock = vi.fn();

const friendRequestDocs = [
  { data: () => ({ toUserId: null }), ref: { id: "request-1" } },
  { data: () => ({ toUserId: "existing-user" }), ref: { id: "request-2" } },
];

const friendRequestsQuery = {
  where: vi.fn(function where() {
    return this;
  }),
  get: vi.fn(async () => ({ empty: false, docs: friendRequestDocs })),
};

let sendPasswordResetInfo;
let onUserCreate;

describe("email/password auth functions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    getUserByEmailMock.mockResolvedValue({
      providerData: [{ providerId: "google.com" }],
    });
    friendRequestsQuery.where.mockClear();
    friendRequestsQuery.get.mockResolvedValue({ empty: false, docs: friendRequestDocs });

    const collectionMock = vi.fn((name) => {
      if (name === "mail") return { add: mailAddMock };
      if (name === "users") return { doc: () => ({ set: userSetMock }) };
      if (name === "usersPublic") return { doc: () => ({ set: publicSetMock }) };
      if (name === "friendRequests") return friendRequestsQuery;
      return { doc: () => ({}) };
    });

    const firestoreDb = {
      collection: collectionMock,
      batch: () => ({
        update: batchUpdateMock,
        commit: batchCommitMock,
      }),
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      auth: () => ({ getUserByEmail: getUserByEmailMock }),
      firestore: () => firestoreDb,
    };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve("firebase-admin")] = { exports: adminMock };
    require.cache[require.resolve("firebase-admin/firestore")] = {
      exports: {
        FieldValue: { serverTimestamp: vi.fn(() => "server-time") },
      },
    };
    require.cache[require.resolve("firebase-functions/v1")] = {
      exports: (() => {
        class HttpsError extends Error {
          constructor(code, message) {
            super(message);
            this.code = code;
          }
        }
        return {
          https: {
            HttpsError,
            onCall: (handler) => {
              const fn = (data, context) => handler(data, context);
              fn.run = handler;
              return fn;
            },
          },
          auth: {
            user: () => ({
              onCreate: (handler) => {
                const fn = (user) => handler(user);
                fn.run = handler;
                return fn;
              },
            }),
          },
        };
      })(),
    };
    require.cache[require.resolve("../notifications/reconcile")] = {
      exports: {
        reconcilePendingNotificationsForUser: reconcilePendingNotificationsForUserMock,
      },
    };

    const authModule = await import("../auth");
    sendPasswordResetInfo = authModule.sendPasswordResetInfo;
    onUserCreate = authModule.onUserCreate;
  });

  test("sendPasswordResetInfo returns success when auth lookup fails unexpectedly", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getUserByEmailMock.mockRejectedValueOnce({ code: "auth/internal-error", message: "boom" });

    const result = await sendPasswordResetInfo.run({ email: "broken@example.com" });

    expect(result).toEqual({ success: true });
    expect(mailAddMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "sendPasswordResetInfo error:",
      expect.objectContaining({ code: "auth/internal-error" })
    );

    errorSpy.mockRestore();
  });

  test("onUserCreate writes minimal docs when the auth user has no email", async () => {
    await onUserCreate.run({
      uid: "discord-no-email-user",
      displayName: "Discord-Only User",
      photoURL: null,
    });

    expect(userSetMock).toHaveBeenCalledTimes(1);
    expect(publicSetMock).toHaveBeenCalledTimes(1);

    const userWrite = userSetMock.mock.calls[0][0];
    expect(userWrite.email).toBeUndefined();
    expect(userWrite.displayName).toBe("Discord-Only User");
    expect(userWrite.publicIdentifierType).toBe("email");
    expect(userWrite.settings).toEqual({
      emailNotifications: true,
      notificationMode: "simple",
    });

    const publicWrite = publicSetMock.mock.calls[0][0];
    expect(publicWrite.email).toBeUndefined();
    expect(publicWrite.publicIdentifier).toBeUndefined();
    expect(publicWrite.displayName).toBe("Discord-Only User");
    expect(publicWrite.publicIdentifierType).toBe("email");

    expect(friendRequestsQuery.where).not.toHaveBeenCalled();
    expect(batchUpdateMock).not.toHaveBeenCalled();
    expect(reconcilePendingNotificationsForUserMock).not.toHaveBeenCalled();
  });

  test("onUserCreate continues when friend-request backfill fails and still reconciles notifications", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    friendRequestsQuery.get.mockRejectedValueOnce(new Error("friendRequests down"));

    await onUserCreate.run({
      uid: "user-friend-backfill-failure",
      email: "player@example.com",
      displayName: "Player",
      photoURL: null,
    });

    expect(userSetMock).toHaveBeenCalled();
    expect(publicSetMock).toHaveBeenCalled();
    expect(reconcilePendingNotificationsForUserMock).toHaveBeenCalledWith(
      "player@example.com",
      "user-friend-backfill-failure"
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "onUserCreate: failed to backfill friend request user IDs",
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });

  test("onUserCreate continues when notification reconciliation fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    friendRequestsQuery.get.mockResolvedValueOnce({ empty: true, docs: [] });
    reconcilePendingNotificationsForUserMock.mockRejectedValueOnce(
      new Error("reconcile failed")
    );

    await onUserCreate.run({
      uid: "user-reconcile-failure",
      email: "notify@example.com",
      displayName: "Notifier",
      photoURL: null,
    });

    expect(userSetMock).toHaveBeenCalled();
    expect(publicSetMock).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "onUserCreate: pending notification reconciliation failed",
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });
});
