import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emitScript = path.resolve(
  __dirname,
  '../../../functions/scripts/emit-notification-event.js'
);
const createScript = path.resolve(
  __dirname,
  '../../../functions/scripts/create-notification.js'
);
const autoClearScript = path.resolve(
  __dirname,
  '../../../functions/scripts/apply-auto-clear.js'
);

export async function emitNotificationEvent(event) {
  const payload = JSON.stringify(event);
  const { stdout } = await execFileAsync('node', [emitScript, payload], {
    env: { ...process.env },
  });
  return stdout.trim();
}

export async function createNotification(payload) {
  const body = JSON.stringify(payload);
  const { stdout } = await execFileAsync('node', [createScript, body], {
    env: { ...process.env },
  });
  return stdout.trim();
}

export async function applyAutoClear(payload) {
  const body = JSON.stringify(payload);
  await execFileAsync('node', [autoClearScript, body], {
    env: { ...process.env },
  });
}
