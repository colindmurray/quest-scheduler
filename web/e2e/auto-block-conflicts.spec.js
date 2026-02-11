import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

test.describe.serial("Auto-block conflicts", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Auto-block conflicts toggles shared user settings; run on chromium only.");
  });

  test("enabling the setting greys out conflicted slots and removes the user from tallies", async ({ page }) => {
    const user = testUsers.owner;
    const targetId = process.env.E2E_BUSY_TARGET_ID || "e2e-busy-target";

    await page.goto("/auth");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto("/settings");
    await expect(page.getByText("Conflict Blocking")).toBeVisible();

    // Enable setting and save.
    await page.getByLabel("Auto-block conflicts").click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("button", { name: "Saving..." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save settings" })).toBeVisible({
      timeout: 15000,
    });

    await page.goto(`/scheduler/${targetId}`);
    await expect(page.getByText("E2E Busy Target Poll")).toBeVisible();

    // The only voted slot should be blocked; counts should exclude the owner.
    const busyText = page.getByText("Busy (ignored in results)");
    await expect(busyText).toBeVisible({ timeout: 15000 });

    const slotCard = page.locator("div", { has: busyText }).first();
    await expect(slotCard.getByText(/Preferred 0 · Feasible 0/).first()).toBeVisible();
    await expect(slotCard.getByText(/E2E Busy Finalized Poll/)).toBeVisible();
  });
});
