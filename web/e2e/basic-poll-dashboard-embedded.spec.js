import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

const dashboardGroupPollId = process.env.E2E_BASIC_DASHBOARD_POLL_ID || "e2e-basic-dashboard-poll";
const schedulerId = process.env.E2E_SCHEDULER_ID || "e2e-scheduler";
const embeddedPollId = process.env.E2E_EMBEDDED_BASIC_POLL_ID || "e2e-embedded-required-poll";

async function loginAs(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe.serial("Basic Poll dashboard and embedded flow", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Basic poll e2e runs on chromium only.");
  });

  test("shows polls-to-vote links and supports embedded deep-link navigation", async ({ page }) => {
    await loginAs(page, testUsers.owner);

    await page.goto("/dashboard");
    await expect(page.getByText("E2E Dashboard Group Poll")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("E2E Embedded Required Poll")).toBeVisible({ timeout: 15000 });

    const embeddedVoteLink = page.getByRole("link", {
      name: /E2E Embedded Required Poll/i,
    });
    await expect(embeddedVoteLink).toContainText("Required");
    await expect(embeddedVoteLink).toHaveAttribute(
      "href",
      `/scheduler/${schedulerId}?poll=${embeddedPollId}`
    );
    await embeddedVoteLink.click();

    await expect(page).toHaveURL(new RegExp(`/scheduler/${schedulerId}\\?poll=${embeddedPollId}`));
    await expect(page.getByText("E2E Embedded Required Poll")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "View note for In person" }).click();
    await expect(
      page.getByRole("dialog", { name: "Option note for In person" })
    ).toBeVisible();
    await expect(page.getByText("physical dice")).toBeVisible();
    await page
      .getByRole("dialog", { name: "Option note for In person" })
      .getByRole("button", { name: "Close" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Option note for In person" })
    ).toHaveCount(0);

    await page.goto("/dashboard");
    await expect(page.getByText("E2E Dashboard Group Poll")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("E2E Embedded Required Poll")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: /E2E Dashboard Group Poll/i })).toHaveAttribute(
      "href",
      new RegExp(`/polls/${dashboardGroupPollId}$`)
    );
  });
});
