import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { PollStatusMeta } from './poll-status-meta';

describe('PollStatusMeta', () => {
  test('uses displayTimeZone for slot range labels', () => {
    render(
      <PollStatusMeta
        scheduler={{ status: 'OPEN', timezone: 'UTC' }}
        slots={[
          { start: '2026-02-17T18:00:00Z' },
          { start: '2026-02-18T18:00:00Z' },
        ]}
        allVotesIn={false}
        displayTimeZone="America/New_York"
      />
    );

    expect(screen.getByText(/EST/)).toBeTruthy();
  });
});
