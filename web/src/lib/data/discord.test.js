import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const functionsMocks = {
  getFunctions: vi.fn(() => ({ name: 'functions' })),
  httpsCallable: vi.fn(),
};

vi.mock('firebase/functions', () => functionsMocks);

let discord;

beforeAll(async () => {
  discord = await import('./discord');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('discord data helpers', () => {
  test('startDiscordOAuth returns authUrl', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { authUrl: 'https://auth' } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await discord.startDiscordOAuth();

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'discordOAuthStart'
    );
    expect(result).toBe('https://auth');
  });

  test('startDiscordLogin posts returnTo and returns authUrl', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { authUrl: 'https://login' } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await discord.startDiscordLogin('/return');

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'discordOAuthLoginStart'
    );
    expect(callable).toHaveBeenCalledWith({ returnTo: '/return' });
    expect(result).toBe('https://login');
  });

  test('generateDiscordLinkCode returns data payload', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { code: 'ABC' } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await discord.generateDiscordLinkCode('group1');

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'discordGenerateLinkCode'
    );
    expect(callable).toHaveBeenCalledWith({ groupId: 'group1' });
    expect(result).toEqual({ code: 'ABC' });
  });

  test('unlinkDiscordAccount returns data payload', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { ok: true } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await discord.unlinkDiscordAccount();

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'discordUnlink'
    );
    expect(result).toEqual({ ok: true });
  });

  test('fetchDiscordGuildRoles returns data payload', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { roles: ['r1'] } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await discord.fetchDiscordGuildRoles('group2');

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'discordListGuildRoles'
    );
    expect(callable).toHaveBeenCalledWith({ groupId: 'group2' });
    expect(result).toEqual({ roles: ['r1'] });
  });

  test('repostDiscordPollCard returns data payload', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { messageId: 'm1' } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await discord.repostDiscordPollCard('sched1');

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'discordRepostPollCard'
    );
    expect(callable).toHaveBeenCalledWith({ schedulerId: 'sched1' });
    expect(result).toEqual({ messageId: 'm1' });
  });
});
