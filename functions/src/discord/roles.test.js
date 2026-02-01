import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'module';

const fetchGuildRoles = vi.fn();
let roles;

let groupSnap = { exists: true, data: () => ({ creatorId: 'user1' }) };

const groupGet = vi.fn(async () => groupSnap);
const collectionMock = vi.fn(() => ({ doc: () => ({ get: groupGet }) }));

const firestoreDb = {
  collection: collectionMock,
};

const firestoreNamespace = {
  FieldValue: {
    serverTimestamp: vi.fn(() => 'server-time'),
  },
};

describe('discord roles listing', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    groupSnap = { exists: true, data: () => ({ creatorId: 'user1' }) };

    const require = createRequire(import.meta.url);
    require.cache[require.resolve('./config')] = {
      exports: {
        DISCORD_REGION: 'us-central1',
        DISCORD_BOT_TOKEN: { value: () => 'token' },
        DISCORD_NOTIFICATION_DEFAULTS: {
          finalizationEvents: true,
          slotChanges: true,
          voteSubmitted: false,
        },
        default: {
          DISCORD_REGION: 'us-central1',
          DISCORD_BOT_TOKEN: { value: () => 'token' },
          DISCORD_NOTIFICATION_DEFAULTS: {
            finalizationEvents: true,
            slotChanges: true,
            voteSubmitted: false,
          },
        },
      },
    };
    require.cache[require.resolve('./discord-client')] = {
      exports: {
        fetchGuildRoles,
      },
    };
    const adminModule = await import('firebase-admin');
    const admin = adminModule.default || adminModule;
    vi.spyOn(admin, 'initializeApp').mockImplementation(() => ({}));
    vi.spyOn(admin, 'apps', 'get').mockReturnValue([]);
    vi.spyOn(admin, 'firestore').mockReturnValue(firestoreDb);
    admin.firestore.FieldValue = firestoreNamespace.FieldValue;

    roles = await import('./roles');
  });

  test('requires authentication', async () => {
    await expect(
      roles.discordListGuildRoles.run({ data: { groupId: 'g1' }, auth: null })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  test('requires groupId', async () => {
    await expect(
      roles.discordListGuildRoles.run({ data: {}, auth: { uid: 'user1' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('errors when group missing', async () => {
    groupSnap = { exists: false };
    await expect(
      roles.discordListGuildRoles.run({ data: { groupId: 'g1' }, auth: { uid: 'user1' } })
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  test('errors when user is not manager', async () => {
    groupSnap = {
      exists: true,
      data: () => ({ creatorId: 'other', memberManaged: false, memberIds: [] }),
    };

    await expect(
      roles.discordListGuildRoles.run({ data: { groupId: 'g1' }, auth: { uid: 'user1' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('returns empty roles when guildId missing', async () => {
    groupSnap = {
      exists: true,
      data: () => ({ creatorId: 'user1', discord: { notifyRoleId: 'role1' } }),
    };

    const result = await roles.discordListGuildRoles.run({
      data: { groupId: 'g1' },
      auth: { uid: 'user1' },
    });

    expect(result).toEqual({ roles: [], notifyRoleId: 'role1' });
  });

  test('maps and dedupes guild roles', async () => {
    groupSnap = {
      exists: true,
      data: () => ({ creatorId: 'user1', discord: { guildId: 'guild1' } }),
    };
    fetchGuildRoles.mockResolvedValueOnce([
      { id: 'guild1', name: '@everyone' },
      { id: 'role2', name: 'Raiders' },
    ]);

    const result = await roles.discordListGuildRoles.run({
      data: { groupId: 'g1' },
      auth: { uid: 'user1' },
    });

    expect(fetchGuildRoles).toHaveBeenCalledWith({ guildId: 'guild1' });
    expect(result.roles).toEqual([
      { id: 'none', name: 'No ping' },
      { id: 'everyone', name: '@everyone' },
      { id: 'role2', name: 'Raiders' },
    ]);
    expect(result.notifyRoleId).toBe('everyone');
  });
});
