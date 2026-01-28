import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const authState = { currentUser: null };

const authMocks = {
  createUserWithEmailAndPassword: vi.fn(),
  fetchSignInMethodsForEmail: vi.fn(),
  linkWithPopup: vi.fn(),
  signInWithCustomToken: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  credentialFromResult: vi.fn(),
  credential: vi.fn(),
  setCustomParameters: vi.fn(),
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
};

class GoogleAuthProviderMock {
  static credentialFromResult = (...args) => authMocks.credentialFromResult(...args);
  static credential = (...args) => authMocks.credential(...args);
  setCustomParameters(...args) {
    return authMocks.setCustomParameters(...args);
  }
}

vi.mock('./firebase', () => ({
  auth: authState,
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: GoogleAuthProviderMock,
  createUserWithEmailAndPassword: authMocks.createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail: authMocks.fetchSignInMethodsForEmail,
  linkWithPopup: authMocks.linkWithPopup,
  signInWithCustomToken: authMocks.signInWithCustomToken,
  sendEmailVerification: authMocks.sendEmailVerification,
  sendPasswordResetEmail: authMocks.sendPasswordResetEmail,
  signInWithEmailAndPassword: authMocks.signInWithEmailAndPassword,
  signInWithCredential: authMocks.signInWithCredential,
  signInWithPopup: authMocks.signInWithPopup,
  signOut: authMocks.signOut,
  reauthenticateWithPopup: authMocks.reauthenticateWithPopup,
}));

vi.mock('firebase/functions', () => ({
  getFunctions: authMocks.getFunctions,
  httpsCallable: authMocks.httpsCallable,
}));

let authModule;

beforeAll(async () => {
  authModule = await import('./auth');
});

beforeEach(() => {
  vi.clearAllMocks();
  authState.currentUser = null;
  sessionStorage.clear();
});

