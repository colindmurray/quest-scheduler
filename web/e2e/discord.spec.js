import { expect, test } from '@playwright/test';

function resolveDiscordUrl(currentUrl) {
  const parsed = new URL(currentUrl);
  if (parsed.hostname === 'discord.com') return parsed;
  const fallbackTarget = parsed.searchParams.get('u');
  if (!fallbackTarget) return null;
  const decoded = new URL(fallbackTarget);
  return decoded.hostname === 'discord.com' ? decoded : null;
}

test.describe('Discord bot entry', () => {
  test('discord bot landing page renders', async ({ page }) => {
    await page.goto('/discord-bot');
    await expect(page.getByText('Discord Bot Install')).toBeVisible();
    await expect(page.getByText('Add Quest Scheduler to your Discord server.')).toBeVisible();
  });

  test('discord OAuth login flow (requires emulator + test credentials)', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /continue with discord/i }).click();
    await expect
      .poll(() => page.url(), { timeout: 30000 })
      .toMatch(/discord\.com|about:neterror|about:blank/);
    const url = resolveDiscordUrl(page.url());
    expect(url).toBeTruthy();
    expect(url.searchParams.get('client_id')).toBeTruthy();
    expect(url.searchParams.get('redirect_uri')).toBeTruthy();
  });
});
