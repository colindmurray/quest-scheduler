import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

const basicGroupId = process.env.E2E_BASIC_GROUP_ID || process.env.E2E_GROUP_OWNER_ID || "e2e-group-owner";
const standalonePollId = process.env.E2E_BASIC_STANDALONE_POLL_ID || "e2e-basic-standalone-poll";
const deadlinePollId = process.env.E2E_BASIC_DEADLINE_POLL_ID || "e2e-basic-deadline-poll";

async function loginAs(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe.serial("Basic Poll standalone", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Basic poll e2e runs on chromium only.");
  });

  test("can submit and clear a standalone multiple-choice vote", async ({ page }) => {
    test.setTimeout(60000);
    await loginAs(page, testUsers.owner);

    await page.goto(`/groups/${basicGroupId}/polls/${standalonePollId}`);
    await expect(page.getByRole("heading", { name: "E2E Standalone Basic Poll" })).toBeVisible();

    const clearVoteButton = page.getByRole("button", { name: "Clear vote" });
    if (await clearVoteButton.isEnabled()) {
      await clearVoteButton.click();
    }

    await page.getByLabel("Pizza").check();
    await page.getByRole("button", { name: "Submit vote" }).click();
    await expect(clearVoteButton).toBeEnabled({ timeout: 30000 });
    await clearVoteButton.click();
    await expect(page.getByText("No votes yet.")).toBeVisible();
  });

  test("blocks voting when poll deadline has passed", async ({ page }) => {
    await loginAs(page, testUsers.owner);

    await page.goto(`/groups/${basicGroupId}/polls/${deadlinePollId}`);
    await expect(page.getByRole("heading", { name: "E2E Deadline Closed Poll" })).toBeVisible();
    await expect(page.getByText("Voting is closed for this poll.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit vote" })).toBeDisabled();
  });
});
