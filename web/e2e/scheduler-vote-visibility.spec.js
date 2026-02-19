import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

async function signIn(page, user) {
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

test.describe("Scheduler vote visibility", () => {
  test("respects hidden and visible progress modes", async ({ page }) => {
    test.setTimeout(90000);
    const user = testUsers.participant;
    const hiddenWhileSchedulerId =
      process.env.E2E_VISIBILITY_HIDDEN_WHILE_SCHEDULER_ID || "e2e-visibility-hidden-while";
    const hiddenUntilFinalizedSchedulerId =
      process.env.E2E_VISIBILITY_HIDDEN_UNTIL_FINALIZED_SCHEDULER_ID ||
      "e2e-visibility-hidden-until-finalized";
    const fullVisibilitySchedulerId =
      process.env.E2E_VISIBILITY_FULL_SCHEDULER_ID || "e2e-visibility-full";

    await signIn(page, user);

    await openSchedulerAndWaitForTitle(
      page,
      hiddenWhileSchedulerId,
      "E2E Visibility Hidden While Voting"
    );
    await expect(page.getByText(/2 total\s*·\s*\d+ voted/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Vote details unlock after you submit your vote.")).toBeVisible({
      timeout: 15000,
    });

    await openSchedulerAndWaitForTitle(
      page,
      hiddenUntilFinalizedSchedulerId,
      "E2E Visibility Hidden Until Finalized"
    );
    await expect(page.getByText(/2 total\s*·\s*\d+ voted/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Vote details unlock once the poll is finalized.")).toBeVisible({
      timeout: 15000,
    });

    await openSchedulerAndWaitForTitle(page, fullVisibilitySchedulerId, "E2E Visibility Full");
    await expect(page.getByText(/2 total\s*·\s*\d+ voted/i)).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(/vote progress hidden/i)).toHaveCount(0);
  });
});
