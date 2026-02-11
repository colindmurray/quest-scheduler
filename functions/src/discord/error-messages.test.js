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
    expect(ERROR_MESSAGES.noLinkedGroupForPoll).toContain('/link-group');
    expect(ERROR_MESSAGES.notGroupManager).toContain('group managers');
    expect(ERROR_MESSAGES.tooFewOptions).toContain('at least 2 options');
    expect(ERROR_MESSAGES.tooManyOptionsDiscord).toContain('up to 25 options');
    expect(ERROR_MESSAGES.writeInNotRanked).toContain('ranked-choice');
    expect(ERROR_MESSAGES.deadlineInPast).toContain('future');
    expect(ERROR_MESSAGES.pollAlreadyFinalized).toContain('already finalized');
    expect(ERROR_MESSAGES.pollTieBreakWeb).toContain('finalize on the web');
    expect(ERROR_MESSAGES.basicPollNotFound).toContain('no longer exists');
    expect(ERROR_MESSAGES.basicPollClosed).toContain('Voting is closed');
  });
});
