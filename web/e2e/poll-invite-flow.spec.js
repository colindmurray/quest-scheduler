import { expect, test } from '@playwright/test';
import { testUsers } from './fixtures/test-users';

const schedulerId = process.env.E2E_SCHEDULER_ID || 'e2e-scheduler';
const schedulerDeclineId =
  process.env.E2E_SCHEDULER_DECLINE_ID || 'e2e-scheduler-decline';
const schedulerNotificationId =
  process.env.E2E_SCHEDULER_NOTIFICATION_ID || 'e2e-scheduler-notification';

const pollTitle = 'E2E Scheduler Poll';
const pollDeclineTitle = 'E2E Scheduler Poll Decline';
const pollNotificationTitle = 'E2E Scheduler Poll Notification';

async function loginAs(page, user) {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/dashboard')) return;
  const emailInput = page.getByLabel('Email');
  const passwordInput = page.getByLabel('Password');
  await expect(emailInput).toBeVisible({ timeout: 30000 });
  await expect(passwordInput).toBeVisible({ timeout: 30000 });
  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);
  await page.locator('form').getByRole('button', { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
}

test.describe.serial('Poll invite flow', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Stateful invite flow runs on chromium only.');
  });

  test('dashboard quick accept removes pending invite without redirect', async ({ page }) => {
    await loginAs(page, testUsers.participant);

    const pendingSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Pending poll invites' }),
    });
    const pendingSessionsSection = page
      .getByText('Pending Sessions', { exact: true })
      .locator('..');

    const pollTitleText = pendingSection.getByText(pollTitle, { exact: true });
    await expect(pollTitleText).toBeVisible();
    await expect(pendingSessionsSection.getByText(pollTitle, { exact: true })).toHaveCount(0);

    const inviteCard = pollTitleText.locator('..').locator('..');
    const acceptButton = inviteCard.getByRole('button', { name: 'Accept invite' });
    await acceptButton.click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(pendingSection.getByText(pollTitle, { exact: true })).toHaveCount(0);
    await expect(pendingSessionsSection.getByText(pollTitle, { exact: true })).toBeVisible();
  });

  test('notification accept navigates to the poll and skips modal', async ({ page }) => {
    await loginAs(page, testUsers.participant);

    await page.getByRole('button', { name: /Notifications/ }).click();
    const menu = page.getByRole('menu');
    const notificationBody = menu.getByText(new RegExp(pollNotificationTitle));
    await expect(notificationBody).toBeVisible();
    const notificationItem = notificationBody.locator('..').locator('..');
    await notificationItem.getByRole('button', { name: /Accept/i }).click();

    await page.waitForURL(new RegExp(`/scheduler/${schedulerNotificationId}`));
    await expect(page.getByText('Join this session poll?')).toHaveCount(0);
  });

  test('pending invite modal appears and decline redirects to dashboard', async ({ page }) => {
    await loginAs(page, testUsers.participant);

    await page.goto(`/scheduler/${schedulerDeclineId}`);
    await expect(page.getByText('Join this session poll?')).toBeVisible();
    await expect(page.getByText('Pending invite')).toBeVisible();

    await page.getByRole('button', { name: /^Decline$/ }).click();
    await page.waitForURL(/\/dashboard/);

    await expect(page.getByText(pollDeclineTitle)).toHaveCount(0);

    await page.getByRole('button', { name: /Notifications/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText(pollDeclineTitle)).toHaveCount(0);
  });
});
