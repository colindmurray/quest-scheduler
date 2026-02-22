import { expect, test } from "@playwright/test";
import { testUsers } from "./fixtures/test-users";

function uniqueEmail(prefix = "auth-e2e") {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  return `${prefix}-${stamp}@example.com`;
}

async function openRegisterTab(page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: /create account/i }).click();
}

test.describe("Email/password registration flow", () => {
  test("registration form renders with required fields", async ({ page }) => {
    await openRegisterTab(page);

    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByLabel(/I agree to the/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^create account$/i })).toBeVisible();
  });

  test("email input rejects invalid email format", async ({ page }) => {
    await openRegisterTab(page);

    await page.getByLabel("Email", { exact: true }).fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm password").fill("password123");
    await page.getByLabel(/I agree to the/i).check();
    await page.getByRole("button", { name: /^create account$/i }).click();

    const emailValid = await page
      .getByLabel("Email", { exact: true })
      .evaluate((input) => input.checkValidity());
    expect(emailValid).toBe(false);
  });

  test("password field rejects weak passwords via form validation", async ({ page }) => {
    await openRegisterTab(page);

    await page.getByLabel("Email", { exact: true }).fill(uniqueEmail("weak-password"));
    await page.getByLabel("Password", { exact: true }).fill("123");
    await page.getByLabel("Confirm password").fill("123");
    await page.getByLabel(/I agree to the/i).check();
    await page.getByRole("button", { name: /^create account$/i }).click();

    const passwordValid = await page
      .getByLabel("Password", { exact: true })
      .evaluate((input) => input.checkValidity());
    expect(passwordValid).toBe(false);
  });

  test("successful registration creates a signed-in session", async ({ page }) => {
    const email = uniqueEmail("register-success");
    const password = "password123";

    await openRegisterTab(page);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByLabel(/I agree to the/i).check();
    await page.getByRole("button", { name: /^create account$/i }).click();

    await expect(page.getByText("Account created. Verification email sent.")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("duplicate email registration shows a consistent error message", async ({ page }) => {
    await openRegisterTab(page);
    await page.getByLabel("Email", { exact: true }).fill(testUsers.owner.email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm password").fill("password123");
    await page.getByLabel(/I agree to the/i).check();
    await page.getByRole("button", { name: /^create account$/i }).click();

    await expect(
      page.getByText("This email is already registered. Please log in instead.")
    ).toBeVisible();
  });

  test("login succeeds after registration credentials are created", async ({ page, browser }) => {
    const email = uniqueEmail("register-then-login");
    const password = "password123";

    await openRegisterTab(page);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByLabel(/I agree to the/i).check();
    await page.getByRole("button", { name: /^create account$/i }).click();
    await expect(page.getByText("Account created. Verification email sent.")).toBeVisible();

    const freshContext = await browser.newContext();
    const loginPage = await freshContext.newPage();
    await loginPage.goto("/auth");
    await loginPage.getByLabel("Email", { exact: true }).fill(email);
    await loginPage.getByLabel("Password", { exact: true }).fill(password);
    await loginPage.locator("form").getByRole("button", { name: /^log in$/i }).click();
    await expect(loginPage).toHaveURL(/\/dashboard/);
    await freshContext.close();
  });

  test("password reset flow is available from login screen", async ({ page }) => {
    await page.goto("/auth");
    await page.getByRole("button", { name: /forgot password\?/i }).click();
    await expect(page.getByText("Reset your password")).toBeVisible();

    await page.getByPlaceholder("you@example.com").fill(testUsers.owner.email);
    await page.getByRole("button", { name: /send reset email/i }).click();

    await expect(
      page.getByText("If an account exists with this email, you'll receive an email shortly.")
    ).toBeVisible();
  });
});
