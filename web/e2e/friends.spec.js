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
  test('shows seeded outgoing and incoming friend request sections', async ({ page }) => {
    await login(page);
    await page.goto('/friends');
    await expect(page.getByRole('heading', { name: 'Friends & Groups' })).toBeVisible({
      timeout: 15000,
    });

    const seededInvitee =
      process.env.E2E_PARTICIPANT_EMAIL || 'participant@example.com';
    const outgoingSection = page.locator('section').filter({
      hasText: 'Pending outgoing requests',
    });
    await expect(outgoingSection.getByText(seededInvitee).first()).toBeVisible({
      timeout: 15000,
    });

    await expect(
      page.locator('section').filter({ hasText: 'Pending incoming requests' })
    ).toBeVisible({
      timeout: 15000,
    });
  });
});
