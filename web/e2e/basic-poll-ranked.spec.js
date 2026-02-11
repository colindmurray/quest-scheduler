import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

const basicGroupId = process.env.E2E_BASIC_GROUP_ID || process.env.E2E_GROUP_OWNER_ID || "e2e-group-owner";
const rankedPollId = process.env.E2E_BASIC_RANKED_POLL_ID || "e2e-basic-ranked-poll";

async function loginAs(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe.serial("Basic Poll ranked choice", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Basic poll e2e runs on chromium only.");
  });

  test("supports ranked voting submit and clear", async ({ page }) => {
    await loginAs(page, testUsers.owner);

    await page.goto(`/groups/${basicGroupId}/polls/${rankedPollId}`);
    await expect(page.getByRole("heading", { name: "E2E Ranked Basic Poll" })).toBeVisible();
    await expect(page.getByText("Rank your choices")).toBeVisible();

    await page.getByRole("button", { name: "Rank Curse of Strahd" }).click();
    await page.getByRole("button", { name: "Rank Tomb of Annihilation" }).click();
    await page.getByRole("button", { name: "Move Tomb of Annihilation up" }).click();
    await page.getByRole("button", { name: "Submit ranking" }).click();

    await expect(page.getByText("1 first-choice vote (100%)")).toBeVisible();
    await page.getByRole("button", { name: "Clear ranking" }).click();
    await expect(page.getByText("No votes yet.")).toBeVisible();
  });
});
