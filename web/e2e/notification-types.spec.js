import { expect, test } from '@playwright/test';
import { applyAutoClear, createNotification } from './fixtures/emit-notification-event';
import { testUsers } from './fixtures/test-users';

async function loginAs(page, user) {
  await page.goto('/auth');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.locator('form').getByRole('button', { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
}

async function openNotifications(page) {
  const menu = page.getByRole('menu');
  if (await menu.count()) {
    return menu;
  }
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(menu).toBeVisible();
  return menu;
}

async function clearAllNotifications(page) {
  const menu = await openNotifications(page);
  const clearAll = menu.getByRole('button', { name: /Clear all/i });
  if (await clearAll.count()) {
    await clearAll.click();
    await expect(menu.getByText('No notifications', { exact: true })).toBeVisible();
  }
  return menu;
}

async function dismissNotification(menu, title) {
  const item = menu
    .getByText(title, { exact: true })
    .locator('xpath=ancestor::div[./button[@aria-label="Dismiss notification"]][1]');
  await expect(item).toBeVisible();
  const dismissButton = item.getByLabel('Dismiss notification');
  await expect(dismissButton).toBeVisible();
  await dismissButton.click();
  await expect(item).toHaveCount(0);
}

const titleMap = {
  POLL_CREATED: 'Session Poll Created',
  POLL_INVITE_SENT: 'Session Poll Invite',
  POLL_INVITE_ACCEPTED: 'Poll Invite Accepted',
  POLL_INVITE_DECLINED: 'Poll Invite Declined',
  POLL_INVITE_REVOKED: 'Poll Invite Revoked',
  VOTE_SUBMITTED: 'New Vote Submitted',
  VOTE_REMINDER: 'Vote Reminder',
  POLL_READY_TO_FINALIZE: 'All Votes Are In',
  POLL_ALL_VOTES_IN: 'All Votes Are In',
  POLL_FINALIZED: 'Session Finalized',
  POLL_REOPENED: 'Poll Reopened',
  POLL_CANCELLED: 'Session Cancelled',
  POLL_RESTORED: 'Session Restored',
  POLL_DELETED: 'Session Deleted',
  SLOT_CHANGED: 'Slots Updated',
  DISCORD_NUDGE_SENT: 'Discord Nudge Sent',
  FRIEND_REQUEST_SENT: 'Friend Request',
  FRIEND_REQUEST_ACCEPTED: 'Friend Request Accepted',
  FRIEND_REQUEST_DECLINED: 'Friend Request Declined',
  FRIEND_REMOVED: 'Friend Removed',
  GROUP_INVITE_SENT: 'Group Invitation',
  GROUP_INVITE_ACCEPTED: 'Group Invite Accepted',
  GROUP_INVITE_DECLINED: 'Group Invite Declined',
  GROUP_MEMBER_REMOVED: 'Removed from Group',
  GROUP_MEMBER_LEFT: 'Group Member Left',
  GROUP_DELETED: 'Group Deleted',
  BASIC_POLL_CREATED: 'Basic Poll Created',
  BASIC_POLL_FINALIZED: 'Basic Poll Finalized',
  BASIC_POLL_REOPENED: 'Basic Poll Reopened',
  BASIC_POLL_VOTE_SUBMITTED: 'Basic Poll Vote Submitted',
  BASIC_POLL_REMINDER: 'Basic Poll Reminder',
  BASIC_POLL_RESET: 'Basic Poll Reset',
  BASIC_POLL_REMOVED: 'Basic Poll Removed',
  BASIC_POLL_DEADLINE_CHANGED: 'Basic Poll Deadline Updated',
  BASIC_POLL_REQUIRED_CHANGED: 'Basic Poll Requirement Changed',
  BASIC_POLL_RESULTS: 'Basic Poll Results',
  BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES: 'Finalized With Missing Required Votes',
};

const buildEvent = ({
  eventType,
  resourceType,
  resourceId,
  resourceTitle,
  actor,
  recipients,
  payload,
}) => ({
  eventType,
  resource: { type: resourceType, id: resourceId, title: resourceTitle },
  actor,
  recipients,
  payload,
  dedupeKey: `e2e:${eventType}:${resourceId}`,
});

test.describe.serial('Notification coverage', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Notification coverage runs on chromium only.');
  });

  test('renders every notification type', async ({ page }) => {
    test.setTimeout(60000);
    await loginAs(page, testUsers.notifier);
    await clearAllNotifications(page);

    const actor = {
      uid: testUsers.owner.uid,
      email: testUsers.owner.email,
      displayName: testUsers.owner.displayName,
    };
    const userId = testUsers.notifier.uid;

    const cases = [
      { eventType: 'POLL_CREATED', resourceType: 'poll' },
      { eventType: 'POLL_INVITE_SENT', resourceType: 'poll', resourceId: null },
      { eventType: 'POLL_INVITE_ACCEPTED', resourceType: 'poll' },
      { eventType: 'POLL_INVITE_DECLINED', resourceType: 'poll' },
      { eventType: 'POLL_INVITE_REVOKED', resourceType: 'poll' },
      { eventType: 'VOTE_SUBMITTED', resourceType: 'poll' },
      { eventType: 'VOTE_REMINDER', resourceType: 'poll' },
      { eventType: 'POLL_READY_TO_FINALIZE', resourceType: 'poll' },
      { eventType: 'POLL_ALL_VOTES_IN', resourceType: 'poll' },
      { eventType: 'POLL_FINALIZED', resourceType: 'poll' },
      { eventType: 'POLL_REOPENED', resourceType: 'poll' },
      { eventType: 'POLL_CANCELLED', resourceType: 'poll' },
      { eventType: 'POLL_RESTORED', resourceType: 'poll' },
      { eventType: 'POLL_DELETED', resourceType: 'poll' },
      { eventType: 'SLOT_CHANGED', resourceType: 'poll' },
      { eventType: 'DISCORD_NUDGE_SENT', resourceType: 'poll' },
      { eventType: 'FRIEND_REQUEST_SENT', resourceType: 'friend', resourceId: null },
      { eventType: 'FRIEND_REQUEST_ACCEPTED', resourceType: 'friend' },
      { eventType: 'FRIEND_REQUEST_DECLINED', resourceType: 'friend' },
      { eventType: 'FRIEND_REMOVED', resourceType: 'friend' },
      { eventType: 'GROUP_INVITE_SENT', resourceType: 'group', resourceId: null },
      { eventType: 'GROUP_INVITE_ACCEPTED', resourceType: 'group' },
      { eventType: 'GROUP_INVITE_DECLINED', resourceType: 'group' },
      { eventType: 'GROUP_MEMBER_REMOVED', resourceType: 'group' },
      { eventType: 'GROUP_MEMBER_LEFT', resourceType: 'group' },
      { eventType: 'GROUP_DELETED', resourceType: 'group' },
      { eventType: 'BASIC_POLL_CREATED', resourceType: 'basicPoll' },
      { eventType: 'BASIC_POLL_FINALIZED', resourceType: 'basicPoll' },
      { eventType: 'BASIC_POLL_REOPENED', resourceType: 'basicPoll' },
      { eventType: 'BASIC_POLL_VOTE_SUBMITTED', resourceType: 'basicPoll' },
      { eventType: 'BASIC_POLL_REMINDER', resourceType: 'basicPoll' },
      { eventType: 'BASIC_POLL_RESET', resourceType: 'basicPoll' },
      { eventType: 'BASIC_POLL_REMOVED', resourceType: 'basicPoll' },
      { eventType: 'BASIC_POLL_DEADLINE_CHANGED', resourceType: 'basicPoll' },
      { eventType: 'BASIC_POLL_REQUIRED_CHANGED', resourceType: 'basicPoll' },
      { eventType: 'BASIC_POLL_RESULTS', resourceType: 'basicPoll' },
      {
        eventType: 'BASIC_POLL_FINALIZED_WITH_MISSING_REQUIRED_VOTES',
        resourceType: 'basicPoll',
      },
    ];

    for (const entry of cases) {
      const fallbackId = `notif-${entry.eventType.toLowerCase()}`;
      const resourceId = Object.prototype.hasOwnProperty.call(entry, 'resourceId')
        ? entry.resourceId
        : fallbackId;
      const requestId = resourceId || `req-${entry.eventType.toLowerCase()}`;
      const pollId = resourceId || `poll-${entry.eventType.toLowerCase()}`;
      const resourceTitle = `${entry.resourceType.toUpperCase()} ${entry.eventType}`;

      await createNotification({
        eventType: entry.eventType,
        userId,
        event: buildEvent({
          eventType: entry.eventType,
          resourceType: entry.resourceType,
          resourceId,
          resourceTitle,
          actor,
          recipients: { userIds: [userId], emails: [] },
          payload: {
            pollTitle: resourceTitle,
            groupName: resourceTitle,
            requestId,
            pollId,
            basicPollTitle:
              entry.resourceType === 'basicPoll' ? resourceTitle : undefined,
            basicPollId:
              entry.resourceType === 'basicPoll' ? resourceId : undefined,
            parentType:
              entry.resourceType === 'basicPoll' ? 'group' : undefined,
            parentId:
              entry.resourceType === 'basicPoll' ? 'e2e-group-owner' : undefined,
          },
        }),
      });

      const menu = await openNotifications(page);
      const expectedTitle = titleMap[entry.eventType];
      await expect(menu.getByText(expectedTitle, { exact: true })).toBeVisible({ timeout: 15000 });
      await dismissNotification(menu, expectedTitle);
    }
  });

  test('auto-clear rules remove stale notifications', async ({ page }) => {
    await loginAs(page, testUsers.notifier);
    await clearAllNotifications(page);

    const actor = {
      uid: testUsers.notifier.uid,
      email: testUsers.notifier.email,
      displayName: testUsers.notifier.displayName,
    };

    const scenarios = [
      {
        name: 'poll invite accepted clears invite',
        resourceType: 'poll',
        resourceId: 'auto-poll-invite-accepted',
        initial: 'POLL_INVITE_SENT',
        clear: 'POLL_INVITE_ACCEPTED',
        actorScope: true,
      },
      {
        name: 'poll invite declined clears invite',
        resourceType: 'poll',
        resourceId: 'auto-poll-invite-declined',
        initial: 'POLL_INVITE_SENT',
        clear: 'POLL_INVITE_DECLINED',
        actorScope: true,
      },
      {
        name: 'poll invite revoked clears invite',
        resourceType: 'poll',
        resourceId: 'auto-poll-invite-revoked',
        initial: 'POLL_INVITE_SENT',
        clear: 'POLL_INVITE_REVOKED',
        actorScope: false,
      },
      {
        name: 'vote submitted clears vote reminder',
        resourceType: 'poll',
        resourceId: 'auto-vote-reminder',
        initial: 'VOTE_REMINDER',
        clear: 'VOTE_SUBMITTED',
        actorScope: true,
      },
      {
        name: 'poll finalized clears ready-to-finalize',
        resourceType: 'poll',
        resourceId: 'auto-poll-finalized',
        initial: 'POLL_READY_TO_FINALIZE',
        clear: 'POLL_FINALIZED',
        actorScope: false,
      },
      {
        name: 'poll finalized clears all votes in',
        resourceType: 'poll',
        resourceId: 'auto-poll-finalized-participant',
        initial: 'POLL_ALL_VOTES_IN',
        clear: 'POLL_FINALIZED',
        actorScope: false,
      },
      {
        name: 'poll reopened clears finalized',
        resourceType: 'poll',
        resourceId: 'auto-poll-reopened',
        initial: 'POLL_FINALIZED',
        clear: 'POLL_REOPENED',
        actorScope: false,
      },
      {
        name: 'poll cancelled clears invite',
        resourceType: 'poll',
        resourceId: 'auto-poll-cancelled',
        initial: 'POLL_INVITE_SENT',
        clear: 'POLL_CANCELLED',
        actorScope: false,
      },
      {
        name: 'poll deleted clears ready-to-finalize',
        resourceType: 'poll',
        resourceId: 'auto-poll-deleted',
        initial: 'POLL_READY_TO_FINALIZE',
        clear: 'POLL_DELETED',
        actorScope: false,
      },
      {
        name: 'poll restored clears cancelled',
        resourceType: 'poll',
        resourceId: 'auto-poll-restored',
        initial: 'POLL_CANCELLED',
        clear: 'POLL_RESTORED',
        actorScope: false,
      },
      {
        name: 'group invite accepted clears invite',
        resourceType: 'group',
        resourceId: 'auto-group-accepted',
        initial: 'GROUP_INVITE_SENT',
        clear: 'GROUP_INVITE_ACCEPTED',
        actorScope: true,
      },
      {
        name: 'group invite declined clears invite',
        resourceType: 'group',
        resourceId: 'auto-group-declined',
        initial: 'GROUP_INVITE_SENT',
        clear: 'GROUP_INVITE_DECLINED',
        actorScope: true,
      },
      {
        name: 'group deleted clears invites',
        resourceType: 'group',
        resourceId: 'auto-group-deleted',
        initial: 'GROUP_INVITE_SENT',
        clear: 'GROUP_DELETED',
        actorScope: false,
      },
      {
        name: 'friend request accepted clears request',
        resourceType: 'friend',
        resourceId: 'auto-friend-accepted',
        initial: 'FRIEND_REQUEST_SENT',
        clear: 'FRIEND_REQUEST_ACCEPTED',
        actorScope: true,
      },
      {
        name: 'friend request declined clears request',
        resourceType: 'friend',
        resourceId: 'auto-friend-declined',
        initial: 'FRIEND_REQUEST_SENT',
        clear: 'FRIEND_REQUEST_DECLINED',
        actorScope: true,
      },
      {
        name: 'basic poll vote submitted clears reminder',
        resourceType: 'basicPoll',
        resourceId: 'auto-basic-poll-reminder',
        initial: 'BASIC_POLL_REMINDER',
        clear: 'BASIC_POLL_VOTE_SUBMITTED',
        actorScope: true,
      },
      {
        name: 'basic poll finalized clears reopened notice',
        resourceType: 'basicPoll',
        resourceId: 'auto-basic-poll-finalized',
        initial: 'BASIC_POLL_REOPENED',
        clear: 'BASIC_POLL_FINALIZED',
        actorScope: false,
      },
      {
        name: 'basic poll reopened clears finalized notice',
        resourceType: 'basicPoll',
        resourceId: 'auto-basic-poll-reopened',
        initial: 'BASIC_POLL_FINALIZED',
        clear: 'BASIC_POLL_REOPENED',
        actorScope: false,
      },
      {
        name: 'basic poll reset clears required-changed notice',
        resourceType: 'basicPoll',
        resourceId: 'auto-basic-poll-reset',
        initial: 'BASIC_POLL_REQUIRED_CHANGED',
        clear: 'BASIC_POLL_RESET',
        actorScope: false,
      },
    ];

    for (const scenario of scenarios) {
      await clearAllNotifications(page);
      const expectedTitle = titleMap[scenario.initial];

      const resourceTitle = `${scenario.resourceType.toUpperCase()} ${scenario.resourceId}`;
      await createNotification({
        eventType: scenario.initial,
        userId: testUsers.notifier.uid,
        event: buildEvent({
          eventType: scenario.initial,
          resourceType: scenario.resourceType,
          resourceId: scenario.resourceId,
          resourceTitle,
          actor,
          recipients: { userIds: [testUsers.notifier.uid], emails: [] },
          payload: {
            pollTitle: `Poll ${scenario.resourceId}`,
            groupName: `Group ${scenario.resourceId}`,
            requestId: scenario.resourceId,
            basicPollTitle:
              scenario.resourceType === 'basicPoll' ? `Poll ${scenario.resourceId}` : undefined,
            basicPollId:
              scenario.resourceType === 'basicPoll' ? scenario.resourceId : undefined,
            parentType: scenario.resourceType === 'basicPoll' ? 'group' : undefined,
            parentId:
              scenario.resourceType === 'basicPoll' ? 'e2e-group-owner' : undefined,
          },
        }),
      });

      const menu = await openNotifications(page);
      await expect(menu.getByText(expectedTitle, { exact: true })).toBeVisible({ timeout: 15000 });

      await applyAutoClear({
        eventType: scenario.clear,
        event: buildEvent({
          eventType: scenario.clear,
          resourceType: scenario.resourceType,
          resourceId: scenario.resourceId,
          resourceTitle,
          actor: scenario.actorScope
            ? actor
            : {
                uid: testUsers.owner.uid,
                email: testUsers.owner.email,
                displayName: testUsers.owner.displayName,
              },
          recipients: scenario.actorScope
            ? { userIds: [], emails: [] }
            : { userIds: [testUsers.notifier.uid], emails: [] },
          payload: {
            pollTitle: `Poll ${scenario.resourceId}`,
            groupName: `Group ${scenario.resourceId}`,
            requestId: scenario.resourceId,
            basicPollTitle:
              scenario.resourceType === 'basicPoll' ? `Poll ${scenario.resourceId}` : undefined,
            basicPollId:
              scenario.resourceType === 'basicPoll' ? scenario.resourceId : undefined,
            parentType: scenario.resourceType === 'basicPoll' ? 'group' : undefined,
            parentId:
              scenario.resourceType === 'basicPoll' ? 'e2e-group-owner' : undefined,
          },
        }),
        recipients: scenario.actorScope
          ? { userIds: [], emails: [] }
          : { userIds: [testUsers.notifier.uid], emails: [] },
      });

      await expect(menu.getByText(expectedTitle, { exact: true })).toHaveCount(0, { timeout: 15000 });
    }
  });
});
