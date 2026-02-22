import { expect, test } from "@playwright/test";

function resolveDiscordUrl(currentUrl) {
  const parsed = new URL(currentUrl);
  if (parsed.hostname === "discord.com") return parsed;
  const fallbackTarget = parsed.searchParams.get("u");
  if (!fallbackTarget) return null;
  const decoded = new URL(fallbackTarget);
  return decoded.hostname === "discord.com" ? decoded : null;
}

test.describe("Discord registration and login entry flow", () => {
  test("discord auth button is visible and starts OAuth redirect", async ({ page }) => {
    await page.goto("/auth");
    const discordButton = page.getByRole("button", { name: /continue with discord/i });

    await expect(discordButton).toBeVisible();
    await expect(discordButton).toBeEnabled();
    await discordButton.click();

    await expect
      .poll(() => page.url(), { timeout: 30000 })
      .toMatch(/discord\.com|about:neterror|about:blank/);

    const oauthUrl = resolveDiscordUrl(page.url());
    expect(oauthUrl).toBeTruthy();
    expect(oauthUrl.searchParams.get("client_id")).toBeTruthy();
    expect(oauthUrl.searchParams.get("redirect_uri")).toBeTruthy();
  });

  test("discord start flow shows user-facing error when callable fails", async ({ page }) => {
    await page.route("**/discordOAuthLoginStart", async (route) => {
      await route.abort("failed");
    });

    await page.goto("/auth");
    await page.getByRole("button", { name: /continue with discord/i }).click();

    await expect(page.getByText("Failed to start Discord login. Please try again.")).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with discord/i })).toBeEnabled();
  });

  test("discord finish page handles missing tokens safely", async ({ page }) => {
    await page.goto("/auth/discord/finish");
    await page.waitForURL(/\/auth\?error=missing_token/);
    await expect(page.getByText("Discord sign-in could not be completed. Please try again.")).toBeVisible();
  });

  test("discord finish page handles invalid tokens and returns to auth", async ({ page }) => {
    await page.goto("/auth/discord/finish?token=invalid-custom-token");
    await page.waitForURL(/\/auth\?error=discord_failed/);
    await expect(page.getByText("Discord sign-in failed. Please try again.")).toBeVisible();
  });
});