describe('auth helpers', () => {
  test('signInWithGoogle stores access token and returns user', async () => {
    authMocks.signInWithPopup.mockResolvedValueOnce({ user: { uid: 'u1' } });
    authMocks.credentialFromResult.mockReturnValueOnce({ accessToken: 'token-123' });

    const user = await authModule.signInWithGoogle();

    expect(user).toEqual({ uid: 'u1' });
    expect(sessionStorage.getItem('googleAccessToken')).toBe('token-123');
    expect(authMocks.signInWithPopup).toHaveBeenCalledWith(authState, expect.any(Object));
  });

  test('signInWithGoogleIdToken requires token', async () => {
    await expect(authModule.signInWithGoogleIdToken()).rejects.toThrow(
      'Missing Google ID token.'
    );
  });

  test('signInWithGoogleIdToken signs in with credential', async () => {
    authMocks.credential.mockReturnValueOnce({ provider: 'google', token: 'id' });
    authMocks.signInWithCredential.mockResolvedValueOnce({ user: { uid: 'u2' } });

    const user = await authModule.signInWithGoogleIdToken('id-token');

    expect(authMocks.credential).toHaveBeenCalledWith('id-token');
    expect(authMocks.signInWithCredential).toHaveBeenCalledWith(authState, {
      provider: 'google',
      token: 'id',
    });
    expect(user).toEqual({ uid: 'u2' });
  });

  test('signInWithDiscordToken requires token', async () => {
    await expect(authModule.signInWithDiscordToken()).rejects.toThrow(
      'Missing Discord sign-in token.'
    );
  });

  test('signInWithDiscordToken signs in with custom token', async () => {
    authMocks.signInWithCustomToken.mockResolvedValueOnce({ user: { uid: 'u3' } });

    const user = await authModule.signInWithDiscordToken('discord-token');

    expect(authMocks.signInWithCustomToken).toHaveBeenCalledWith(
      authState,
      'discord-token'
    );
    expect(user).toEqual({ uid: 'u3' });
  });

  test('registerWithEmailPassword normalizes email and sends verification', async () => {
    authMocks.createUserWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'u4' },
    });
    authMocks.sendEmailVerification.mockResolvedValueOnce();

    const user = await authModule.registerWithEmailPassword('Test@Example.com', 'pw');

    expect(authMocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      authState,
      'test@example.com',
      'pw'
    );
    expect(authMocks.sendEmailVerification).toHaveBeenCalledWith(
      { uid: 'u4' },
      expect.objectContaining({ url: expect.stringContaining('/dashboard') })
    );
    expect(user).toEqual({ uid: 'u4' });
  });

  test('registerWithEmailPassword swallows verification errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    authMocks.createUserWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'u5' },
    });
    authMocks.sendEmailVerification.mockRejectedValueOnce(new Error('fail'));

    const user = await authModule.registerWithEmailPassword('user@example.com', 'pw');

    expect(user).toEqual({ uid: 'u5' });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('signInWithEmailPassword normalizes email', async () => {
    authMocks.signInWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'u6' },
    });

    const user = await authModule.signInWithEmailPassword('User@Example.com', 'pw');

    expect(authMocks.signInWithEmailAndPassword).toHaveBeenCalledWith(
      authState,
      'user@example.com',
      'pw'
    );
    expect(user).toEqual({ uid: 'u6' });
  });

  test('resendVerificationEmail no-ops without currentUser', async () => {
    await authModule.resendVerificationEmail();
    expect(authMocks.sendEmailVerification).not.toHaveBeenCalled();
  });

  test('resendVerificationEmail sends for currentUser', async () => {
    authState.currentUser = { uid: 'u7' };
    authMocks.sendEmailVerification.mockResolvedValueOnce();

    await authModule.resendVerificationEmail();

    expect(authMocks.sendEmailVerification).toHaveBeenCalledWith(
      { uid: 'u7' },
      expect.objectContaining({ url: expect.stringContaining('/dashboard') })
    );
  });

  test('linkGoogleAccount requires current user', async () => {
    await expect(authModule.linkGoogleAccount()).rejects.toThrow(
      'You must be signed in to link accounts.'
    );
  });

  test('linkGoogleAccount links with popup', async () => {
    authState.currentUser = { uid: 'u8' };
    authMocks.linkWithPopup.mockResolvedValueOnce({ user: { uid: 'u8' } });

    const user = await authModule.linkGoogleAccount();

    expect(authMocks.linkWithPopup).toHaveBeenCalledWith(
      authState.currentUser,
      expect.any(Object)
    );
    expect(user).toEqual({ uid: 'u8' });
  });

  test('resetPassword sends password reset when password provider exists', async () => {
    authMocks.fetchSignInMethodsForEmail.mockResolvedValueOnce(['password']);
    authMocks.sendPasswordResetEmail.mockResolvedValueOnce();

    await authModule.resetPassword('Reset@Example.com');

    expect(authMocks.fetchSignInMethodsForEmail).toHaveBeenCalledWith(
      authState,
      'reset@example.com'
    );
    expect(authMocks.sendPasswordResetEmail).toHaveBeenCalled();
  });

  test('resetPassword calls callable when non-password methods exist', async () => {
    const callable = vi.fn().mockResolvedValueOnce({});
    authMocks.fetchSignInMethodsForEmail.mockResolvedValueOnce(['google.com']);
    authMocks.getFunctions.mockReturnValueOnce({ name: 'functions' });
    authMocks.httpsCallable.mockReturnValueOnce(callable);

    await authModule.resetPassword('user@example.com');

    expect(authMocks.httpsCallable).toHaveBeenCalledWith(
      { name: 'functions' },
      'sendPasswordResetInfo'
    );
    expect(callable).toHaveBeenCalledWith({ email: 'user@example.com' });
  });

  test('signOutUser proxies to signOut', async () => {
    authMocks.signOut.mockResolvedValueOnce();

    await authModule.signOutUser();

    expect(authMocks.signOut).toHaveBeenCalledWith(authState);
  });

  test('getGoogleAccessToken returns cached token', async () => {
    sessionStorage.setItem('googleAccessToken', 'cached');

    const token = await authModule.getGoogleAccessToken();

    expect(token).toBe('cached');
    expect(authMocks.signInWithPopup).not.toHaveBeenCalled();
  });

  test('getGoogleAccessToken reauths when currentUser exists', async () => {
    authState.currentUser = { uid: 'u9' };
    authMocks.reauthenticateWithPopup.mockResolvedValueOnce({ user: { uid: 'u9' } });
    authMocks.credentialFromResult.mockReturnValueOnce({ accessToken: 'new-token' });

    const token = await authModule.getGoogleAccessToken({ forceRefresh: true });

    expect(authMocks.reauthenticateWithPopup).toHaveBeenCalledWith(
      authState.currentUser,
      expect.any(Object)
    );
    expect(token).toBe('new-token');
  });
});
