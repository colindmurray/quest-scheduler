import { expect, test } from '@playwright/test';

test.describe('Discord bot entry', () => {
  test('discord bot landing page renders', async ({ page }) => {
    await page.goto('/discord-bot');
    await expect(page.getByText('Discord Bot Install')).toBeVisible();
    await expect(page.getByText('Add Quest Scheduler to your Discord server.')).toBeVisible();
  });

  test('discord OAuth login flow (requires emulator + test credentials)', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /continue with discord/i }).click();
    await page.waitForURL(/discord\.com\/oauth2\/authorize/);
    const url = new URL(page.url());
    expect(url.searchParams.get('client_id')).toBeTruthy();
    expect(url.searchParams.get('redirect_uri')).toBeTruthy();
  });
});
