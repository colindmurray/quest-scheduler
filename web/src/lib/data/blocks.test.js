import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const firestoreMocks = {
  collection: vi.fn((...args) => ({ path: args.slice(1).join('/') })),
  orderBy: vi.fn((...args) => ({ order: args })),
  query: vi.fn((...args) => ({ queryArgs: args })),
};

const functionsMocks = {
  getFunctions: vi.fn(() => ({ name: 'functions' })),
  httpsCallable: vi.fn(),
};

vi.mock('firebase/firestore', () => firestoreMocks);
vi.mock('firebase/functions', () => functionsMocks);
vi.mock('../firebase', () => ({ db: { name: 'db' } }));

let blocks;

beforeAll(async () => {
  blocks = await import('./blocks');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('blocks', () => {
  test('blockedUsersRef targets user blockedUsers subcollection', () => {
    const result = blocks.blockedUsersRef('user1');
    expect(firestoreMocks.collection).toHaveBeenCalledWith(
      { name: 'db' },
      'users',
      'user1',
      'blockedUsers'
    );
    expect(result).toEqual({ path: 'users/user1/blockedUsers' });
  });

  test('blockedUsersQuery orders by blockedAt desc', () => {
    const result = blocks.blockedUsersQuery('user2');
    expect(firestoreMocks.orderBy).toHaveBeenCalledWith('blockedAt', 'desc');
    expect(firestoreMocks.query).toHaveBeenCalled();
    expect(result).toEqual({
      queryArgs: [
        { path: 'users/user2/blockedUsers' },
        { order: ['blockedAt', 'desc'] },
      ],
    });
  });

  test('blockUserByIdentifier calls cloud function', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { blocked: true } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await blocks.blockUserByIdentifier('user@example.com');

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'blockUser'
    );
    expect(callable).toHaveBeenCalledWith({ identifier: 'user@example.com' });
    expect(result).toEqual({ blocked: true });
  });

  test('unblockUserByIdentifier calls cloud function', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { blocked: false } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await blocks.unblockUserByIdentifier('user@example.com');

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'unblockUser'
    );
    expect(callable).toHaveBeenCalledWith({ identifier: 'user@example.com' });
    expect(result).toEqual({ blocked: false });
  });
});
