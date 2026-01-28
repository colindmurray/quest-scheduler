import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { UserIdentity } from './UserIdentity';

describe('UserIdentity', () => {
  test('renders display name with public identifier when both differ', () => {
    render(
      <UserIdentity
        user={{ displayName: 'Cora', email: 'cora@example.com' }}
      />
    );

    expect(screen.getByText('Cora')).toBeTruthy();
    expect(screen.getByText('(cora@example.com)')).toBeTruthy();
  });

  test('hides duplicate identifier when display matches', () => {
    render(
      <UserIdentity
        user={{ displayName: 'cora@example.com', email: 'cora@example.com' }}
      />
    );

    expect(screen.getByText('cora@example.com')).toBeTruthy();
    expect(screen.queryByText('(cora@example.com)')).toBeNull();
  });

  test('renders display name only when identifiers hidden', () => {
    render(
      <UserIdentity
        showIdentifier={false}
        user={{ displayName: 'Cora', email: 'cora@example.com' }}
      />
    );

    expect(screen.getByText('Cora')).toBeTruthy();
    expect(screen.queryByText('(cora@example.com)')).toBeNull();
  });
});
