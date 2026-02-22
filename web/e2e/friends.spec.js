import { expect, test } from '@playwright/test';
import { testUsers } from './fixtures/test-users';

async function login(page) {
  const user = testUsers.owner;
  await page.goto('/auth');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.locator('form').getByRole('button', { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
}

test.describe('Friends & Groups', () => {
  test('send friend request by email', async ({ page }) => {
    await login(page);
    await page.goto('/friends');
    await expect(page.getByText('Friends & Groups')).toBeVisible();

    const invitee = process.env.E2E_FRIEND_EMAIL || 'friend@example.com';
    await page
      .getByPlaceholder('friend@example.com, discord_username, or @username')
      .fill(invitee);
    await page.getByRole('button', { name: /send request/i }).click();
    await expect(page.getByText(`Waiting for ${invitee} to accept`)).toBeVisible();
  });
});
