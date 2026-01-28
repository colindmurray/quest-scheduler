import { describe, expect, test, vi, beforeEach } from 'vitest';

const resetEnv = () => {
  vi.unstubAllEnvs();
  delete globalThis.__QS_EMULATORS_CONNECTED__;
};

describe('firebase module', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
  });

  test('does not connect emulators by default', async () => {
    const auth = await import('firebase/auth');
    const firestore = await import('firebase/firestore');
    const storage = await import('firebase/storage');
    const functions = await import('firebase/functions');

    await import('./firebase');

    expect(auth.connectAuthEmulator).not.toHaveBeenCalled();
    expect(firestore.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(storage.connectStorageEmulator).not.toHaveBeenCalled();
    expect(functions.connectFunctionsEmulator).not.toHaveBeenCalled();
  });

  test('connects emulators when enabled', async () => {
    vi.stubEnv('VITE_USE_EMULATORS', 'true');
    vi.stubEnv('VITE_EMULATOR_HOST', '127.0.0.1');
    vi.stubEnv('VITE_AUTH_EMULATOR_PORT', '9099');
    vi.stubEnv('VITE_FIRESTORE_EMULATOR_PORT', '8080');
    vi.stubEnv('VITE_STORAGE_EMULATOR_PORT', '9199');
    vi.stubEnv('VITE_FUNCTIONS_EMULATOR_PORT', '5001');

    const auth = await import('firebase/auth');
    const firestore = await import('firebase/firestore');
    const storage = await import('firebase/storage');
    const functions = await import('firebase/functions');

    await import('./firebase');

    expect(auth.connectAuthEmulator).toHaveBeenCalled();
    expect(firestore.connectFirestoreEmulator).toHaveBeenCalled();
    expect(storage.connectStorageEmulator).toHaveBeenCalled();
    expect(functions.connectFunctionsEmulator).toHaveBeenCalled();
    expect(globalThis.__QS_EMULATORS_CONNECTED__).toBe(true);
  });
});
