import { expect, test } from '@playwright/test';
import { testUsers } from './fixtures/test-users';

const friendDeclineEmail =
  process.env.E2E_FRIEND_DECLINE_EMAIL || 'stranger@example.com';

const groupAcceptName = 'E2E Group Accept';
const groupDeclineName = 'E2E Group Decline';
const groupRevokeName = 'E2E Group Revoke';
const groupOwnerName = 'E2E Group Owner';

async function loginAs(page, user) {
  await page.goto('/auth');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.locator('form').getByRole('button', { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe.serial('Friend & group invite flows', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Stateful invite flow runs on chromium only.');
  });

  test('accepting a friend request clears its notification', async ({ page }) => {
    await loginAs(page, testUsers.participant);
    await page.goto('/friends');

    const incomingSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Pending incoming requests' }),
    });

    await expect(incomingSection.getByText(testUsers.owner.email)).toBeVisible();

    await page.getByRole('button', { name: /Notifications/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText(/sent you a friend request/i)).toHaveCount(2);
    await page.getByRole('button', { name: /Notifications/ }).click();

    const ownerCard = incomingSection
      .getByText(testUsers.owner.email)
      .locator('xpath=ancestor::div[contains(@class, "flex")][1]');
    await ownerCard.getByRole('button', { name: /^Accept$/ }).click();

    await expect(incomingSection.getByText(testUsers.owner.email)).toHaveCount(0);
    await page.waitForTimeout(1500);

    await page.reload();
    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(menu.getByText(/sent you a friend request/i)).toHaveCount(1);
  });

  test('declining a friend request clears its notification', async ({ page }) => {
    await loginAs(page, testUsers.participant);
    await page.goto('/friends');

    const incomingSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Pending incoming requests' }),
    });

    const strangerCard = incomingSection
      .getByText(friendDeclineEmail)
      .locator('xpath=ancestor::div[contains(@class, "flex")][1]');
    await strangerCard.getByRole('button', { name: /^Decline$/ }).click();

    await expect(incomingSection.getByText(friendDeclineEmail, { exact: false })).toHaveCount(0);
    await page.waitForTimeout(1500);

    await page.reload();
    await page.getByRole('button', { name: /Notifications/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText(/sent you a friend request/i)).toHaveCount(0, { timeout: 15000 });
  });

  test('accepting a group invite clears its notification', async ({ page }) => {
    await loginAs(page, testUsers.participant);
    await page.goto('/friends?tab=groups');

    const pendingSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Pending Invitations' }),
    });

    await expect(pendingSection.getByText(groupAcceptName)).toBeVisible();

    await page.getByRole('button', { name: /Notifications/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText(groupAcceptName)).toBeVisible();
    await expect(menu.getByText(groupDeclineName)).toBeVisible();
    await page.getByRole('button', { name: /Notifications/ }).click();

    const acceptRow = pendingSection
      .getByText(groupAcceptName, { exact: true })
      .locator('..')
      .locator('..');
    await acceptRow.getByRole('button', { name: /Accept/ }).click();

    await expect(pendingSection.getByText(groupAcceptName)).toHaveCount(0);
    await page.waitForTimeout(1500);

    await page.reload();
    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(menu.getByText(groupAcceptName)).toHaveCount(0);
    await expect(menu.getByText(groupDeclineName)).toBeVisible();
  });

  test('declining a group invite clears its notification', async ({ page }) => {
    await loginAs(page, testUsers.participant);
    await page.goto('/friends?tab=groups');

    const pendingSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Pending Invitations' }),
    });

    const declineRow = pendingSection
      .getByText(groupDeclineName, { exact: true })
      .locator('..')
      .locator('..');
    await declineRow.getByRole('button', { name: /Decline/ }).click();

    await expect(pendingSection.getByText(groupDeclineName)).toHaveCount(0);
    await page.waitForTimeout(1500);

    await page.reload();
    await page.getByRole('button', { name: /Notifications/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText(groupDeclineName)).toHaveCount(0);
  });

  test('revoking friend/group invites clears invitee notifications', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await loginAs(ownerPage, testUsers.owner);
    await ownerPage.goto('/friends');

    const outgoingSection = ownerPage.locator('section', {
      has: ownerPage.getByRole('heading', { name: 'Pending outgoing requests' }),
    });
    const revokeCard = outgoingSection
      .getByText(testUsers.revokee.email)
      .locator('xpath=ancestor::div[contains(@class, "flex")][1]');
    await revokeCard.getByRole('button', { name: /Cancel/ }).click();
    await expect(outgoingSection.getByText(testUsers.revokee.email)).toHaveCount(0);

    await ownerPage.goto('/friends?tab=groups');
    const groupCard = ownerPage
      .getByRole('heading', { name: groupRevokeName })
      .locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
    const revokeChip = groupCard.getByText(testUsers.revokee.displayName, { exact: true });
    await revokeChip.hover();
    await groupCard.locator('button').filter({ hasText: '×' }).first().click({ force: true });
    await ownerPage.getByRole('button', { name: /Remove invite/i }).click();
    await expect(
      groupCard.getByText(testUsers.revokee.displayName, { exact: true })
    ).toHaveCount(0);

    await ownerContext.close();

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await loginAs(inviteePage, testUsers.revokee);

    await inviteePage.getByRole('button', { name: /Notifications/ }).click();
    const menu = inviteePage.getByRole('menu');
    await expect(menu.getByText(/friend request/i)).toHaveCount(0);
    await expect(menu.getByText(groupRevokeName)).toHaveCount(0);

    await inviteePage.goto('/friends?tab=groups');
    await expect(inviteePage.getByText('Pending Invitations')).toHaveCount(0);

    await inviteeContext.close();
  });

  test('blocked recipients do not surface friend or group invites', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await loginAs(ownerPage, testUsers.owner);
    await ownerPage.goto('/friends');

    await ownerPage
      .getByPlaceholder('friend@example.com, discord_username, or @username')
      .fill(testUsers.blocked.email);
    await ownerPage.getByRole('button', { name: /send request/i }).click();

    const outgoingSection = ownerPage.locator('section', {
      has: ownerPage.getByRole('heading', { name: 'Pending outgoing requests' }),
    });
    await expect(outgoingSection.getByText(testUsers.blocked.email)).toHaveCount(0);

    await ownerPage.goto('/friends?tab=groups');
    const groupCard = ownerPage
      .getByRole('heading', { name: groupOwnerName })
      .locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
    await groupCard.getByRole('button', { name: /^Invite$/ }).click();
    await expect(
      ownerPage.getByRole('heading', { name: `Invite to ${groupOwnerName}` })
    ).toBeVisible({ timeout: 15000 });
    await ownerPage
      .getByPlaceholder('friend@example.com, discord_username, or @username')
      .fill(testUsers.blocked.email);
    await ownerPage.getByRole('button', { name: /Send invitation/i }).click();
    await expect(groupCard.getByText(testUsers.blocked.email)).toHaveCount(0);

    await ownerContext.close();

    const blockedContext = await browser.newContext();
    const blockedPage = await blockedContext.newPage();
    await loginAs(blockedPage, testUsers.blocked);
    await blockedPage.goto('/friends');

    await expect(blockedPage.getByText('No incoming friend requests.')).toBeVisible();
    await blockedPage.goto('/friends?tab=groups');
    await expect(blockedPage.getByText('Pending Invitations')).toHaveCount(0);

    await blockedPage.getByRole('button', { name: /Notifications/ }).click();
    const menu = blockedPage.getByRole('menu');
    await expect(menu.getByText(/friend request/i)).toHaveCount(0);
    await expect(menu.getByText(/invited you to join/i)).toHaveCount(0);

    await blockedContext.close();
  });

  test('email-only group invites show up as pending', async ({ page }) => {
    await loginAs(page, testUsers.owner);
    await page.goto('/friends?tab=groups');

    const groupCard = page
      .getByRole('heading', { name: groupOwnerName })
      .locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
    await groupCard.getByRole('button', { name: /^Invite$/ }).click();

    const emailOnly = 'email-only@example.com';
    await expect(
      page.getByRole('heading', { name: `Invite to ${groupOwnerName}` })
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByPlaceholder('friend@example.com, discord_username, or @username')
      .fill(emailOnly);
    await page.getByRole('button', { name: /Send invitation/i }).click();

    await expect(groupCard.getByText(emailOnly)).toBeVisible();
  });
});
