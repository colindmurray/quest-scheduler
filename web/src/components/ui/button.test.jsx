import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  test('renders a default button', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: 'Click me' });

    expect(button).toBeTruthy();
    expect(button.className).toContain('bg-brand-primary');
  });

  test('renders as child element when requested', () => {
    render(
      <Button asChild className="custom-class">
        <a href="/settings">Settings</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: 'Settings' });

    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link.className).toContain('custom-class');
    expect(link.className).toContain('bg-brand-primary');
  });
});
