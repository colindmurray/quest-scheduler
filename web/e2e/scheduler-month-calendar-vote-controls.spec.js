import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

test.describe("Scheduler month calendar vote controls", () => {
  test("supports inline month voting, +more modal voting, and calendar no-times toggle", async ({
    page,
  }) => {
    const schedulerId =
      process.env.E2E_MONTH_VOTE_SCHEDULER_ID || "e2e-month-calendar-votes";
    const user = testUsers.owner;

    await page.goto("/auth");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });

    await page.goto(`/scheduler/${schedulerId}`);
    await expect(page.getByText("E2E Month Calendar Vote Poll")).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("button", { name: "Calendar View" }).click();
    await expect(
      page.locator('[data-testid="calendar-no-times-work-toggle"] [role="switch"]')
    ).toBeVisible();

    const singleSlotCard = page.getByTestId("month-slot-month-slot-single");
    await expect(singleSlotCard).toBeVisible();
    const singleFeasibleButton = page.getByTestId(
      "month-slot-feasible-month-slot-single"
    );
    const singlePreferredButton = page.getByTestId(
      "month-slot-preferred-month-slot-single"
    );
    await expect(singleFeasibleButton).toBeVisible();
    await expect(singlePreferredButton).toBeVisible();

    await singleFeasibleButton.click();
    await expect(singleSlotCard).toHaveAttribute("data-vote-state", "feasible");
    await singlePreferredButton.click();
    await expect(singleSlotCard).toHaveAttribute("data-vote-state", "preferred");
    await singlePreferredButton.click();
    await expect(singleSlotCard).toHaveAttribute("data-vote-state", "none");

    const multiSlotCard = page.getByTestId("month-slot-month-slot-1");
    await expect(multiSlotCard).toBeVisible();
    const cycleButton = page.getByTestId("month-slot-cycle-month-slot-1");
    await expect(cycleButton).toBeVisible();
    await cycleButton.click();
    await expect(multiSlotCard).toHaveAttribute("data-vote-state", "feasible");
    await cycleButton.click();
    await expect(multiSlotCard).toHaveAttribute("data-vote-state", "preferred");
    await cycleButton.click();
    await expect(multiSlotCard).toHaveAttribute("data-vote-state", "none");

    await page.locator(".rbc-show-more").first().click();
    const voteModal = page.getByRole("dialog");
    await expect(voteModal.getByText(/^Vote for /)).toBeVisible();
    await expect(voteModal.getByText("No slots on this day.")).toHaveCount(0);
    const feasibleCount = await voteModal.getByText("Feasible").count();
    expect(feasibleCount).toBeGreaterThan(1);
    await voteModal.getByRole("button", { name: "Done" }).click();

    const noTimesSwitch = page.locator(
      '[data-testid="calendar-no-times-work-toggle"] [role="switch"]'
    );
    await noTimesSwitch.click();
    await expect(singleSlotCard).toHaveAttribute("data-vote-state", "unavailable");
    await expect(
      page.getByTestId("month-slot-feasible-month-slot-single")
    ).toHaveCount(0);
    await expect(page.getByTestId("month-slot-cycle-month-slot-1")).toHaveCount(0);
  });
});
