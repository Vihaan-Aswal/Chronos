import { test, expect } from "@playwright/test";
import { seedSession } from "../helpers.js";

test.describe("system pages", () => {
  test("unknown URLs land in the record, not a blank page", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(
      page.getByRole("heading", { name: /isn.t in the record/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to the homepage/i }),
    ).toBeVisible();
  });

  test("teacher desk links to records", async ({ page }) => {
    await seedSession(page, { role: "teacher" });
    await page.goto("/teacher");
    await expect(
      page.getByRole("heading", { name: /Before you join/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Open records/i }),
    ).toBeVisible();
  });
});
