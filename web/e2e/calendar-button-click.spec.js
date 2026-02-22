import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

const env = globalThis.process?.env || {};
const schedulerId = env.E2E_SCHEDULER_ID || "e2e-scheduler";
const schedulerTitle = "E2E Scheduler Poll";
const schedulerDeclineTitle = "E2E Scheduler Poll Decline";
const encodedEventId = "ZTJlLXNjaGVkdWxlci1ldmVudC1pZA==";

async function loginAs(page, user) {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  if (page.url().includes("/dashboard")) return;
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
}

function schedulerCard(page, title) {
  return page.getByRole("button", { name: `Open session poll ${title}` }).first();
}

test.describe("Dashboard session card calendar button", () => {
  test.beforeEach((_fixtures, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "Desktop-only cursor and keyboard checks."
    );
  });

  test("opens the Google Calendar event in a new tab and keeps the dashboard tab unchanged", async ({
    page,
  }) => {
    await loginAs(page, testUsers.owner);
    await page.goto("/dashboard");

    const card = schedulerCard(page, schedulerTitle);
    await expect(card).toBeVisible({ timeout: 15000 });
    const calendarLink = card.getByRole("link", {
      name: `Open ${schedulerTitle} in Google Calendar`,
    });
    await expect(calendarLink).toBeVisible();
    await expect(calendarLink).toHaveCSS("cursor", "pointer");
    await expect(calendarLink).toHaveAttribute(
      "href",
      `https://calendar.google.com/calendar/event?eid=${encodedEventId}`
    );

    const [popup] = await Promise.all([page.waitForEvent("popup"), calendarLink.click()]);
    await expect(popup).toHaveURL(
      `https://calendar.google.com/calendar/event?eid=${encodedEventId}`
    );
    await expect(page).toHaveURL(/\/dashboard/);
    await popup.close();
  });

  test("does not render a clickable calendar link when the scheduler has no google event id", async ({
    page,
  }) => {
    await loginAs(page, testUsers.owner);
    await page.goto("/dashboard");

    const card = schedulerCard(page, schedulerDeclineTitle);
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(
      card.getByRole("link", {
        name: `Open ${schedulerDeclineTitle} in Google Calendar`,
      })
    ).toHaveCount(0);
  });

  test("supports keyboard navigation for both card and calendar link controls", async ({
    page,
  }) => {
    await loginAs(page, testUsers.owner);
    await page.goto("/dashboard");

    const card = schedulerCard(page, schedulerTitle);
    const calendarLink = card.getByRole("link", {
      name: `Open ${schedulerTitle} in Google Calendar`,
    });

    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(calendarLink).toBeVisible();

    await card.focus();
    await expect(card).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/scheduler/${schedulerId}`));

    await page.goto("/dashboard");
    const refocusedCard = schedulerCard(page, schedulerTitle);
    const refocusedCalendarLink = refocusedCard.getByRole("link", {
      name: `Open ${schedulerTitle} in Google Calendar`,
    });
    await expect(refocusedCalendarLink).toBeVisible();

    await refocusedCalendarLink.focus();
    await expect(refocusedCalendarLink).toBeFocused();
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.keyboard.press("Enter"),
    ]);
    await expect(popup).toHaveURL(
      `https://calendar.google.com/calendar/event?eid=${encodedEventId}`
    );
    await popup.close();
  });
});
