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
  test('shows outgoing and incoming friend request sections', async ({ page }) => {
    await login(page);
    await page.goto('/friends');
    await expect(page.getByRole('heading', { name: 'Friends & Groups' })).toBeVisible({
      timeout: 15000,
    });

    const outgoingSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Pending outgoing requests' }),
    });
    await expect(outgoingSection).toBeVisible({
      timeout: 15000,
    });
    await expect(outgoingSection).toContainText(/No outgoing friend requests\.|Waiting for/i);

    const incomingSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Pending incoming requests' }),
    });
    await expect(incomingSection).toBeVisible({
      timeout: 15000,
    });
    await expect(incomingSection).toContainText(/No incoming friend requests\.|sent you a request/i);
  });
});
