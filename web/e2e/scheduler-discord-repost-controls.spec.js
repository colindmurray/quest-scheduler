import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

async function login(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe("Scheduler Discord repost menu controls", () => {
  const schedulerId =
    process.env.E2E_DISCORD_REPOST_SCHEDULER_ID || "e2e-discord-repost-poll";

  test("shows repost action for poll creator", async ({ page }) => {
    await login(page, testUsers.owner);

    await page.goto(`/scheduler/${schedulerId}`);
    await expect(page.getByText("E2E Discord Repost Poll")).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("button", { name: "Poll options" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Repost Discord poll", exact: true })
    ).toBeVisible();
  });

  test("hides repost action for non-creator participants", async ({ page }) => {
    await login(page, testUsers.participant);

    await page.goto(`/scheduler/${schedulerId}`);
    await expect(page.getByText("E2E Discord Repost Poll")).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("button", { name: "Poll options" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Repost Discord poll", exact: true })
    ).toHaveCount(0);
  });
});
