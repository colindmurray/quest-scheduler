import { expect, test } from '@playwright/test';

test.describe('Discord bot entry', () => {
  test('discord bot landing page renders', async ({ page }) => {
    await page.goto('/discord-bot');
    await expect(page.getByText('Discord Bot Install')).toBeVisible();
    await expect(page.getByText('Add Quest Scheduler to your Discord server.')).toBeVisible();
  });

  test.skip('discord OAuth login flow (requires emulator + test credentials)', async ({ page }) => {
    // TODO: seed test user, click login, and verify redirect to Discord OAuth.
    await page.goto('/auth');
  });
});
