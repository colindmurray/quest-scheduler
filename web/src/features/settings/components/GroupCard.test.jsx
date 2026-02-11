import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { mockSubscribeToGroupPolls, mockSubscribeToBasicPollVotes } = vi.hoisted(() => ({
  mockSubscribeToGroupPolls: vi.fn(),
  mockSubscribeToBasicPollVotes: vi.fn(),
}));
const { mockCreateBasicPoll } = vi.hoisted(() => ({
  mockCreateBasicPoll: vi.fn(),
}));

vi.mock('../../../hooks/useUserProfiles', () => ({
  useUserProfiles: () => ({
    enrichUsers: (users = []) => users.map((email) => ({ email })),
    getAvatar: () => null,
  }),
}));

vi.mock('../../../app/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user-1', email: 'member@example.com' } }),
}));

vi.mock('../../../lib/data/discord', () => ({
  generateDiscordLinkCode: vi.fn(),
  fetchDiscordGuildRoles: vi.fn(),
}));

vi.mock('../../../lib/data/basicPolls', () => ({
  subscribeToGroupPolls: (...args) => mockSubscribeToGroupPolls(...args),
  subscribeToBasicPollVotes: (...args) => mockSubscribeToBasicPollVotes(...args),
  createBasicPoll: (...args) => mockCreateBasicPoll(...args),
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
    mockSubscribeToGroupPolls.mockReset();
    mockSubscribeToBasicPollVotes.mockReset();
    mockCreateBasicPoll.mockReset();
    mockSubscribeToGroupPolls.mockImplementation((_groupId, onUpdate) => {
      onUpdate([]);
      return () => {};
    });
    mockSubscribeToBasicPollVotes.mockImplementation((_type, _groupId, _pollId, onUpdate) => {
      onUpdate([]);
      return () => {};
    });
    mockCreateBasicPoll.mockResolvedValue('poll-created');
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

  test('renders group polls section with open and finalized links', () => {
    mockSubscribeToGroupPolls.mockImplementation((_groupId, onUpdate) => {
      onUpdate([
        {
          id: 'p-open',
          title: 'Open Food Vote',
          status: 'OPEN',
          settings: { voteType: 'MULTIPLE_CHOICE' },
        },
        {
          id: 'p-final',
          title: 'Final Theme Vote',
          status: 'FINALIZED',
          settings: { voteType: 'RANKED_CHOICE' },
          finalizedAt: new Date('2026-02-10T18:30:00.000Z'),
        },
      ]);
      return () => {};
    });
    mockSubscribeToBasicPollVotes.mockImplementation((_type, _groupId, pollId, onUpdate) => {
      if (pollId === 'p-open') {
        onUpdate([{ id: 'u1', optionIds: ['opt-1'] }]);
      } else {
        onUpdate([{ id: 'u2', rankings: ['opt-a', 'opt-b'] }]);
      }
      return () => {};
    });

    renderGroupCard();

    expect(screen.getByText('Open polls')).toBeTruthy();
    expect(screen.getByText('Recent finalized')).toBeTruthy();
    expect(screen.getByText('1/3 voted')).toBeTruthy();

    const openLink = screen.getByRole('link', { name: /Open Food Vote/i });
    expect(openLink.getAttribute('href')).toBe('/groups/g1/polls/p-open');

    const finalizedLink = screen.getByRole('link', { name: /Final Theme Vote/i });
    expect(finalizedLink.getAttribute('href')).toBe('/groups/g1/polls/p-final');
  });

  test('opens create poll modal from the polls section', () => {
    renderGroupCard();

    fireEvent.click(screen.getByRole('button', { name: 'Create poll' }));

    expect(screen.getAllByText('Create poll').length).toBeGreaterThan(0);
    expect(screen.getByText(/Create a standalone poll/i)).toBeTruthy();
  });

  test('creates a poll from the modal and shows it in the group poll list', async () => {
    let publishPolls = null;
    const polls = [];

    mockSubscribeToGroupPolls.mockImplementation((_groupId, onUpdate) => {
      publishPolls = onUpdate;
      onUpdate(polls);
      return () => {};
    });
    mockCreateBasicPoll.mockImplementation(async (_groupId, pollData) => {
      polls.unshift({ id: 'p-created', ...pollData, createdAt: new Date('2026-02-11T12:00:00.000Z') });
      if (publishPolls) publishPolls([...polls]);
      return 'p-created';
    });

    renderGroupCard();

    fireEvent.click(screen.getByRole('button', { name: 'Create poll' }));
    fireEvent.change(screen.getByPlaceholderText('What should we decide?'), {
      target: { value: 'Snack vote' },
    });

    const optionInputs = screen.getAllByPlaceholderText(/Option /i);
    fireEvent.change(optionInputs[0], { target: { value: 'Pizza' } });
    fireEvent.change(optionInputs[1], { target: { value: 'Tacos' } });

    fireEvent.click(screen.getAllByRole('button', { name: 'Create poll' })[1]);

    await waitFor(() => expect(mockCreateBasicPoll).toHaveBeenCalledTimes(1));
    expect(mockCreateBasicPoll).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({
        title: 'Snack vote',
        status: 'OPEN',
      }),
      { useServer: true }
    );

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Snack vote/i });
      expect(link.getAttribute('href')).toBe('/groups/g1/polls/p-created');
    });
  });
});
