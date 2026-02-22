import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

async function openRegisterTab(page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: /create account/i }).click();
}

test.describe("Cross-auth account behavior", () => {
  test("discord-only seeded user email cannot register as a password account", async ({ page }) => {
    await openRegisterTab(page);
    await page.getByLabel("Email", { exact: true }).fill(testUsers.discordOnly.email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm password").fill("password123");
    await page.getByLabel(/I agree to the/i).check();
    await page.getByRole("button", { name: /^create account$/i }).click();

    await expect(
      page.getByText("This email is already registered. Please log in instead.")
    ).toBeVisible();
  });

  test("discord-only seeded user email cannot log in with password", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Email", { exact: true }).fill(testUsers.discordOnly.email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.locator("form").getByRole("button", { name: /^log in$/i }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });

  test("auth page surfaces account-linking guidance for email conflicts", async ({ page }) => {
    await page.goto("/auth?error=email_conflict");
    await expect(
      page.getByText(
        "That email is already linked to another Discord account. Please log in with your existing method."
      )
    ).toBeVisible();
  });

  test("auth page surfaces account-linking guidance for discord account reuse", async ({ page }) => {
    await page.goto("/auth?error=discord_in_use");
    await expect(
      page.getByText("That Discord account is already linked to another Quest Scheduler account.")
    ).toBeVisible();
  });
});
