import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { AvatarStack, UserAvatar } from './avatar';

describe('UserAvatar', () => {
  test('renders image and fallback initial', () => {
    render(
      <UserAvatar email="test@example.com" src="https://example.com/avatar.png" />
    );

    expect(screen.getByText('T')).toBeTruthy();
  });
});

describe('AvatarStack', () => {
  test('renders extra count when exceeding max', () => {
    const users = [
      { email: 'one@example.com', avatar: '' },
      { email: 'two@example.com', avatar: '' },
      { email: 'three@example.com', avatar: '' },
    ];
    render(<AvatarStack users={users} max={2} size={20} />);

    expect(screen.getByText('+1')).toBeTruthy();
  });
});
