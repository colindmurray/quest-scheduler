import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 5,
    loading: false,
    markRead: vi.fn(),
    dismiss: vi.fn(),
    markAllRead: vi.fn(),
    dismissAll: vi.fn(),
    removeLocal: vi.fn(),
  }),
}));

vi.mock('./notification-dropdown', () => ({
  NotificationDropdown: () => <div>Notifications</div>,
}));

import { NotificationBell } from './notification-bell';

describe('NotificationBell', () => {
  test('shows unread count in badge', () => {
    render(<NotificationBell />);

    expect(screen.getByRole('button', { name: 'Notifications (5 unread)' })).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });
});
