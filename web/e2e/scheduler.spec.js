import { expect, test } from '@playwright/test';
import { testUsers } from './fixtures/test-users';

async function openSchedulerAndWaitForTitle(page, schedulerId, title) {
  await page.goto(`/scheduler/${schedulerId}`);

  const titleHeading = page.getByRole('heading', { name: title });
  const loadingLabel = page.getByText('Loading session poll...');

  await expect
    .poll(
      async () => {
        if ((await titleHeading.count()) > 0) {
          return true;
        }

        if ((await loadingLabel.count()) > 0) {
          await page.reload();
        }

        return false;
      },
      {
        timeout: 30000,
        intervals: [500, 1000, 1500, 2000],
        message: `Expected scheduler title '${title}' to load`,
      }
    )
    .toBe(true);

  await expect(titleHeading).toBeVisible();
}

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
    await page.locator('form').getByRole('button', { name: /^log in$/i }).click();
    await page.waitForURL(/\/dashboard/);

    await openSchedulerAndWaitForTitle(page, schedulerId, 'E2E Scheduler Poll');
    await expect(page.getByText('Session Poll')).toBeVisible();
  });
});
