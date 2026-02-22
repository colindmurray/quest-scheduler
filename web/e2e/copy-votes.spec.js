import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

test.describe.serial("Copy votes", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Copy-votes flow mutates shared emulator state; run on chromium only.");
  });

  test("copies votes into a pending-invite poll and navigates to it", async ({ page }) => {
    const user = testUsers.owner;
    const sourceId = process.env.E2E_COPY_SOURCE_ID || "e2e-copy-source";
    const pendingId = process.env.E2E_COPY_PENDING_DEST_ID || "e2e-copy-destination-pending";
    const overlapTitle = "E2E Copy Overlap Review Poll";

    await page.goto("/auth");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.locator("form").getByRole("button", { name: /^log in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });

    await page.goto(`/scheduler/${sourceId}`);
    await expect(page.getByText("E2E Copy Source Poll")).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Poll options" }).click();
    await page.getByText("Copy votes", { exact: true }).click();

    await expect(page.getByRole("heading", { name: "Copy votes" })).toBeVisible();

    await page.getByLabel("Destination poll").click();
    await expect(page.getByText("E2E Copy Destination Poll", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(overlapTitle, { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("E2E Copy Pending Invite Poll", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("E2E Copy Already Voted Poll", { exact: true })).toHaveCount(0);

    // Validate copy warning UX on the normal destination poll (includes a "copied-extends" slot).
    await page.getByText("E2E Copy Destination Poll", { exact: true }).click();
    await expect(page.getByText("Copied", { exact: true })).toHaveCount(2);
    await expect(page.getByText("extends 1h past your source slot end", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Preferred dest-2")).toHaveAttribute("aria-checked", "true");

    // Validate overlap-review UX (starts before source, overlaps).
    await page.getByLabel("Destination poll").click();
    await page.getByText(overlapTitle, { exact: true }).click();
    await expect(page.getByText("Review", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Overlaps with your source vote (PREFERRED). Not copied because this slot starts earlier.", { exact: true })
    ).toBeVisible();
    await expect(page.getByLabel("Preferred overlap-1")).toHaveAttribute("aria-checked", "false");

    // Finally, copy into the pending invite poll and confirm navigation.
    await page.getByLabel("Destination poll").click();
    await page.getByText("E2E Copy Pending Invite Poll", { exact: true }).click();

    await expect(
      page.getByText("This poll is a pending invite", { exact: false })
    ).toBeVisible();

    await expect(page.getByText("Copied", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Preferred pdest-1")).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Confirm & go to poll" }).click();
    await page.waitForURL(new RegExp(`/scheduler/${pendingId}`), {
      timeout: 60000,
    });
    await expect(page.getByText("E2E Copy Pending Invite Poll")).toBeVisible();
  });
});
