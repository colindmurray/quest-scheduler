import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from './dropdown-menu';

describe('DropdownMenu', () => {
  test('renders menu content when open', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem>Invite</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    expect(screen.getByText('Actions')).toBeTruthy();
    expect(screen.getByText('Invite')).toBeTruthy();
  });
});
