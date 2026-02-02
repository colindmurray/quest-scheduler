import { describe, expect, test } from 'vitest';
import { buildPublicIdentifier, getUserAvatarUrl, getUserIdentity, getUserLabel } from './identity';

describe('buildPublicIdentifier', () => {
  test('returns publicIdentifier when provided', () => {
    expect(
      buildPublicIdentifier({
        publicIdentifier: '@override',
        publicIdentifierType: 'qsUsername',
        qsUsername: 'ignored',
      })
    ).toBe('@override');
  });

  test('returns qs username when type is qsUsername', () => {
    expect(
      buildPublicIdentifier({
        publicIdentifierType: 'qsUsername',
        qsUsername: 'quester',
        email: 'quester@example.com',
      })
    ).toBe('@quester');
  });

  test('returns discord username when type is discordUsername', () => {
    expect(
      buildPublicIdentifier({
        publicIdentifierType: 'discordUsername',
        discordUsername: 'discordy',
        email: 'discordy@example.com',
      })
    ).toBe('discordy');
  });

  test('falls back to email when no type match', () => {
    expect(
      buildPublicIdentifier({
        publicIdentifierType: 'unknown',
        email: 'user@example.com',
      })
    ).toBe('user@example.com');
  });

  test('returns empty string when no data is provided', () => {
    expect(buildPublicIdentifier()).toBe('');
  });
});

describe('getUserIdentity', () => {
  test('uses display name when distinct from public identifier', () => {
    expect(
      getUserIdentity({
        displayName: 'Cora',
        publicIdentifierType: 'qsUsername',
        qsUsername: 'cora',
        email: 'cora@example.com',
      }).label
    ).toBe('Cora');
  });

  test('falls back to public identifier when display name missing', () => {
    expect(
      getUserIdentity({
        publicIdentifierType: 'discordUsername',
        discordUsername: 'quester',
        email: 'quester@example.com',
      }).label
    ).toBe('quester');
  });

  test('avoids duplicate display name and public identifier', () => {
    expect(
      getUserIdentity({
        displayName: 'user@example.com',
        publicIdentifierType: 'email',
        email: 'user@example.com',
      }).label
    ).toBe('user@example.com');
  });
});

describe('getUserLabel', () => {
  test('returns empty string when no identity data', () => {
    expect(getUserLabel()).toBe('');
  });
});

describe('getUserAvatarUrl', () => {
  test('prefers explicit avatar fields', () => {
    expect(
      getUserAvatarUrl({
        avatar: 'https://example.com/primary.png',
        photoURL: 'https://example.com/fallback.png',
      })
    ).toBe('https://example.com/primary.png');
  });

  test('falls back to photo URL when avatar missing', () => {
    expect(
      getUserAvatarUrl({
        photoURL: 'https://example.com/fallback.png',
      })
    ).toBe('https://example.com/fallback.png');
  });
});
