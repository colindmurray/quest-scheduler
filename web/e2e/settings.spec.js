import { expect, test } from '@playwright/test';
import { testUsers } from './fixtures/test-users';

async function login(page) {
  const user = testUsers.owner;
  await page.goto('/auth');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.locator('form').getByRole('button', { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe('Settings profile', () => {
  test('avatar source options reflect linked providers', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await expect(page.getByText('Profile Picture')).toBeVisible();

    await expect(page.getByRole('radio', { name: /^Discord$/ })).toBeDisabled();
    await expect(page.getByRole('radio', { name: /Custom upload/i })).toBeEnabled();
  });
});
