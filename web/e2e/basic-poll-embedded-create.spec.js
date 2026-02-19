import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

async function loginAs(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 60000 });
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

test.describe.serial("Embedded poll create flow", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Basic poll e2e runs on chromium only.");
  });

  test("persists embedded polls added during /create flow", async ({ page }) => {
    test.setTimeout(120000);
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

    const schedulerPrivacyPanel = page
      .getByRole("button", { name: /Advanced settings/i })
      .last()
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    await openPrivacySettings(schedulerPrivacyPanel);
    await setSelectValue(schedulerPrivacyPanel, 0, "Visible after finalization", page);
    await schedulerPrivacyPanel
      .getByRole("checkbox", { name: "Hide voter names from participants" })
      .check();
    await setSelectValue(schedulerPrivacyPanel, 1, "Anonymous for everyone", page);

    await page.getByRole("button", { name: /^\+ Add poll$/ }).click();
    await expect(page.getByRole("heading", { name: "Add embedded poll" })).toBeVisible();
    const addModal = page.locator("div").filter({
      has: page.getByRole("heading", { name: "Add embedded poll" }),
    });
    await addModal.locator("input").first().fill(embeddedTitle);
    await addModal.locator('input[placeholder="Option 1"]').fill("Option One");
    await addModal.locator('input[placeholder="Option 2"]').fill("Option Two");
    const embeddedPrivacyPanel = addModal
      .getByRole("button", { name: /Advanced settings/i })
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")
      .first();
    await openPrivacySettings(embeddedPrivacyPanel);
    await setSelectValue(embeddedPrivacyPanel, 0, "Visible after each participant votes", page);
    await embeddedPrivacyPanel
      .getByRole("checkbox", { name: "Hide voter names from participants" })
      .check();
    await setSelectValue(embeddedPrivacyPanel, 1, "Anonymous for participants", page);
    const addPollButton = addModal.getByRole("button", { name: "Add poll", exact: true });
    await addPollButton.evaluate((element) => element.click());
    await expect(page.getByText(embeddedTitle)).toBeVisible();

    await page.getByRole("button", { name: "Create poll", exact: true }).click();
    await expect(page).toHaveURL(/\/scheduler\/[^/]+$/, { timeout: 60000 });
    await expect(page.getByText(/Anonymous\s+\w+/i).first()).toBeVisible({ timeout: 15000 });

    const createdSchedulerId = page.url().split("/scheduler/")[1];
    await page.goto(`/scheduler/${createdSchedulerId}/edit`);
    await expect(page.getByRole("heading", { name: "Edit Session Poll" })).toBeVisible();
    await expect(page.getByText(embeddedTitle)).toBeVisible({ timeout: 15000 });

    const editSchedulerPrivacyPanel = page
      .getByRole("button", { name: /Advanced settings/i })
      .last()
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    await expect(editSchedulerPrivacyPanel.getByText(/Visible after finalization/i)).toBeVisible();
    await expect(editSchedulerPrivacyPanel.getByText(/Anonymous for everyone/i)).toBeVisible();

    const embeddedCard = page
      .getByText(embeddedTitle, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await embeddedCard.getByRole("button", { name: "Edit", exact: true }).click();

    const editEmbeddedModal = page.locator("div").filter({
      has: page.getByRole("heading", { name: "Edit embedded poll" }),
    });
    const editEmbeddedPrivacyPanel = editEmbeddedModal
      .getByRole("button", { name: /Advanced settings/i })
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")
      .first();
    await expect(editEmbeddedPrivacyPanel.getByText(/Visible after each participant votes/i)).toBeVisible();
    await expect(editEmbeddedPrivacyPanel.getByText(/Anonymous for participants/i)).toBeVisible();
    await openPrivacySettings(editEmbeddedPrivacyPanel);
    await expect(
      editEmbeddedPrivacyPanel.getByRole("checkbox", { name: "Hide voter names from participants" })
    ).toBeChecked();
  });
});
