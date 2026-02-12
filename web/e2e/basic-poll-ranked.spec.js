import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

async function loginAs(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
}

async function openGeneralPollModal(page, title) {
  await page.goto("/dashboard");
  const search = page.getByPlaceholder("Search title or description");
  await expect(search).toBeVisible({ timeout: 15000 });
  await search.fill(title);
  const card = page.locator("article[role='button']").filter({ hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
}

test.describe.serial("Basic Poll ranked choice", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Basic poll e2e runs on chromium only.");
  });

  test("supports ranked voting submit and clear", async ({ page }) => {
    await loginAs(page, testUsers.owner);
    await openGeneralPollModal(page, "E2E Ranked Basic Poll");

    await expect(page.getByRole("heading", { name: "E2E Ranked Basic Poll" }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("0/1 voted", { exact: true })).toBeVisible();

    const modal = page.locator("div.fixed.inset-0.z-50").first();
    const rankButtons = modal.getByRole("button", { name: "Rank" });
    await rankButtons.first().click();
    await rankButtons.first().click();
    await modal.getByRole("button", { name: "Submit ranking" }).click();

    await expect(modal.getByText("1/1 voted", { exact: true })).toBeVisible({ timeout: 15000 });
    await modal.getByRole("button", { name: "Clear vote" }).click();
    await expect(page.getByText("0/1 voted", { exact: true })).toBeVisible({ timeout: 15000 });
  });
});
