import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

test.describe("Scheduler empty vote state", () => {
  test("treats empty vote docs as pending in participant status", async ({ page }) => {
    const schedulerId =
      process.env.E2E_EMPTY_VOTE_SCHEDULER_ID || "e2e-empty-vote-pending";
    const user = testUsers.owner;

    await page.goto("/auth");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/scheduler/${schedulerId}`);
    await expect(page.getByText("E2E Empty Vote Pending Poll")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("2 total · 1 voted", { exact: true })).toBeVisible();
    await expect(page.getByText("All voted!", { exact: true })).toHaveCount(0);
  });
});
