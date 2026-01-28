import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../../hooks/useQuestingGroups', () => ({
  useQuestingGroups: () => ({
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
  }),
}));

vi.mock('../../hooks/useFriends', () => ({
  useFriends: () => ({
    acceptFriendRequest: vi.fn(),
    declineFriendRequest: vi.fn(),
  }),
}));

vi.mock('../../hooks/usePollInvites', () => ({
  usePollInvites: () => ({
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
  }),
}));

vi.mock('../../hooks/useUserProfiles', () => ({
  useUserProfiles: () => ({ profiles: {} }),
  useUserProfilesByIds: () => ({ profiles: {} }),
}));

import { NotificationDropdown } from './notification-dropdown';
import { NOTIFICATION_TYPES } from '../../lib/data/notifications';

describe('NotificationDropdown', () => {
  test('renders empty state when no notifications', () => {
    render(
      <NotificationDropdown
        notifications={[]}
        loading={false}
        onMarkRead={vi.fn()}
        onDismiss={vi.fn()}
        onMarkAllRead={vi.fn()}
        onDismissAll={vi.fn()}
        onRemoveLocal={vi.fn()}
      />
    );

    expect(screen.getByText('No notifications')).toBeTruthy();
    expect(screen.getByText("You're all caught up!")).toBeTruthy();
  });

  test('renders friend request actions', () => {
    render(
      <NotificationDropdown
        notifications={[
          {
            id: 'notif-1',
            type: NOTIFICATION_TYPES.FRIEND_REQUEST,
            title: 'Friend request',
            body: 'Friend request',
            read: false,
            createdAt: { toDate: () => new Date() },
            metadata: { fromEmail: 'friend@example.com', requestId: 'req-1' },
          },
        ]}
        loading={false}
        onMarkRead={vi.fn()}
        onDismiss={vi.fn()}
        onMarkAllRead={vi.fn()}
        onDismissAll={vi.fn()}
        onRemoveLocal={vi.fn()}
      />
    );

    expect(screen.getByText('Accept')).toBeTruthy();
    expect(screen.getByText('Decline')).toBeTruthy();
  });
});
