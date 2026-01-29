import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

const verifyKeyMock = vi.fn();
const enqueueMock = vi.fn();
const taskQueueMock = vi.fn(() => ({ enqueue: enqueueMock }));
const getFunctionsMock = vi.fn(() => ({ taskQueue: taskQueueMock }));

let discordInteractions;

const makeReq = ({ method = 'POST', headers = {}, body, rawBody } = {}) => ({
  method,
  body,
  rawBody,
  header: (name) => headers[name.toLowerCase()] ?? headers[name],
});

const makeRes = () => {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    send: vi.fn(() => res),
    set: vi.fn(() => res),
  };
  return res;
};

describe('discord ingress', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    verifyKeyMock.mockResolvedValue(true);
    enqueueMock.mockResolvedValue();

    process.env.DISCORD_PUBLIC_KEY = 'public';
    process.env.DISCORD_APPLICATION_ID = 'app123';

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('discord-interactions')] = {
      exports: { verifyKey: (...args) => verifyKeyMock(...args) },
    };
    require.cache[require.resolve('firebase-admin/functions')] = {
      exports: { getFunctions: () => getFunctionsMock() },
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
    require.cache[require.resolve('firebase-functions/v2/https')] = {
      exports: {
        onRequest: (opts, handler) => {
          const fn = (req, res) => handler(req, res);
          fn.run = handler;
          return fn;
        },
      },
    };
    require.cache[require.resolve('./config')] = {
      exports: {
        DISCORD_APPLICATION_ID: { value: () => process.env.DISCORD_APPLICATION_ID },
        DISCORD_PUBLIC_KEY: { value: () => process.env.DISCORD_PUBLIC_KEY },
        DISCORD_REGION: 'us-central1',
        DISCORD_TASK_QUEUE: 'processDiscordInteraction',
      },
    };
    const adminMock = {
      apps: [],
      initializeApp: vi.fn(),
    };
    require.cache[require.resolve('firebase-admin')] = {
      exports: adminMock,
    };

    const ingressModule = await import('./ingress');
    discordInteractions = ingressModule.discordInteractions;
  });

  test('rejects non-POST methods', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();

    await discordInteractions(req, res);

    expect(res.set).toHaveBeenCalledWith('Allow', 'POST');
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('rejects missing signature headers', async () => {
    const req = makeReq({ method: 'POST', rawBody: Buffer.from('{}') });
    const res = makeRes();

    await discordInteractions(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Invalid signature');
  });

  test('rejects invalid signatures', async () => {
    verifyKeyMock.mockResolvedValueOnce(false);
    const req = makeReq({
      method: 'POST',
      rawBody: Buffer.from('{}'),
      headers: {
        'x-signature-ed25519': 'sig',
        'x-signature-timestamp': 'ts',
      },
    });
    const res = makeRes();

    await discordInteractions(req, res);

    expect(verifyKeyMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects invalid payload', async () => {
    const req = makeReq({
      method: 'POST',
      rawBody: Buffer.from('not-json'),
      headers: {
        'x-signature-ed25519': 'sig',
        'x-signature-timestamp': 'ts',
      },
    });
    const res = makeRes();

    await discordInteractions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid payload');
  });

  test('rejects mismatched application id', async () => {
    const body = {
      id: 'i1',
      application_id: 'wrong',
      type: 2,
    };
    const req = makeReq({
      method: 'POST',
      body,
      rawBody: Buffer.from(JSON.stringify(body)),
      headers: {
        'x-signature-ed25519': 'sig',
        'x-signature-timestamp': 'ts',
      },
    });
    const res = makeRes();

    await discordInteractions(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Invalid application');
  });

  test('responds to ping without enqueue', async () => {
    const body = {
      id: 'i1',
      application_id: 'app123',
      type: 1,
    };
    const req = makeReq({
      method: 'POST',
      body,
      rawBody: Buffer.from(JSON.stringify(body)),
      headers: {
        'x-signature-ed25519': 'sig',
        'x-signature-timestamp': 'ts',
      },
    });
    const res = makeRes();

    await discordInteractions(req, res);

    expect(res.json).toHaveBeenCalledWith({ type: 1 });
    expect(taskQueueMock).not.toHaveBeenCalled();
  });

  test('enqueues and responds with message for non-vote component interactions', async () => {
    const body = {
      id: 'i2',
      application_id: 'app123',
      type: 3,
      data: { custom_id: 'other_btn' },
    };
    const req = makeReq({
      method: 'POST',
      body,
      rawBody: Buffer.from(JSON.stringify(body)),
      headers: {
        'x-signature-ed25519': 'sig',
        'x-signature-timestamp': 'ts',
      },
    });
    const res = makeRes();

    await discordInteractions(req, res);

    expect(taskQueueMock).toHaveBeenCalledWith('processDiscordInteraction');
    expect(enqueueMock).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ type: 6 });
  });
});
