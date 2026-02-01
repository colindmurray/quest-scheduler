import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { AvatarBubble, AvatarStack, VotingAvatarStack } from './voter-avatars';

describe('AvatarBubble', () => {
  test('renders image when avatar provided', () => {
    render(
      <AvatarBubble email="hero@example.com" avatar="https://example.com/hero.png" />
    );

    expect(screen.getByAltText('hero@example.com')).toBeTruthy();
  });

  test('renders initial when avatar missing', () => {
    render(<AvatarBubble email="hero@example.com" avatar="" />);
    expect(screen.getByText('H')).toBeTruthy();
  });
});

describe('AvatarStack', () => {
  test('renders extra count for overflow', () => {
    render(
      <AvatarStack
        users={[
          { email: 'one@example.com' },
          { email: 'two@example.com' },
          { email: 'three@example.com' },
        ]}
        max={2}
      />
    );

    expect(screen.getByText('+1')).toBeTruthy();
  });
});

describe('VotingAvatarStack', () => {
  test('defaults to showing 10 before overflow', () => {
    const users = Array.from({ length: 11 }, (_, index) => ({
      email: `user${index}@example.com`,
    }));

    render(<VotingAvatarStack users={users} />);

    expect(screen.getByText('+1')).toBeTruthy();
  });
});
