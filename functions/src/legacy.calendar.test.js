import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

let legacy;
let oauth2Client;
let calendarListMock;
let eventsInsertMock;
let eventsDeleteMock;
let oauthStatesSetMock;
let oauthStatesGetMock;
let oauthStatesDeleteMock;
let userSecretsGetMock;
let userSecretsSetMock;
let userSetMock;
let schedulerGetMock;
let schedulerUpdateMock;
let slotGetMock;
let basicPollsGetMock;
let embeddedPollUpdateMocks;
let embeddedPollVoteGetMocks;
let authMock;
const require = createRequire(import.meta.url);

describe('legacy google calendar flows', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.QS_GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.QS_GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
    process.env.QS_GOOGLE_OAUTH_REDIRECT_URI = 'https://example.com/googleCalendarOAuthCallback';
    process.env.QS_APP_URL = 'https://app.example.com';
    process.env.QS_ENC_KEY_B64 = Buffer.alloc(32, 7).toString('base64');

    oauth2Client = {
      generateAuthUrl: vi.fn(() => 'https://auth.example.com'),
      setCredentials: vi.fn(),
      getToken: vi.fn(),
      verifyIdToken: vi.fn(),
    };

    calendarListMock = vi.fn();
    eventsInsertMock = vi.fn();
    eventsDeleteMock = vi.fn();

    const googleMock = {
      auth: {
        OAuth2: vi.fn(() => oauth2Client),
      },
      calendar: vi.fn(() => ({
        calendarList: { list: calendarListMock },
        events: { insert: eventsInsertMock, delete: eventsDeleteMock },
      })),
      oauth2: vi.fn(() => ({
        userinfo: { get: vi.fn() },
      })),
    };

    oauthStatesSetMock = vi.fn();
    oauthStatesGetMock = vi.fn();
    oauthStatesDeleteMock = vi.fn();
    userSecretsGetMock = vi.fn();
    userSecretsSetMock = vi.fn();
    userSetMock = vi.fn();
    authMock = { getUserByEmail: vi.fn(), deleteUser: vi.fn() };
    schedulerGetMock = vi.fn();
    schedulerUpdateMock = vi.fn();
    slotGetMock = vi.fn();
    basicPollsGetMock = vi.fn().mockResolvedValue({ empty: true, docs: [] });
    embeddedPollUpdateMocks = new Map();
    embeddedPollVoteGetMocks = new Map();

    const ensureEmbeddedPollRef = (pollId) => {
      if (!embeddedPollUpdateMocks.has(pollId)) {
        embeddedPollUpdateMocks.set(pollId, vi.fn());
      }
      if (!embeddedPollVoteGetMocks.has(pollId)) {
        embeddedPollVoteGetMocks.set(
          pollId,
          vi.fn().mockResolvedValue({ empty: true, docs: [] })
        );
      }
      return {
        id: pollId,
        data: () => ({}),
        ref: {
          update: embeddedPollUpdateMocks.get(pollId),
          collection: (name) => {
            if (name === 'votes') {
              return { get: embeddedPollVoteGetMocks.get(pollId) };
            }
            return { get: vi.fn().mockResolvedValue({ empty: true, docs: [] }) };
          },
        },
      };
    };

    const schedulerRef = {
      get: schedulerGetMock,
      update: schedulerUpdateMock,
      collection: (name) => {
        if (name === 'slots') {
          return { doc: () => ({ get: slotGetMock }) };
        }
        if (name === 'basicPolls') {
          return {
            get: basicPollsGetMock,
            doc: (pollId) => ensureEmbeddedPollRef(pollId).ref,
          };
        }
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };

    const firestoreMock = {
      collection: (name) => {
        if (name === 'oauthStates') {
          return { doc: () => ({ set: oauthStatesSetMock, get: oauthStatesGetMock, delete: oauthStatesDeleteMock }) };
        }
        if (name === 'userSecrets') {
          return { doc: () => ({ get: userSecretsGetMock, set: userSecretsSetMock, delete: vi.fn() }) };
        }
        if (name === 'users') {
          return { doc: () => ({ set: userSetMock }) };
        }
        if (name === 'schedulers') {
          return { doc: () => schedulerRef };
        }
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => firestoreMock,
      auth: () => authMock,
    };
    adminMock.firestore.FieldValue = { serverTimestamp: vi.fn(() => 'server-time') };
    adminMock.firestore.Timestamp = { fromDate: vi.fn(() => 'expires-at') };

    const functionsMock = {
      https: {
        HttpsError: class HttpsError extends Error {
          constructor(code, message) {
            super(message);
            this.code = code;
          }
        },
        onCall: (handler) => {
          const fn = (data, context) => handler(data, context);
          fn.run = handler;
          return fn;
        },
        onRequest: (handler) => {
          const fn = (req, res) => handler(req, res);
          fn.run = handler;
          return fn;
        },
      },
      runWith: () => functionsMock,
    };

    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('firebase-admin/firestore')] = {
      exports: { FieldValue: adminMock.firestore.FieldValue, Timestamp: { fromDate: vi.fn(() => 'expires-at') } },
    };
    require.cache[require.resolve('firebase-functions/v1')] = { exports: functionsMock };
    require.cache[require.resolve('firebase-functions/params')] = {
      exports: { defineJsonSecret: () => ({ value: () => ({}) }) },
    };
    require.cache[require.resolve('googleapis')] = { exports: { google: googleMock } };

    legacy = await import('./legacy');
  });

  afterEach(() => {
    delete process.env.QS_GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.QS_GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.QS_GOOGLE_OAUTH_REDIRECT_URI;
    delete process.env.QS_APP_URL;
    delete process.env.QS_ENC_KEY_B64;
  });

  test('googleCalendarStartAuth stores oauth state and returns url', async () => {
    const randomSpy = vi.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.alloc(16, 1));

    const result = await legacy.googleCalendarStartAuth.run(
      {},
      { auth: { uid: 'user1', token: { email: 'user@example.com' } } }
    );

    expect(result).toEqual({ authUrl: 'https://auth.example.com' });
    expect(oauthStatesSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'user1', createdAt: 'server-time' })
    );

    randomSpy.mockRestore();
  });

  test('googleCalendarListCalendars returns calendars', async () => {
    const tokenPayload = legacy.__test__.encrypt('refresh-token');
    userSecretsGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ googleCalendar: { refreshToken: tokenPayload } }),
    });
    calendarListMock.mockResolvedValueOnce({ data: { items: [{ id: 'cal1' }] } });

    const result = await legacy.googleCalendarListCalendars.run({}, { auth: { uid: 'user1' } });

    expect(result).toEqual({ items: [{ id: 'cal1', summary: undefined, primary: false }] });
    expect(oauth2Client.setCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-token' });
  });

  test('googleCalendarFinalizePoll creates event and updates scheduler', async () => {
    const tokenPayload = legacy.__test__.encrypt('refresh-token');
    userSecretsGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ googleCalendar: { refreshToken: tokenPayload } }),
    });
    schedulerGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ creatorId: 'user1', googleCalendarId: 'primary' }),
    });
    slotGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ start: '2025-01-01T10:00:00Z' }),
    });
    eventsInsertMock.mockResolvedValueOnce({ data: { id: 'event1' } });

    const result = await legacy.googleCalendarFinalizePoll.run(
      {
        schedulerId: 'sched1',
        slotId: 'slot1',
        title: 'Quest',
        description: 'Desc',
        durationMinutes: 60,
        createCalendarEvent: true,
      },
      { auth: { uid: 'user1' } }
    );

    expect(result).toEqual({ eventId: 'event1', calendarId: 'primary' });
    expect(eventsInsertMock).toHaveBeenCalled();
    expect(schedulerUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FINALIZED',
        googleEventId: 'event1',
        finalizedWithMissingRequiredBasicPollVotes: false,
        missingRequiredBasicPollVotesSummary: [],
        missingRequiredBasicPollVotesCapturedAt: 'server-time',
      })
    );
  });

  test('googleCalendarFinalizePoll snapshots embedded basic poll final results', async () => {
    schedulerGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ creatorId: 'user1', googleCalendarId: 'primary' }),
    });
    slotGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ start: '2025-01-01T10:00:00Z' }),
    });

    const pollUpdateMock = vi.fn();
    const pollVotesGetMock = vi.fn().mockResolvedValue({
      empty: false,
      docs: [
        { id: 'u1', data: () => ({ optionIds: ['opt-a'] }) },
        { id: 'u2', data: () => ({ optionIds: ['opt-b'], otherText: 'Tacos' }) },
      ],
    });

    embeddedPollUpdateMocks.set('bp1', pollUpdateMock);
    embeddedPollVoteGetMocks.set('bp1', pollVotesGetMock);
    basicPollsGetMock.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'bp1',
          data: () => ({
            settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: true },
            options: [
              { id: 'opt-a', label: 'A', order: 0 },
              { id: 'opt-b', label: 'B', order: 1 },
            ],
          }),
          ref: {
            update: pollUpdateMock,
            collection: (name) =>
              name === 'votes'
                ? { get: pollVotesGetMock }
                : { get: vi.fn().mockResolvedValue({ empty: true, docs: [] }) },
          },
        },
      ],
    });

    const result = await legacy.googleCalendarFinalizePoll.run(
      {
        schedulerId: 'sched1',
        slotId: 'slot1',
        durationMinutes: 60,
        createCalendarEvent: false,
      },
      { auth: { uid: 'user1' } }
    );

    expect(result).toEqual({ eventId: null, calendarId: null });
    expect(pollUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finalResults: expect.objectContaining({
          voteType: 'MULTIPLE_CHOICE',
          voterCount: 2,
          winnerIds: expect.arrayContaining(['opt-a', 'opt-b', 'write-in:tacos']),
          rows: expect.arrayContaining([
            expect.objectContaining({ key: 'opt-a', count: 1 }),
            expect.objectContaining({ key: 'opt-b', count: 1 }),
            expect.objectContaining({ key: 'write-in:tacos', count: 1 }),
          ]),
        }),
      })
    );
    expect(schedulerUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FINALIZED',
        winningSlotId: 'slot1',
        finalizedWithMissingRequiredBasicPollVotes: false,
        missingRequiredBasicPollVotesSummary: [],
      })
    );
  });

  test('googleCalendarFinalizePoll records missing required embedded poll votes snapshot', async () => {
    schedulerGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        creatorId: 'user1',
        participantIds: ['user1', 'member-1'],
        googleCalendarId: 'primary',
      }),
    });
    slotGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ start: '2025-01-01T10:00:00Z' }),
    });

    const pollUpdateMock = vi.fn();
    const pollVotesGetMock = vi.fn().mockResolvedValue({
      empty: false,
      docs: [{ id: 'user1', data: () => ({ optionIds: ['opt-a'] }) }],
    });

    embeddedPollUpdateMocks.set('bp-required', pollUpdateMock);
    embeddedPollVoteGetMocks.set('bp-required', pollVotesGetMock);
    basicPollsGetMock.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'bp-required',
          data: () => ({
            title: 'Food',
            required: true,
            settings: { voteType: 'MULTIPLE_CHOICE', allowWriteIn: false },
            options: [{ id: 'opt-a', label: 'Pizza', order: 0 }],
          }),
          ref: {
            update: pollUpdateMock,
            collection: (name) =>
              name === 'votes'
                ? { get: pollVotesGetMock }
                : { get: vi.fn().mockResolvedValue({ empty: true, docs: [] }) },
          },
        },
      ],
    });

    await legacy.googleCalendarFinalizePoll.run(
      {
        schedulerId: 'sched1',
        slotId: 'slot1',
        durationMinutes: 60,
        createCalendarEvent: false,
      },
      { auth: { uid: 'user1' } }
    );

    expect(schedulerUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finalizedWithMissingRequiredBasicPollVotes: true,
        missingRequiredBasicPollVotesSummary: [
          expect.objectContaining({
            basicPollId: 'bp-required',
            missingCount: 1,
            missingUserIds: ['member-1'],
          }),
        ],
      })
    );
  });

  test('googleCalendarDeleteEvent handles missing events', async () => {
    const tokenPayload = legacy.__test__.encrypt('refresh-token');
    userSecretsGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ googleCalendar: { refreshToken: tokenPayload } }),
    });
    schedulerGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ creatorId: 'user1', googleEventId: 'event1', googleCalendarId: 'primary' }),
    });
    eventsDeleteMock.mockRejectedValueOnce({ response: { status: 404 } });

    const result = await legacy.googleCalendarDeleteEvent.run(
      { schedulerId: 'sched1' },
      { auth: { uid: 'user1' } }
    );

    expect(result).toEqual({ deleted: true });
    expect(schedulerUpdateMock).toHaveBeenCalledWith({ googleEventId: null });
  });

  test('googleCalendarOAuthCallback links account and redirects', async () => {
    oauthStatesGetMock.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: 'user1' }),
    });
    oauth2Client.getToken.mockResolvedValueOnce({
      tokens: { refresh_token: 'refresh-token', id_token: 'id-token' },
    });
    oauth2Client.verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ email: 'user@example.com' }),
    });
    authMock.getUserByEmail.mockResolvedValueOnce({ uid: 'user1' });

    const res = {
      status: vi.fn(() => res),
      send: vi.fn(),
      redirect: vi.fn(),
    };

    await legacy.googleCalendarOAuthCallback.run(
      { query: { state: 'state1', code: 'code1' } },
      res
    );

    expect(userSecretsSetMock).toHaveBeenCalled();
    expect(userSetMock).toHaveBeenCalled();
    expect(oauthStatesDeleteMock).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/settings?calendar=linked');
  });
});
