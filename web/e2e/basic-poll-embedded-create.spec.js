import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

async function loginAs(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 60000 });
}

test.describe.serial("Embedded poll create flow", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Basic poll e2e runs on chromium only.");
  });

  test("persists embedded polls added during /create flow", async ({ page }) => {
    const schedulerTitle = `E2E Create Embedded ${Date.now()}`;
    const embeddedTitle = "E2E Create Flow Embedded Poll";

    await loginAs(page, testUsers.owner);
    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Create Session Poll" })).toBeVisible();

    await page.getByLabel("Session poll title").fill(schedulerTitle);

    await page.getByRole("button", { name: /^\+ Add slot$/ }).click();
    await expect(page.getByRole("heading", { name: "Add a slot" })).toBeVisible();
    const slotDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Add a slot" }),
    });
    await slotDialog.locator('input[type="time"]').fill("23:59");
    await slotDialog.getByRole("button", { name: "Add slot", exact: true }).click();
    await expect(page.getByText(/Duration \d+ min/)).toBeVisible();

    await page.getByRole("button", { name: /^\+ Add poll$/ }).click();
    await expect(page.getByRole("heading", { name: "Add embedded poll" })).toBeVisible();
    const addModal = page.locator("div").filter({
      has: page.getByRole("heading", { name: "Add embedded poll" }),
    });
    await addModal.locator("input").first().fill(embeddedTitle);
    await addModal.locator('input[placeholder="Option 1"]').fill("Option One");
    await addModal.locator('input[placeholder="Option 2"]').fill("Option Two");
    await addModal.getByRole("button", { name: "Add poll", exact: true }).click();
    await expect(page.getByText(embeddedTitle)).toBeVisible();

    await page.getByRole("button", { name: "Create poll", exact: true }).click();
    await expect(page).toHaveURL(/\/scheduler\/[^/]+$/, { timeout: 60000 });

    const createdSchedulerId = page.url().split("/scheduler/")[1];
    await page.goto(`/scheduler/${createdSchedulerId}/edit`);
    await expect(page.getByRole("heading", { name: "Edit Session Poll" })).toBeVisible();
    await expect(page.getByText(embeddedTitle)).toBeVisible({ timeout: 15000 });
  });
});
