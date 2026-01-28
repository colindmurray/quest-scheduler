import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Calendar } from './calendar';

describe('Calendar', () => {
  test('renders a day grid', () => {
    render(<Calendar month={new Date(2025, 0, 1)} />);

    expect(screen.getByRole('grid')).toBeTruthy();
  });
});
