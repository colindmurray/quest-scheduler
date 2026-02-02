import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

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
  test('shows warning about private channel permissions', () => {
    render(
      <GroupCard
        group={{ id: 'g1', name: 'Test Group', members: [], pendingInvites: [] }}
        isOwner={true}
        canManage={true}
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

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(
      screen.getByText(/Private channels require adding the Quest Scheduler bot role/i)
    ).toBeTruthy();
  });

  test('shows all votes in discord alert toggle when linked', () => {
    render(
      <GroupCard
        group={{
          id: 'g2',
          name: 'Test Group',
          members: [],
          pendingInvites: [],
          discord: { channelId: 'chan1', guildId: 'guild1' },
        }}
        isOwner={true}
        canManage={true}
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

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByText(/All votes are in/i)).toBeTruthy();
  });
});
