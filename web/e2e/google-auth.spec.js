import { expect, test } from '@playwright/test';

const clientId = process.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

test.describe('Google auth entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(GOOGLE_SCRIPT_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.google = {
            accounts: {
              id: {
                initialize: (config) => {
                  window.__googleInitConfig = config;
                },
                renderButton: () => {},
              },
            },
          };
        `,
      });
    });
  });

  test('google auth button uses test client id', async ({ page }) => {
    test.skip(!clientId, 'VITE_GOOGLE_OAUTH_CLIENT_ID not set');

    await page.goto('/auth');
    await page.waitForFunction(() => window.__googleInitConfig?.client_id);
    const clientIdInPage = await page.evaluate(
      () => window.__googleInitConfig?.client_id || null
    );

    expect(clientIdInPage).toBe(clientId);
  });
});
