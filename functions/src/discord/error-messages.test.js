import { describe, expect, test } from 'vitest';
import { ERROR_MESSAGES, buildUserNotLinkedMessage } from './error-messages';

describe('discord error messages', () => {
  test('buildUserNotLinkedMessage includes settings url', () => {
    const message = buildUserNotLinkedMessage('https://app.example.com/');
    expect(message).toContain('https://app.example.com/settings');
  });

  test('ERROR_MESSAGES exposes expected defaults', () => {
    expect(ERROR_MESSAGES.pollNotFound).toContain('poll');
    expect(ERROR_MESSAGES.missingPollId).toBe('Missing poll id.');
  });
});
