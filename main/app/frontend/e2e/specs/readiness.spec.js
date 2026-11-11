import { test, expect } from "@playwright/test";
import { seedSession } from "../helpers.js";

test.describe("readiness", () => {
  test("explains why join is disabled when no face is found", async ({ page }) => {
    await seedSession(page, { role: "teacher" });
    await page.goto("/readiness");

    await expect(
      page.getByRole("heading", { name: /Before you join/i }),
    ).toBeVisible();
    await expect(page.getByText(/You are joining as a teacher/i)).toBeVisible();

    const join = page.getByRole("button", { name: /Adjust your position/i });
    await expect(join).toBeDisabled();
    await expect(
      page.getByText(/Sit in front of the camera to begin/i),
    ).toBeVisible();
    await expect(
      page.getByText(/A face embedding is kept to verify you/i),
    ).toBeVisible();
  });

  test("sends a visitor without a role back to the fork", async ({ page }) => {
    await seedSession(page, { role: null });
    await page.goto("/readiness");
    await expect(page).toHaveURL(/\/choose-role$/);
  });
});
