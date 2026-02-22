import { beforeAll, afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import admin from 'firebase-admin';
import { InteractionType } from 'discord-api-types/v10';

const projectId = process.env.GCLOUD_PROJECT || 'quest-scheduler-test';

if (!process.env.GCLOUD_PROJECT) {
  process.env.GCLOUD_PROJECT = projectId;
}
if (!process.env.FIREBASE_CONFIG) {
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
}

const editOriginalInteractionResponse = vi.fn().mockResolvedValue({});
const fetchChannel = vi.fn().mockResolvedValue({});
const DISCORD_EPOCH = 1420070400000n;
const applicationId = ((BigInt(Date.now()) - DISCORD_EPOCH) << 22n).toString();
const secretValues = {
  DISCORD_APPLICATION_ID: applicationId,
  DISCORD_BOT_TOKEN: 'token',
};
const schedulerId = 'scheduler-discord';
const userId = 'qs-user-1';
const discordUserId = 'discord-user-1';
const guildId = 'guild-1';
const channelId = 'channel-1';

let worker;
let db;
let emulatorProcess;
let emulatorStarted = false;

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [emulatorHostname, emulatorPortRaw] = EMULATOR_HOST.split(':');
const emulatorPort = Number(emulatorPortRaw || 8080);

const canConnect = (host, port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
  });

const waitForEmulatorReady = (proc, timeoutMs = 30000) =>
  new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) resolve(false);
    }, timeoutMs);

    const handleOutput = (chunk) => {
      const text = chunk.toString();
      if (text.includes('All emulators ready')) {
        clearTimeout(timeout);
        resolved = true;
        resolve(true);
      }
    };

    proc.stdout?.on('data', handleOutput);
    proc.stderr?.on('data', handleOutput);
    proc.once('error', () => {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;
        resolve(false);
      }
    });
    proc.once('exit', () => {
      if (!resolved) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  });

const ensureFirestoreEmulator = async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST) return true;
  if (await canConnect(emulatorHostname, emulatorPort)) {
    process.env.FIRESTORE_EMULATOR_HOST = `${emulatorHostname}:${emulatorPort}`;
    return true;
  }

  const cwd = path.resolve(__dirname, '../../..');
  try {
    emulatorProcess = spawn(
      'firebase',
      ['emulators:start', '--only', 'firestore', '--project', projectId],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err) {
    return false;
  }

  const ready = await waitForEmulatorReady(emulatorProcess);
  if (!ready) return false;
  emulatorStarted = true;
  process.env.FIRESTORE_EMULATOR_HOST = `${emulatorHostname}:${emulatorPort}`;
  return true;
};

const emulatorReady = await ensureFirestoreEmulator();
const describeOrSkip = emulatorReady ? describe : describe.skip;

function makeSnowflake() {
  const timestamp = BigInt(Date.now()) - DISCORD_EPOCH;
  return (timestamp << 22n).toString();
}

async function deleteCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
}

async function resetFirestore() {
  if (!db) return;
  const schedulerRefs = await db.collection('schedulers').listDocuments();
  await Promise.all(
    schedulerRefs.map((ref) => db.recursiveDelete(ref).catch(() => null))
  );
  await Promise.all([
    deleteCollection('discordUserLinks'),
    deleteCollection('discordVoteSessions'),
    deleteCollection('discordInteractionIds'),
    deleteCollection('users'),
  ]);
}

describeOrSkip('discord worker integration (emulator)', () => {
  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('firebase-functions/v2/tasks', () => ({
      onTaskDispatched: (opts, handler) => {
        const fn = (req) => handler(req);
        fn.run = handler;
        return fn;
      },
    }));
    vi.doMock('firebase-functions/params', () => ({
      defineSecret: (name) => ({
        value: () => secretValues[name] || process.env[name] || '',
      }),
    }));
    vi.doMock('./discord-client', () => ({
      editOriginalInteractionResponse,
      fetchChannel,
    }));
    process.env.DISCORD_APPLICATION_ID = secretValues.DISCORD_APPLICATION_ID;
    process.env.DISCORD_BOT_TOKEN = secretValues.DISCORD_BOT_TOKEN;
    worker = await import('./worker');
    db = admin.firestore();
  });

  beforeEach(async () => {
    editOriginalInteractionResponse.mockClear();
    fetchChannel.mockClear();
    await resetFirestore();
  });

  afterAll(async () => {
    await resetFirestore();
    await Promise.all(admin.apps.map((app) => app.delete()));
    if (emulatorProcess && emulatorStarted) {
      emulatorProcess.kill('SIGINT');
      await new Promise((resolve) => emulatorProcess.once('exit', resolve));
    }
  });

  test('vote flow writes session + votes', async () => {
    const schedulerRef = db.collection('schedulers').doc(schedulerId);
    await schedulerRef.set({
      status: 'OPEN',
      participantIds: [userId],
      discord: { guildId, channelId },
      timezone: 'UTC',
    });
    await schedulerRef.collection('slots').doc('slot-1').set({
      start: '2025-01-01T10:00:00.000Z',
      end: '2025-01-01T11:00:00.000Z',
    });
    await schedulerRef.collection('slots').doc('slot-2').set({
      start: '2025-01-01T12:00:00.000Z',
      end: '2025-01-01T13:00:00.000Z',
    });
    await db.collection('users').doc(userId).set({
      email: 'test@example.com',
      photoURL: 'https://example.com/avatar.png',
    });
    await db.collection('discordUserLinks').doc(discordUserId).set({
      qsUserId: userId,
    });

    const baseInteraction = {
      applicationId,
      guildId,
      channelId,
      member: { user: { id: discordUserId } },
      type: InteractionType.MessageComponent,
    };

    await worker.processDiscordInteraction.run({
      data: {
        ...baseInteraction,
        id: makeSnowflake(),
        data: { custom_id: `vote_btn:${schedulerId}` },
      },
    });

    const sessionRef = db
      .collection('discordVoteSessions')
      .doc(`${schedulerId}:${discordUserId}`);
    const sessionSnap = await sessionRef.get();
    expect(sessionSnap.exists).toBe(true);
    const session = sessionSnap.data();
    expect(session.schedulerId).toBe(schedulerId);
    expect(session.discordUserId).toBe(discordUserId);
    expect(session.qsUserId).toBe(userId);

    await worker.processDiscordInteraction.run({
      data: {
        ...baseInteraction,
        id: makeSnowflake(),
        data: {
          custom_id: `vote_feasible:${schedulerId}`,
          values: ['slot-1'],
        },
      },
    });

    const updatedSession = (await sessionRef.get()).data();
    expect(updatedSession.feasibleSlotIds).toContain('slot-1');
    expect(updatedSession.preferredSlotIds).toEqual([]);

    await worker.processDiscordInteraction.run({
      data: {
        ...baseInteraction,
        id: makeSnowflake(),
        data: { custom_id: `submit_vote:${schedulerId}` },
      },
    });

    const voteSnap = await schedulerRef.collection('votes').doc(userId).get();
    expect(voteSnap.exists).toBe(true);
    expect(voteSnap.data().votes).toEqual({ 'slot-1': 'FEASIBLE' });
    expect((await sessionRef.get()).exists).toBe(false);
  });
});
