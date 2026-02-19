import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

async function login(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
}

async function openSchedulerAndWaitForTitle(page, schedulerId, title) {
  await page.goto(`/scheduler/${schedulerId}`);

  const titleHeading = page.getByRole("heading", { name: title });
  const loadingLabel = page.getByText("Loading session poll...");

  await expect
    .poll(
      async () => {
        if ((await titleHeading.count()) > 0) {
          return true;
        }

        if ((await loadingLabel.count()) > 0) {
          await page.reload();
        }

        return false;
      },
      {
        timeout: 30000,
        intervals: [500, 1000, 1500, 2000],
        message: `Expected scheduler title '${title}' to load`,
      }
    )
    .toBe(true);

  await expect(titleHeading).toBeVisible();
}

test.describe("Scheduler Discord repost menu controls", () => {
  const schedulerId =
    process.env.E2E_DISCORD_REPOST_SCHEDULER_ID || "e2e-discord-repost-poll";

  test("shows repost action for poll creator", async ({ page }) => {
    await login(page, testUsers.owner);

    await openSchedulerAndWaitForTitle(page, schedulerId, "E2E Discord Repost Poll");

    await page.getByRole("button", { name: "Poll options" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Repost Discord poll", exact: true })
    ).toBeVisible();
  });

  test("hides repost action for non-creator participants", async ({ page }) => {
    await login(page, testUsers.participant);

    await openSchedulerAndWaitForTitle(page, schedulerId, "E2E Discord Repost Poll");

    await page.getByRole("button", { name: "Poll options" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Repost Discord poll", exact: true })
    ).toHaveCount(0);
  });
});
