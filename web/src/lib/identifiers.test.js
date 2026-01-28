import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const firestoreMocks = {
  collection: vi.fn((...args) => ({ type: 'collection', args })),
  doc: vi.fn((...args) => ({ type: 'doc', args })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((...args) => ({ type: 'query', args })),
  where: vi.fn((...args) => ({ type: 'where', args })),
};

vi.mock('./firebase', () => ({
  db: { name: 'db' },
}));

vi.mock('firebase/firestore', () => firestoreMocks);

let detectIdentifierType;
let resolveIdentifier;

beforeAll(async () => {
  ({ detectIdentifierType, resolveIdentifier } = await import('./identifiers'));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('detectIdentifierType', () => {
  test('returns unknown for empty input', () => {
    expect(detectIdentifierType('')).toEqual({ type: 'unknown', value: '' });
  });

  test('detects qs usernames', () => {
    expect(detectIdentifierType('@QuestUser')).toEqual({
      type: 'qsUsername',
      value: 'QuestUser',
    });
  });

  test('detects emails and normalizes casing', () => {
    expect(detectIdentifierType('Test@Example.com')).toEqual({
      type: 'email',
      value: 'test@example.com',
    });
  });

  test('detects discord ids and legacy tags', () => {
    expect(detectIdentifierType('123456789012345678')).toEqual({
      type: 'discordId',
      value: '123456789012345678',
    });

    expect(detectIdentifierType('Name#1234')).toEqual({
      type: 'legacyDiscordTag',
      value: 'Name#1234',
    });
  });

  test('detects valid discord usernames and normalizes', () => {
    expect(detectIdentifierType('User.Name')).toEqual({
      type: 'discordUsername',
      value: 'user.name',
    });
  });
});

describe('resolveIdentifier', () => {
  test('throws on empty input', async () => {
    await expect(resolveIdentifier('')).rejects.toThrow(
      'Please enter a valid email address or Discord username.'
    );
  });

  test('resolves qs username from qsUsernames + usersPublic', async () => {
    firestoreMocks.getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ uid: 'user123' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ email: 'User@Example.com', displayName: 'User' }),
      });

    const result = await resolveIdentifier('@QuestUser');
    expect(result).toEqual({
      type: 'qsUsername',
      email: 'user@example.com',
      userId: 'user123',
      userData: { email: 'User@Example.com', displayName: 'User' },
    });
  });

  test('throws when qs username is missing', async () => {
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => false,
    });

    await expect(resolveIdentifier('@missing')).rejects.toThrow(
      'No user found with username @missing.'
    );
  });

  test('throws for discord ids and legacy tags', async () => {
    await expect(resolveIdentifier('123456789012345678')).rejects.toThrow(
      'Discord IDs are not supported.'
    );
    await expect(resolveIdentifier('Name#1234')).rejects.toThrow(
      'Legacy Discord tags (name#1234) are not supported.'
    );
  });

  test('resolves email lookup with usersPublic match', async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'user456',
          data: () => ({ email: 'test@example.com', displayName: 'Test' }),
        },
      ],
    });

    const result = await resolveIdentifier('test@example.com');
    expect(result).toEqual({
      type: 'email',
      email: 'test@example.com',
      userId: 'user456',
      userData: { email: 'test@example.com', displayName: 'Test' },
    });
  });

  test('resolves discord username lookup', async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'user789',
          data: () => ({
            email: 'discord@example.com',
            discordUsernameLower: 'quest',
          }),
        },
      ],
    });

    const result = await resolveIdentifier('Quest');
    expect(result).toEqual({
      type: 'discordUsername',
      email: 'discord@example.com',
      userId: 'user789',
      userData: {
        email: 'discord@example.com',
        discordUsernameLower: 'quest',
      },
    });
  });

  test('throws when discord username is missing', async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({ empty: true, docs: [] });

    await expect(resolveIdentifier('Quest')).rejects.toThrow(
      'No Quest Scheduler user found with Discord username "quest".'
    );
  });
});
