import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

let worker;

describe('discord worker helpers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

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
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      },
    };
    require.cache[require.resolve('firebase-admin')] = {
      exports: {
        apps: [],
        initializeApp: vi.fn(),
        firestore: () => ({}),
      },
    };
    require.cache[require.resolve('discord-api-types/v10')] = {
      exports: {
        InteractionType: { ApplicationCommand: 2 },
        ComponentType: { Button: 2, StringSelect: 3 },
      },
    };
    require.cache[require.resolve('./config')] = {
      exports: {
        DISCORD_APPLICATION_ID: { value: () => 'app' },
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        DISCORD_REGION: 'us-central1',
        APP_URL: 'https://app.example.com',
        DISCORD_NOTIFICATION_DEFAULTS: {
          finalizationEvents: true,
          slotChanges: true,
          voteSubmitted: false,
        },
      },
    };
    require.cache[require.resolve('./link-utils')] = {
      exports: { hashLinkCode: vi.fn(() => 'hash') },
    };
    require.cache[require.resolve('./error-messages')] = {
      exports: { ERROR_MESSAGES: {}, buildUserNotLinkedMessage: vi.fn() },
    };
    require.cache[require.resolve('./discord-client')] = {
      exports: { editOriginalInteractionResponse: vi.fn(), fetchChannel: vi.fn() },
    };

    worker = await import('./worker');
  });

  test('parseSnowflakeTimestamp returns a number for valid ids', () => {
    const { parseSnowflakeTimestamp } = worker.__test__;
    const value = parseSnowflakeTimestamp('175928847299117063');
    expect(typeof value).toBe('number');
  });

  test('isTokenExpired respects timestamp window', () => {
    const { isTokenExpired } = worker.__test__;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2000000000000);
    expect(isTokenExpired('175928847299117063')).toBe(true);
    nowSpy.mockRestore();
  });

  test('getDiscordUserId prefers member user', () => {
    const { getDiscordUserId } = worker.__test__;
    expect(getDiscordUserId({ member: { user: { id: 'm1' } } })).toBe('m1');
    expect(getDiscordUserId({ user: { id: 'u1' } })).toBe('u1');
  });

  test('hasLinkPermissions checks admin or manage channels', () => {
    const { hasLinkPermissions } = worker.__test__;
    expect(hasLinkPermissions('8')).toBe(true);
    expect(hasLinkPermissions('16')).toBe(true);
    expect(hasLinkPermissions('0')).toBe(false);
  });

  test('getVotePage clamps page index', () => {
    const { getVotePage } = worker.__test__;
    const slots = Array.from({ length: 30 }, (_, idx) => ({ id: `s${idx}` }));
    const { pageIndex, pageCount, pageSlots } = getVotePage(slots, 2);
    expect(pageCount).toBe(2);
    expect(pageIndex).toBe(1);
    expect(pageSlots).toHaveLength(5);
  });

  test('formatVoteContent adds pagination info', () => {
    const { formatVoteContent } = worker.__test__;
    expect(formatVoteContent('Pick', 0, 2)).toBe('Pick (Page 1 of 2)');
    expect(formatVoteContent('Pick', 0, 1)).toBe('Pick');
  });

  test('buildSessionId combines scheduler and user', () => {
    const { buildSessionId } = worker.__test__;
    expect(buildSessionId('sched', 'user')).toBe('sched:user');
  });

  test('formatSlotLabel returns a readable range', () => {
    const { formatSlotLabel } = worker.__test__;
    const label = formatSlotLabel('2025-01-01T10:00:00Z', '2025-01-01T11:00:00Z');
    expect(label).toContain('Jan');
    expect(label).toContain('-');
  });

  test('buildVoteComponents marks preferred and feasible defaults', () => {
    const { buildVoteComponents } = worker.__test__;
    const components = buildVoteComponents({
      schedulerId: 'sched',
      slots: [
        { id: 'a', start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' },
        { id: 'b', start: '2025-01-02T10:00:00Z', end: '2025-01-02T11:00:00Z' },
      ],
      preferredIds: ['a'],
      feasibleIds: ['b'],
      pageIndex: 0,
      pageCount: 1,
    });

    const preferredSelect = components[1].components[0];
    const feasibleSelect = components[3].components[0];
    expect(preferredSelect.options[0].default).toBe(true);
    expect(feasibleSelect.options[1].default).toBe(true);
  });

  test('normalizeEmail trims and lowercases', () => {
    const { normalizeEmail } = worker.__test__;
    expect(normalizeEmail(' User@Example.com ')).toBe('user@example.com');
  });
});
