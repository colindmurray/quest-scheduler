import { describe, expect, test } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { NOTIFICATION_EVENTS } = require('./constants');
const { getInAppTemplate, getEmailTemplate } = require('./templates');

describe('notification templates', () => {
  test('poll invite in-app template uses payload snapshots', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.POLL_INVITE_SENT);
    const result = template({
      actor: { displayName: 'Inviter' },
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Snapshot Title' },
    });

    expect(result).toEqual({
      title: 'Session Poll Invite',
      body: 'Inviter invited you to join "Snapshot Title"',
      actionUrl: '/scheduler/poll1',
    });
  });

  test('poll invite email template returns subject/text/html', () => {
    const template = getEmailTemplate(NOTIFICATION_EVENTS.POLL_INVITE_SENT);
    const result = template(
      {
        actor: { email: 'inviter@example.com' },
        resource: { id: 'poll1', title: 'Poll Title' },
      },
      { email: 'invitee@example.com' }
    );

    expect(result.subject).toContain('Poll Title');
    expect(result.text).toContain('inviter@example.com');
    expect(result.html).toContain('Vote on the poll');
  });

  test('poll invite accepted template renders from payload', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.POLL_INVITE_ACCEPTED);
    const result = template({
      actor: { email: 'invitee@example.com' },
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Poll Title' },
    });

    expect(result.title).toBe('Poll Invite Accepted');
    expect(result.body).toContain('invitee@example.com');
  });

  test('poll invite revoked template includes inviter and poll title', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.POLL_INVITE_REVOKED);
    const result = template({
      actor: { displayName: 'Host' },
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Poll Title' },
    });

    expect(result.title).toBe('Poll Invite Revoked');
    expect(result.body).toContain('Host');
    expect(result.body).toContain('Poll Title');
  });

  test('vote submitted template includes actor and poll title', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.VOTE_SUBMITTED);
    const result = template({
      actor: { displayName: 'Voter' },
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Poll Title' },
    });

    expect(result.title).toBe('New Vote Submitted');
    expect(result.body).toContain('Voter');
    expect(result.body).toContain('Poll Title');
  });

  test('poll finalized email template includes winning date', () => {
    const template = getEmailTemplate(NOTIFICATION_EVENTS.POLL_FINALIZED);
    const result = template(
      {
        resource: { id: 'poll1', title: 'Poll Title' },
        payload: { winningDate: 'Jan 1, 2026 · 6:00 PM' },
      },
      { email: 'participant@example.com' }
    );

    expect(result.subject).toContain('Poll Title');
    expect(result.text).toContain('Jan 1, 2026');
  });

  test('slot changed template uses change summary when provided', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.SLOT_CHANGED);
    const result = template({
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Poll Title', changeSummary: '2 slots added' },
    });

    expect(result.title).toBe('Slots Updated');
    expect(result.body).toContain('2 slots added');
  });

  test('friend request template uses actor name', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.FRIEND_REQUEST_SENT);
    const result = template({
      actor: { displayName: 'Requester' },
      resource: { id: 'req1' },
      payload: { requestId: 'req1' },
    });

    expect(result.title).toBe('Friend Request');
    expect(result.body).toContain('Requester');
  });

  test('group invite email template includes group name', () => {
    const template = getEmailTemplate(NOTIFICATION_EVENTS.GROUP_INVITE_SENT);
    const result = template(
      {
        actor: { email: 'leader@example.com' },
        resource: { id: 'group1', title: 'Heroes' },
        payload: { groupName: 'Heroes' },
      },
      { email: 'invitee@example.com' }
    );

    expect(result.subject).toContain('Heroes');
    expect(result.text).toContain('leader@example.com');
  });

  test('group member removed template includes actor and group name', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.GROUP_MEMBER_REMOVED);
    const result = template({
      actor: { displayName: 'Leader' },
      resource: { id: 'group1', title: 'Heroes' },
      payload: { groupName: 'Heroes' },
    });

    expect(result.title).toBe('Removed from Group');
    expect(result.body).toContain('Leader');
    expect(result.body).toContain('Heroes');
  });

  test('vote reminder template includes poll title', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.VOTE_REMINDER);
    const result = template({
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Poll Title' },
    });

    expect(result.title).toBe('Vote Reminder');
    expect(result.body).toContain('Poll Title');
  });

  test('poll ready to finalize template includes poll title', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.POLL_READY_TO_FINALIZE);
    const result = template({
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Poll Title' },
    });

    expect(result.title).toBe('All Votes Are In');
    expect(result.body).toContain('Poll Title');
  });

  test('poll all votes in template includes poll title', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.POLL_ALL_VOTES_IN);
    const result = template({
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Poll Title' },
    });

    expect(result.title).toBe('All Votes Are In');
    expect(result.body).toContain('Poll Title');
  });

  test('poll cancelled template includes poll title', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.POLL_CANCELLED);
    const result = template({
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Poll Title' },
    });

    expect(result.title).toBe('Session Cancelled');
    expect(result.body).toContain('Poll Title');
  });

  test('poll deleted template includes poll title', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.POLL_DELETED);
    const result = template({
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Poll Title' },
    });

    expect(result.title).toBe('Session Deleted');
    expect(result.body).toContain('Poll Title');
  });

  test('group deleted template includes actor and group name', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.GROUP_DELETED);
    const result = template({
      actor: { displayName: 'Leader' },
      resource: { id: 'group1', title: 'Heroes' },
      payload: { groupName: 'Heroes' },
    });

    expect(result.title).toBe('Group Deleted');
    expect(result.body).toContain('Leader');
    expect(result.body).toContain('Heroes');
  });

  test('friend removed template includes actor name', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.FRIEND_REMOVED);
    const result = template({
      actor: { displayName: 'Friend' },
      resource: { id: 'friend1', title: 'Friend' },
    });

    expect(result.title).toBe('Friend Removed');
    expect(result.body).toContain('Friend');
  });

  test('discord nudge template includes poll title', () => {
    const template = getInAppTemplate(NOTIFICATION_EVENTS.DISCORD_NUDGE_SENT);
    const result = template({
      resource: { id: 'poll1', title: 'Poll Title' },
      payload: { pollTitle: 'Poll Title' },
    });

    expect(result.title).toBe('Discord Nudge Sent');
    expect(result.body).toContain('Poll Title');
  });

  test('basic poll in-app templates render title/body/actionUrl', () => {
    const basicPollEvents = [
      NOTIFICATION_EVENTS.BASIC_POLL_CREATED,
      NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED,
      NOTIFICATION_EVENTS.BASIC_POLL_REOPENED,
      NOTIFICATION_EVENTS.BASIC_POLL_VOTE_SUBMITTED,
      NOTIFICATION_EVENTS.BASIC_POLL_REMINDER,
      NOTIFICATION_EVENTS.BASIC_POLL_RESET,
      NOTIFICATION_EVENTS.BASIC_POLL_REMOVED,
      NOTIFICATION_EVENTS.BASIC_POLL_DEADLINE_CHANGED,
      NOTIFICATION_EVENTS.BASIC_POLL_REQUIRED_CHANGED,
      NOTIFICATION_EVENTS.BASIC_POLL_RESULTS,
      NOTIFICATION_EVENTS.BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES,
    ];

    basicPollEvents.forEach((eventType) => {
      const template = getInAppTemplate(eventType);
      expect(template).toBeTypeOf('function');
      const result = template({
        actor: { displayName: 'Host', email: 'host@example.com' },
        resource: { id: 'basicPoll1', title: 'Food vote' },
        payload: {
          parentType: 'group',
          parentId: 'group1',
          basicPollTitle: 'Food vote',
          resultSummary: 'Pizza won.',
          deadlineLabel: 'Now closes Friday.',
          required: true,
          missingCount: 2,
          resultsSummary: 'Pizza 4, Subs 2',
        },
      });

      expect(result.title).toBeTruthy();
      expect(result.body).toBeTruthy();
      expect(result.actionUrl).toBe('/groups/group1/polls/basicPoll1');
    });
  });

  test('basic poll email template returns subject/text/html', () => {
    const template = getEmailTemplate(NOTIFICATION_EVENTS.BASIC_POLL_RESULTS);
    const result = template(
      {
        actor: { displayName: 'Host' },
        resource: { id: 'basicPoll1', title: 'Food vote' },
        payload: {
          parentType: 'group',
          parentId: 'group1',
          basicPollTitle: 'Food vote',
          resultsSummary: 'Pizza 4, Subs 2',
        },
      },
      { email: 'recipient@example.com' }
    );

    expect(result.subject).toContain('Food vote');
    expect(result.text).toContain('Pizza 4, Subs 2');
    expect(result.html).toContain('View results');
  });
});
