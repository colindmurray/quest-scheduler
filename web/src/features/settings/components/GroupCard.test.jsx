import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../hooks/useUserProfiles', () => ({
  useUserProfiles: () => ({
    enrichUsers: (users = []) => users.map((email) => ({ email })),
    getAvatar: () => null,
  }),
}));

vi.mock('../../../lib/data/discord', () => ({
  generateDiscordLinkCode: vi.fn(),
  fetchDiscordGuildRoles: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { GroupCard } from './GroupCard';

describe('GroupCard', () => {
  beforeEach(() => {
  });

  function renderGroupCard(overrides = {}) {
    const group = {
      id: 'g1',
      name: 'Test Group',
      members: [],
      memberIds: ['uid-1', 'uid-2', 'uid-3'],
      pendingInvites: [],
      ...overrides.group,
    };

    return render(
      <GroupCard
        group={group}
        isOwner={overrides.isOwner ?? true}
        canManage={overrides.canManage ?? true}
        groupColor="#123456"
        onColorChange={vi.fn()}
        onInviteMember={vi.fn()}
        onRemoveMember={vi.fn()}
        onLeaveGroup={vi.fn()}
        onDeleteGroup={vi.fn()}
        onUpdateGroup={vi.fn()}
        onRevokeInvite={vi.fn()}
        friends={[]}
      />
    );
  }

  test('shows warning about private channel permissions', () => {
    renderGroupCard();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(
      screen.getByText(/Private channels require adding the Quest Scheduler bot role/i)
    ).toBeTruthy();
  });

  test('shows all votes in discord alert toggle when linked', () => {
    renderGroupCard({
      group: {
        id: 'g2',
        discord: { channelId: 'chan1', guildId: 'guild1' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByText(/All votes are in/i)).toBeTruthy();
  });

  test('does not render polls section or create poll action', () => {
    renderGroupCard();

    expect(screen.queryByText('Polls')).toBeNull();
    expect(screen.queryByText('Open polls')).toBeNull();
    expect(screen.queryByText('Recent finalized')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create poll' })).toBeNull();
  });
});
