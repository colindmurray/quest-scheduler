import { expect, test } from '@playwright/test';
import { testUsers } from './fixtures/test-users';

test.describe('Scheduler poll access', () => {
  test('unauthenticated poll routes redirect to auth', async ({ page }) => {
    await page.goto('/scheduler/test-poll');
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByText('Welcome to Quest Scheduler')).toBeVisible();

    const redirectPath = await page.evaluate(() =>
      localStorage.getItem('postLoginRedirect')
    );
    expect(redirectPath).toBe('/scheduler/test-poll');
  });

  test('UID-only poll flow (requires emulator + seeded scheduler)', async ({ page }) => {
    const schedulerId = process.env.E2E_SCHEDULER_ID || 'e2e-scheduler';
    const user = testUsers.owner;

    await page.goto('/auth');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: /^log in$/i }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/scheduler/${schedulerId}`);
    await expect(page.getByText('Session Poll')).toBeVisible();
    await expect(page.getByText('E2E Scheduler Poll')).toBeVisible();
  });
});
