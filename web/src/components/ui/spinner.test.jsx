import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { LoadingState, Spinner } from './spinner';

describe('Spinner', () => {
  test('uses default size classes when no size provided', () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector('div');

    expect(spinner).toBeTruthy();
    expect(spinner.className).toContain('animate-spin');
    expect(spinner.className).toContain('h-6');
    expect(spinner.className).toContain('w-6');
  });

  test('LoadingState renders message', () => {
    render(<LoadingState message="Loading data" />);
    expect(screen.getByText('Loading data')).toBeTruthy();
  });
});
