import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Popover, PopoverContent, PopoverTrigger } from './popover';

describe('Popover', () => {
  test('renders content when open', () => {
    render(
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Popover content</PopoverContent>
      </Popover>
    );

    expect(screen.getByText('Popover content')).toBeTruthy();
  });
});
