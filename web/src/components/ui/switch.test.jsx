import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Switch } from './switch';

describe('Switch', () => {
  test('renders a checked switch', () => {
    render(<Switch defaultChecked aria-label="Notify me" />);
    const toggle = screen.getByRole('switch', { name: 'Notify me' });

    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('data-state')).toBe('checked');
  });
});
