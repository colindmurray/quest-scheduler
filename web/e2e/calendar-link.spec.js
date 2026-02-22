import { expect, test } from '@playwright/test';
import { testUsers } from './fixtures/test-users';

const calendarId =
  process.env.E2E_CALENDAR_LINK_CALENDAR_ID || testUsers.owner.email.toLowerCase();
const schedulers = {
  open: {
    title: 'E2E Calendar Link Open Poll',
    eventId: 'e2e-open-event-123',
  },
  finalized: {
    title: 'E2E Calendar Link Finalized Poll',
    eventId: 'e2e-finalized-event-456',
  },
  cancelled: {
    title: 'E2E Calendar Link Cancelled Poll',
    eventId: 'e2e-cancelled-event-789',
  },
  noEvent: {
    title: 'E2E Calendar Link No Event Poll',
  },
};

function decodeEid(eid) {
  return Buffer.from(eid, 'base64').toString('utf8');
}

function calendarLinkName(title) {
  return new RegExp(`^Open ${title} in Google Calendar$`, 'i');
}

async function login(page) {
  const user = testUsers.owner;
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/dashboard')) return;
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.locator('form').getByRole('button', { name: /^log in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60000 });
}

async function searchTitle(page, title) {
  const searchInput = page.getByRole('searchbox', { name: /search title or description/i });
  await searchInput.fill(title);
}

test.describe('Dashboard calendar links', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Calendar link e2e runs on chromium only.');
  });

  test('renders encoded links for pending, finalized, and cancelled schedulers', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');

    await searchTitle(page, schedulers.open.title);
    const openLink = page.getByRole('link', { name: calendarLinkName(schedulers.open.title) });
    await expect(openLink).toBeVisible();
    const openHref = await openLink.getAttribute('href');
    const openEid = new URL(openHref).searchParams.get('eid');
    expect(decodeEid(openEid)).toBe(`${calendarId}/${schedulers.open.eventId}`);

    await searchTitle(page, schedulers.finalized.title);
    const finalizedLink = page.getByRole('link', {
      name: calendarLinkName(schedulers.finalized.title),
    });
    await expect(finalizedLink).toBeVisible();
    const finalizedHref = await finalizedLink.getAttribute('href');
    const finalizedEid = new URL(finalizedHref).searchParams.get('eid');
    expect(decodeEid(finalizedEid)).toBe(`${calendarId}/${schedulers.finalized.eventId}`);

    await searchTitle(page, schedulers.cancelled.title);
    await page.getByRole('button', { name: /cancelled/i }).click();
    const cancelledLink = page.getByRole('link', {
      name: calendarLinkName(schedulers.cancelled.title),
    });
    await expect(cancelledLink).toBeVisible();
    const cancelledHref = await cancelledLink.getAttribute('href');
    const cancelledEid = new URL(cancelledHref).searchParams.get('eid');
    expect(decodeEid(cancelledEid)).toBe(`${calendarId}/${schedulers.cancelled.eventId}`);
  });

  test('hides calendar link when scheduler has no googleEventId', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await searchTitle(page, schedulers.noEvent.title);

    await expect(page.getByText(schedulers.noEvent.title, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: calendarLinkName(schedulers.noEvent.title) })
    ).toHaveCount(0);
  });

  test('clicking calendar link opens the expected Google Calendar URL', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await searchTitle(page, schedulers.open.title);

    const link = page.getByRole('link', { name: calendarLinkName(schedulers.open.title) });
    await expect(link).toBeVisible();

    const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
    await popup.waitForLoadState('domcontentloaded');

    const popupUrl = new URL(popup.url());
    expect(`${popupUrl.origin}${popupUrl.pathname}`).toBe('https://calendar.google.com/calendar/event');
    const popupEid = popupUrl.searchParams.get('eid');
    expect(decodeEid(popupEid)).toBe(`${calendarId}/${schedulers.open.eventId}`);

    await popup.close();
  });
});

