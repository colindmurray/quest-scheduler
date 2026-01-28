import { describe, expect, test } from 'vitest';
import { buildPublicIdentifier } from './identity';

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
