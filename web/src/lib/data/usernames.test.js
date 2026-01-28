import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const functionsMocks = {
  getFunctions: vi.fn(() => ({ name: 'functions' })),
  httpsCallable: vi.fn(),
};

vi.mock('firebase/functions', () => functionsMocks);

let usernames;

beforeAll(async () => {
  usernames = await import('./usernames');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usernames data helpers', () => {
  test('registerQsUsername calls cloud function and returns data', async () => {
    const callable = vi.fn().mockResolvedValueOnce({ data: { ok: true } });
    functionsMocks.httpsCallable.mockReturnValueOnce(callable);

    const result = await usernames.registerQsUsername('quester');

    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'registerQsUsername'
    );
    expect(callable).toHaveBeenCalledWith({ username: 'quester' });
    expect(result).toEqual({ ok: true });
  });
});
