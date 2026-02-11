import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

const schedulerId = process.env.E2E_SCHEDULER_ID || "e2e-scheduler";
const embeddedPollId = process.env.E2E_EMBEDDED_BASIC_POLL_ID || "e2e-embedded-required-poll";

async function loginAs(page, user) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 60000 });
}

async function ensureEmbeddedPollOpen(page, pollId) {
  const card = page.locator(`#embedded-poll-${pollId}`);
  await expect(card).toBeVisible({ timeout: 15000 });
  const reopenButton = card.getByRole("button", { name: "Re-open poll" });
  if (await reopenButton.isVisible()) {
    await reopenButton.click();
    await expect(card.getByRole("button", { name: "Finalize poll" })).toBeVisible();
  }
}

test.describe.serial("Embedded poll finalize controls", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Basic poll e2e runs on chromium only.");
  });

  test("creator can finalize and re-open an embedded poll individually", async ({ page }) => {
    await loginAs(page, testUsers.owner);
    await page.goto(`/scheduler/${schedulerId}?poll=${embeddedPollId}`);

    await ensureEmbeddedPollOpen(page, embeddedPollId);
    const card = page.locator(`#embedded-poll-${embeddedPollId}`);
    await expect(card.getByText("E2E Embedded Required Poll")).toBeVisible();

    const finalizeButton = card.getByRole("button", { name: "Finalize poll" });
    const reopenButton = card.getByRole("button", { name: "Re-open poll" });

    if (await reopenButton.isVisible()) {
      await reopenButton.click();
      await expect(finalizeButton).toBeVisible();
    }

    await finalizeButton.click();
    await expect(reopenButton).toBeVisible();
    await expect(card.getByText("Finalized", { exact: true })).toBeVisible();

    await reopenButton.click();
    await expect(finalizeButton).toBeVisible();
    await expect(card.getByText("Open", { exact: true })).toBeVisible();
  });

  test("session finalize flow prompts whether to finalize embedded polls too", async ({ page }) => {
    await loginAs(page, testUsers.owner);
    await page.goto(`/scheduler/${schedulerId}?poll=${embeddedPollId}`);
    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({ timeout: 15000 });
    await ensureEmbeddedPollOpen(page, embeddedPollId);

    await page.getByRole("button", { name: "Select winner" }).first().click();

    const requiredWarningDialog = page.getByRole("dialog").filter({
      has: page.getByText("Finalize with missing required poll votes?"),
    });
    const requiredWarningVisible = await requiredWarningDialog
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (requiredWarningVisible) {
      await requiredWarningDialog.getByRole("button", { name: "Finalize anyway" }).click();
    }

    const embeddedChoiceDialog = page.getByRole("dialog").filter({
      has: page.getByText("Finalize embedded polls too?"),
    });
    await expect(embeddedChoiceDialog).toBeVisible();
    await embeddedChoiceDialog.getByRole("button", { name: "Finalize session only" }).click();

    const finalizeDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Finalize session" }),
    });
    await expect(finalizeDialog).toBeVisible();
    await finalizeDialog.getByRole("button", { name: "Cancel" }).click();
  });
});
