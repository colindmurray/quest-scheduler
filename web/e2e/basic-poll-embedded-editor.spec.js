import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

const embeddedEditorSchedulerId =
  process.env.E2E_EMBEDDED_EDITOR_SCHEDULER_ID || "e2e-embedded-editor-scheduler";
const existingEmbeddedPollTitle =
  process.env.E2E_EMBEDDED_EDITOR_POLL_TITLE || "E2E Embedded Editable Poll";

async function loginAs(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 60000 });
}

test.describe.serial("Embedded poll editor lifecycle", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Basic poll e2e runs on chromium only.");
  });

  test("supports add, edit, and remove for embedded polls in scheduler edit mode", async ({ page }) => {
    const cardForTitle = (title) =>
      page
        .getByText(title, { exact: true })
        .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");

    const addedTitle = "E2E Added Embedded Poll";
    const updatedAddedTitle = "E2E Added Embedded Poll Updated";
    const updatedExistingTitle = "E2E Embedded Editable Poll Updated";

    await loginAs(page, testUsers.owner);
    await page.goto(`/scheduler/${embeddedEditorSchedulerId}/edit`);

    await expect(page.getByRole("heading", { name: "Edit Session Poll" })).toBeVisible();
    await expect(page.getByText(existingEmbeddedPollTitle)).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /^\+ Add poll$/ }).click();
    const addModal = page.locator("div").filter({
      has: page.getByRole("heading", { name: "Add embedded poll" }),
    });
    await expect(page.getByRole("heading", { name: "Add embedded poll" })).toBeVisible();
    await addModal.locator('input[placeholder="Option 1"]').fill("Story-heavy");
    await addModal.locator('input[placeholder="Option 2"]').fill("Combat-heavy");
    await addModal.locator("input").first().fill(addedTitle);
    await addModal.getByRole("checkbox", { name: "Required poll" }).check();
    const addPollButton = addModal.getByRole("button", { name: "Add poll", exact: true });
    await addPollButton.evaluate((element) => element.click());

    await expect(page.getByText(addedTitle)).toBeVisible();

    const createdCard = cardForTitle(addedTitle);
    await createdCard.getByRole("button", { name: "Edit", exact: true }).click();
    const editAddedModal = page.locator("div").filter({
      has: page.getByRole("heading", { name: "Edit embedded poll" }),
    });
    await expect(page.getByRole("heading", { name: "Edit embedded poll" })).toBeVisible();
    await editAddedModal.locator("input").first().fill(updatedAddedTitle);
    await editAddedModal.getByRole("checkbox", { name: "Required poll" }).uncheck();
    const saveAddedPollButton = editAddedModal.getByRole("button", {
      name: "Save poll",
      exact: true,
    });
    await saveAddedPollButton.evaluate((element) => element.click());

    await expect(page.getByText(updatedAddedTitle)).toBeVisible();
    const updatedCard = cardForTitle(updatedAddedTitle);
    await expect(updatedCard.getByText("Optional")).toBeVisible();

    await updatedCard.getByRole("button", { name: "Remove", exact: true }).click();
    const removeDialog = page.getByRole("dialog");
    await expect(removeDialog.getByText("Remove add-on poll")).toBeVisible();
    await removeDialog.getByRole("button", { name: "Remove poll", exact: true }).click();
    await expect(page.getByText("Add-on poll removed")).toBeVisible({ timeout: 15000 });
    await expect(cardForTitle(updatedAddedTitle)).toHaveCount(0, { timeout: 30000 });

    const existingCard = cardForTitle(existingEmbeddedPollTitle);
    await existingCard.getByRole("button", { name: "Edit", exact: true }).click();
    const editExistingModal = page.locator("div").filter({
      has: page.getByRole("heading", { name: "Edit embedded poll" }),
    });
    await expect(page.getByRole("heading", { name: "Edit embedded poll" })).toBeVisible();
    await editExistingModal.locator("input").first().fill(updatedExistingTitle);
    const saveExistingPollButton = editExistingModal.getByRole("button", {
      name: "Save poll",
      exact: true,
    });
    await saveExistingPollButton.evaluate((element) => element.click());
    await expect(page.getByText(updatedExistingTitle)).toBeVisible();
  });
});
