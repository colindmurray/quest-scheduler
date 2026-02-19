import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

async function loginAs(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
}

async function openGeneralPollModal(page, title, options = {}) {
  const tab = options.tab || null;
  await page.goto("/dashboard");
  if (tab === "closed") {
    await page.getByRole("button", { name: /^Closed \(/ }).first().click();
  }
  const search = page.getByPlaceholder("Search title or description");
  await expect(search).toBeVisible({ timeout: 15000 });
  await search.fill(title);
  const card = page.locator("article[role='button']").filter({ hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
}

async function openPrivacySettings(panel) {
  await panel.getByRole("button", { name: /Advanced settings/i }).click();
}

async function setSelectValue(container, index, optionLabel, page) {
  const trigger = container.locator('[role="combobox"]').nth(index);
  await trigger.scrollIntoViewIfNeeded();
  await trigger.evaluate((element) => element.click());
  await page.getByRole("option", { name: optionLabel }).click();
}

test.describe.serial("Basic Poll standalone", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Basic poll e2e runs on chromium only.");
  });

  test("can submit and clear a standalone multiple-choice vote", async ({ page }) => {
    test.setTimeout(60000);
    await loginAs(page, testUsers.owner);
    await openGeneralPollModal(page, "E2E Standalone Basic Poll");

    await expect(page.getByRole("heading", { name: "E2E Standalone Basic Poll" }).first()).toBeVisible({
      timeout: 15000,
    });

    const clearVoteButton = page.getByRole("button", { name: "Clear vote" });
    if (await clearVoteButton.isEnabled()) {
      await clearVoteButton.click();
      await expect(page.getByText("0/1 voted", { exact: true })).toBeVisible({ timeout: 15000 });
    }

    await page.getByLabel("Pizza").check();
    await page.getByRole("button", { name: "Submit vote" }).click();
    await expect(clearVoteButton).toBeEnabled({ timeout: 30000 });
    await clearVoteButton.click();
    await expect(clearVoteButton).toBeDisabled({ timeout: 30000 });
  });

  test("blocks voting when poll deadline has passed", async ({ page }) => {
    await loginAs(page, testUsers.owner);
    await openGeneralPollModal(page, "E2E Deadline Closed Poll", { tab: "closed" });

    await expect(page.getByRole("heading", { name: "E2E Deadline Closed Poll" }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Voting is closed because the deadline has passed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit vote" })).toHaveCount(0);
  });

  test("persists advanced vote privacy settings on standalone polls", async ({ page }) => {
    test.setTimeout(90000);
    const pollTitle = `E2E Standalone Privacy ${Date.now()}`;

    await loginAs(page, testUsers.owner);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Create new general poll/i }).click();

    const createModal = page
      .getByRole("heading", { name: "Create poll" })
      .locator("xpath=ancestor::div[contains(@class,'relative z-50')][1]");
    await expect(createModal).toBeVisible({ timeout: 15000 });
    await createModal.getByPlaceholder("What should we decide?").fill(pollTitle);
    await createModal.locator('input[placeholder="Option 1"]').fill("Friday");
    await createModal.locator('input[placeholder="Option 2"]').fill("Saturday");

    const createPrivacyPanel = createModal
      .getByRole("button", { name: /Advanced settings/i })
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")
      .first();
    await openPrivacySettings(createPrivacyPanel);
    await setSelectValue(createPrivacyPanel, 0, "Visible after everyone votes", page);
    await createPrivacyPanel
      .getByRole("checkbox", { name: "Hide list of participants who have already voted" })
      .check();
    await setSelectValue(createPrivacyPanel, 1, "Anonymous for everyone", page);

    await createModal.getByRole("button", { name: "Create poll", exact: true }).click();
    await expect(createModal).toHaveCount(0);

    const openPollModal = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: pollTitle }) })
      .filter({ has: page.getByRole("button", { name: "Close general poll modal" }) })
      .last();
    await expect(openPollModal).toBeVisible({ timeout: 15000 });
    await openPollModal.getByRole("button", { name: "General poll actions" }).click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();

    const editModal = page
      .getByRole("heading", { name: "Edit poll" })
      .locator("xpath=ancestor::div[contains(@class,'relative z-50')][1]");
    await expect(editModal).toBeVisible({ timeout: 15000 });
    const editPrivacyPanel = editModal
      .getByRole("button", { name: /Advanced settings/i })
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")
      .first();

    await expect(editPrivacyPanel.getByText(/Visible after everyone votes/i)).toBeVisible();
    await expect(editPrivacyPanel.getByText(/Anonymous for everyone/i)).toBeVisible();

    await openPrivacySettings(editPrivacyPanel);
    await expect(
      editPrivacyPanel.getByRole("checkbox", { name: "Hide list of participants who have already voted" })
    ).toBeChecked();

    await setSelectValue(editPrivacyPanel, 0, "Visible to participants immediately", page);
    await expect(
      editPrivacyPanel.getByRole("checkbox", { name: "Hide list of participants who have already voted" })
    ).toHaveCount(0);
  });
});
