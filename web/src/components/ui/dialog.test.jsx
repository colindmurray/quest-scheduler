import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog';

describe('Dialog', () => {
  test('renders dialog content when open', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite players</DialogTitle>
            <DialogDescription>Share this link with your party.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByText('Invite players')).toBeTruthy();
    expect(screen.getByText('Share this link with your party.')).toBeTruthy();
  });
});
