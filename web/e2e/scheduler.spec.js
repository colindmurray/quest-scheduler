import { expect, test } from '@playwright/test';

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

  test.skip('UID-only poll flow (requires emulator + seeded scheduler)', async ({ page }) => {
    // TODO: seed scheduler with UID-only participants and verify vote submission.
    await page.goto('/scheduler/seeded-poll-id');
  });
});
