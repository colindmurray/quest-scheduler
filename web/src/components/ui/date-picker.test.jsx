import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  test('shows placeholder when no date selected', () => {
    render(<DatePicker date={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Pick a date')).toBeTruthy();
  });

  test('shows formatted date when selected', () => {
    const date = new Date(2025, 0, 15);
    render(<DatePicker date={date} onSelect={vi.fn()} />);

    expect(screen.getByText('Jan 15, 2025')).toBeTruthy();
  });
});
