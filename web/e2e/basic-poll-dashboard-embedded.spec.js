import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

const schedulerId = process.env.E2E_SCHEDULER_ID || "e2e-scheduler";
const embeddedPollId = process.env.E2E_EMBEDDED_BASIC_POLL_ID || "e2e-embedded-required-poll";

async function loginAs(page, user) {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  if (page.url().includes("/dashboard")) return;
  const emailInput = page.getByLabel("Email");
  const passwordInput = page.getByLabel("Password");
  await expect(emailInput).toBeVisible({ timeout: 30000 });
  await expect(passwordInput).toBeVisible({ timeout: 30000 });
  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);
  await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 60000 });
}

async function clickDashboardCard(page, title) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const card = page
      .locator("article[role='button']")
      .filter({ hasText: title })
      .first();
    await expect(card).toBeVisible({ timeout: 15000 });
    try {
      await card.click({ timeout: 5000 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(250);
    }
  }
}

test.describe.serial("Basic Poll dashboard and embedded flow", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Basic poll e2e runs on chromium only.");
  });

  test("shows polls-to-vote links and supports embedded deep-link navigation", async ({ page }) => {
    test.setTimeout(90000);
    await loginAs(page, testUsers.owner);

    await page.goto("/dashboard");
    const search = page.getByPlaceholder("Search title or description");
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill("E2E Embedded Required Poll");
    await expect(page.locator("article[role='button']").filter({ hasText: "E2E Embedded Required Poll" }).first()).toBeVisible({
      timeout: 15000,
    });

    await clickDashboardCard(page, "E2E Embedded Required Poll");

    await expect(page).toHaveURL(new RegExp(`/scheduler/${schedulerId}\\?poll=${embeddedPollId}`));
    await expect(page.getByText("E2E Embedded Required Poll")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "View note for In person" }).click();
    await expect(
      page.getByRole("dialog", { name: "Option note for In person" })
    ).toBeVisible();
    await expect(page.getByText("physical dice")).toBeVisible();
    await page
      .getByRole("dialog", { name: "Option note for In person" })
      .getByRole("button", { name: "Close" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Option note for In person" })
    ).toHaveCount(0);

    await page.goto("/dashboard");
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill("E2E Dashboard Group Poll");
    await expect(page.locator("article[role='button']").filter({ hasText: "E2E Dashboard Group Poll" }).first()).toBeVisible({
      timeout: 15000,
    });
    await clickDashboardCard(page, "E2E Dashboard Group Poll");
    await expect(page.getByText("Loading group poll...")).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText("Questing group: E2E Group Owner")).toBeVisible();
    await page.getByRole("button", { name: "Close general poll modal" }).click();
  });

  test("can create a new general poll from dashboard", async ({ page }) => {
    test.setTimeout(90000);
    await loginAs(page, testUsers.owner);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Create new general poll" }).click();

    await expect(page.getByRole("heading", { name: "Create poll" })).toBeVisible();
    await page.getByPlaceholder("What should we decide?").fill("E2E Dashboard Created Poll");

    const optionInputs = page.locator("input[placeholder^='Option ']");
    await optionInputs.nth(0).fill("Option One");
    await optionInputs.nth(1).fill("Option Two");

    await page.getByRole("button", { name: "Create poll" }).click({ force: true });
    await expect(
      page.locator("h2", { hasText: "E2E Dashboard Created Poll" }).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("can edit a general poll from dashboard card actions", async ({ page }) => {
    test.setTimeout(90000);
    await loginAs(page, testUsers.owner);
    await page.goto("/dashboard");

    const createdTitle = `E2E Dashboard Editable Poll ${Date.now()}`;
    const updatedTitle = `${createdTitle} Updated`;

    await page.getByRole("button", { name: "Create new general poll" }).click();
    await expect(page.getByRole("heading", { name: "Create poll" })).toBeVisible();
    await page.getByPlaceholder("What should we decide?").fill(createdTitle);

    const optionInputs = page.locator("input[placeholder^='Option ']");
    await optionInputs.nth(0).fill("Editable Option One");
    await optionInputs.nth(1).fill("Editable Option Two");

    await page.getByRole("button", { name: "Create poll" }).click({ force: true });
    await expect(page.getByRole("button", { name: "Close general poll modal" })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "Close general poll modal" }).click();
    const search = page.getByPlaceholder("Search title or description");
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill(createdTitle);
    const card = page
      .locator("article[role='button']")
      .filter({ hasText: createdTitle })
      .first();
    await expect(card).toBeVisible({ timeout: 15000 });

    await card.getByRole("button", { name: "General poll actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    await expect(page.getByRole("heading", { name: "Edit poll" })).toBeVisible();
    await page.getByPlaceholder("What should we decide?").fill(updatedTitle);
    await page.getByRole("button", { name: "Save changes" }).click({ force: true });

    await expect(
      page
        .locator("article[role='button']")
        .filter({ hasText: updatedTitle })
        .first()
    ).toBeVisible({ timeout: 15000 });
  });
});
