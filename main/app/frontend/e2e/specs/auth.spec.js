import { test, expect } from "@playwright/test";
import { mockSupabaseSignIn, seedSession, FAKE_USER } from "../helpers.js";

test.describe("auth", () => {
  test("guarded route sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("sign-in stores the user and moves to role choice", async ({ page }) => {
    await mockSupabaseSignIn(page, { ok: true });
    await page.goto("/signin");
    await page.locator("#email").fill(FAKE_USER.email);
    await page.locator("#password").fill("password123");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/choose-role$/);
    const stored = await page.evaluate(() =>
      sessionStorage.getItem("chronos_user"),
    );
    expect(stored).toContain(FAKE_USER.email);
  });

  test("sign-in shows the provider error without leaving the page", async ({ page }) => {
    await mockSupabaseSignIn(page, { ok: false });
    await page.goto("/signin");
    await page.locator("#email").fill(FAKE_USER.email);
    await page.locator("#password").fill("wrong-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByText(/Invalid login credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/signin$/);
  });

  test("password visibility toggle works and is labelled", async ({ page }) => {
    await page.goto("/signin");
    const password = page.locator("#password");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: /show password/i }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: /hide password/i }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("sign-up catches a password mismatch before calling auth", async ({ page }) => {
    await page.goto("/signup");
    await page.locator("#email").fill("new@chronos.local");
    await page.locator("#password").fill("password123");
    await page.locator("#confirmPassword").fill("password124");
    await page.getByRole("button", { name: /sign up|create account/i }).click();
    await expect(page.getByText(/Passwords do not match/i)).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("role choice stores the role and continues", async ({ page }) => {
    await seedSession(page, { role: null });
    await page.goto("/choose-role");
    await page.getByRole("button", { name: /continue as teacher/i }).click();
    await expect(page).toHaveURL(/\/readiness$/);
    expect(await page.evaluate(() => sessionStorage.getItem("chronos_role"))).toBe(
      "teacher",
    );
  });
});
