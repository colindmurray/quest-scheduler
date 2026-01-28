import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

describe('Select', () => {
  test('renders items when open', () => {
    if (!window.HTMLElement.prototype.scrollIntoView) {
      window.HTMLElement.prototype.scrollIntoView = () => {};
    }
    render(
      <Select open value="alpha" onValueChange={vi.fn()}>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="alpha">Alpha</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByRole('option', { name: 'Alpha' })).toBeTruthy();
  });
});
