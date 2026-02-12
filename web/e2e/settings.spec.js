import { expect, test } from '@playwright/test';
import { testUsers } from './fixtures/test-users';

async function login(page) {
  const user = testUsers.owner;
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/dashboard')) return;
  const emailInput = page.getByLabel('Email');
  const passwordInput = page.getByLabel('Password');
  await expect(emailInput).toBeVisible({ timeout: 30000 });
  await expect(passwordInput).toBeVisible({ timeout: 30000 });
  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);
  await page.locator('form').getByRole('button', { name: /^log in$/i }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 60000 });
}

test.describe('Settings profile', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Settings e2e runs on chromium only.');
  });

  test('avatar source options reflect linked providers', async ({ page }) => {
    test.setTimeout(90000);
    await login(page);
    await page.goto('/settings');
    await expect(page.getByText('Loading settings...')).toHaveCount(0, { timeout: 30000 });
    await expect(page.getByText('Profile Picture')).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('radio', { name: /^Discord$/ })).toBeDisabled();
    await expect(page.getByRole('radio', { name: /Custom upload/i })).toBeEnabled();
  });
});
