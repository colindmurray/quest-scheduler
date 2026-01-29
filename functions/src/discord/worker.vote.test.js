import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let worker;
let editOriginalInteractionResponseMock;
let sessionGetMock;
let sessionSetMock;
let sessionDeleteMock;
let schedulerGetMock;
let slotsGetMock;
let voteSetMock;
let linkGetMock;
let userGetMock;

let sessionData;
let schedulerData;
let slotsDocs;
let linkData;
let userData;

describe('discord worker vote handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    editOriginalInteractionResponseMock = vi.fn().mockResolvedValue({ ok: true });
    sessionGetMock = vi.fn();
    sessionSetMock = vi.fn();
    sessionDeleteMock = vi.fn().mockResolvedValue(undefined);
    schedulerGetMock = vi.fn();
    slotsGetMock = vi.fn();
    voteSetMock = vi.fn();
    linkGetMock = vi.fn();
    userGetMock = vi.fn();

    sessionData = null;
    schedulerData = null;
    slotsDocs = [];
    linkData = null;
    userData = null;

    const schedulerRef = {
      get: schedulerGetMock,
      collection: (name) => {
        if (name === 'slots') {
          return { get: slotsGetMock };
        }
        if (name === 'votes') {
          return { doc: () => ({ set: voteSetMock }) };
        }
        return { get: async () => ({ docs: [] }) };
      },
    };

    const db = {
      collection: (name) => {
        if (name === 'discordVoteSessions') {
          return {
            doc: () => ({
              get: sessionGetMock,
              set: sessionSetMock,
              delete: sessionDeleteMock,
            }),
          };
        }
        if (name === 'schedulers') {
          return { doc: () => schedulerRef };
        }
        if (name === 'discordUserLinks') {
          return { doc: () => ({ get: linkGetMock }) };
        }
        if (name === 'users') {
          return { doc: () => ({ get: userGetMock }) };
        }
        return { doc: () => ({}) };
      },
    };

    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
      firestore: () => db,
      auth: () => ({ getUser: vi.fn() }),
    };
    adminMock.firestore.FieldValue = { serverTimestamp: vi.fn(() => 'server-time') };
    adminMock.firestore.Timestamp = { fromDate: vi.fn(() => ({ toDate: () => new Date() })) };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('firebase-functions/v2/tasks')] = {
      exports: {
        onTaskDispatched: (opts, handler) => {
          const fn = (req) => handler(req);
          fn.run = handler;
          return fn;
        },
      },
    };
    require.cache[require.resolve('firebase-functions')] = {
      exports: {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
    };
    require.cache[require.resolve('firebase-admin')] = { exports: adminMock };
    require.cache[require.resolve('discord-api-types/v10')] = {
      exports: {
        InteractionType: { ApplicationCommand: 2, MessageComponent: 3 },
        ComponentType: { Button: 2, StringSelect: 3 },
      },
    };
    require.cache[require.resolve('./config')] = {
      exports: {
        DISCORD_APPLICATION_ID: { value: () => 'app' },
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        DISCORD_REGION: 'us-central1',
        APP_URL: 'https://app.example.com',
      },
    };
    require.cache[require.resolve('./link-utils')] = {
      exports: { hashLinkCode: vi.fn(() => 'hash') },
    };
    require.cache[require.resolve('./error-messages')] = {
      exports: {
        ERROR_MESSAGES: {
          missingDiscordUser: 'missing user',
          sessionExpired: 'session expired',
          pollFinalized: 'poll closed',
          noSlots: 'no slots',
          selectAtLeastOne: 'select one',
          staleSlots: 'stale slots',
          notParticipant: 'not participant',
        },
        buildUserNotLinkedMessage: vi.fn(() => 'link user'),
      },
    };
    require.cache[require.resolve('./discord-client')] = {
      exports: {
        editOriginalInteractionResponse: (...args) => editOriginalInteractionResponseMock(...args),
        fetchChannel: vi.fn(),
      },
    };

    worker = await import('./worker');
  });

  test('handleVoteSelect updates preferred selections', async () => {
    sessionData = { preferredSlotIds: ['a'], feasibleSlotIds: ['a'], pageIndex: 0 };
    schedulerData = { status: 'OPEN' };
    slotsDocs = [
      { id: 'a', data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) },
      { id: 'b', data: () => ({ start: '2025-01-02T10:00:00Z', end: '2025-01-02T11:00:00Z' }) },
    ];

    sessionGetMock.mockResolvedValueOnce({ exists: true, data: () => sessionData });
    schedulerGetMock.mockResolvedValueOnce({ exists: true, data: () => schedulerData });
    slotsGetMock.mockResolvedValueOnce({ docs: slotsDocs });

    await worker.__test__.handleVoteSelect(
      {
        id: 'invalid',
        token: 'tok',
        applicationId: 'app',
        member: { user: { id: 'discord1' } },
        data: { values: ['b'] },
      },
      'sched1',
      'preferred'
    );

    expect(sessionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredSlotIds: expect.arrayContaining(['b']),
        feasibleSlotIds: expect.arrayContaining(['a', 'b']),
      }),
      { merge: true }
    );
  });

  test('handleVotePage updates page index', async () => {
    sessionData = { preferredSlotIds: [], feasibleSlotIds: [], pageIndex: 0 };
    schedulerData = { status: 'OPEN' };
    slotsDocs = Array.from({ length: 30 }, (_, index) => ({
      id: `slot${index}`,
      data: () => ({ start: `2025-01-01T${String(index).padStart(2, '0')}:00:00Z`, end: `2025-01-01T${String(index).padStart(2, '0')}:30:00Z` }),
    }));

    sessionGetMock.mockResolvedValueOnce({ exists: true, data: () => sessionData });
    schedulerGetMock.mockResolvedValueOnce({ exists: true, data: () => schedulerData });
    slotsGetMock.mockResolvedValueOnce({ docs: slotsDocs });

    await worker.__test__.handleVotePage(
      {
        id: 'invalid',
        token: 'tok',
        applicationId: 'app',
        member: { user: { id: 'discord1' } },
      },
      'sched1',
      'next'
    );

    expect(sessionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ pageIndex: 1 }),
      { merge: true }
    );
  });

  test('handleSubmitVote writes votes and clears session', async () => {
    sessionData = { preferredSlotIds: ['a'], feasibleSlotIds: ['b'], pageIndex: 0 };
    schedulerData = {
      status: 'OPEN',
      discord: { channelId: 'chan1', guildId: 'guild1' },
      participantIds: ['user1'],
    };
    slotsDocs = [
      { id: 'a', data: () => ({ start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' }) },
      { id: 'b', data: () => ({ start: '2025-01-02T10:00:00Z', end: '2025-01-02T11:00:00Z' }) },
    ];
    linkData = { qsUserId: 'user1' };
    userData = { email: 'user@example.com', photoURL: 'avatar' };

    sessionGetMock.mockResolvedValueOnce({ exists: true, data: () => sessionData });
    schedulerGetMock.mockResolvedValueOnce({ exists: true, data: () => schedulerData });
    slotsGetMock.mockResolvedValueOnce({ docs: slotsDocs });
    linkGetMock.mockResolvedValueOnce({ exists: true, data: () => linkData });
    userGetMock.mockResolvedValueOnce({ exists: true, data: () => userData });

    await worker.__test__.handleSubmitVote(
      {
        id: 'invalid',
        token: 'tok',
        applicationId: 'app',
        member: { user: { id: 'discord1' } },
        channelId: 'chan1',
        guildId: 'guild1',
      },
      'sched1'
    );

    expect(voteSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        votes: { a: 'PREFERRED', b: 'FEASIBLE' },
        userEmail: 'user@example.com',
      }),
      { merge: true }
    );
    expect(sessionDeleteMock).toHaveBeenCalled();
  });
});
