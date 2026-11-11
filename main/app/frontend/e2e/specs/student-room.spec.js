import { test, expect } from "@playwright/test";
import { mockStudentSocket, seedSession } from "../helpers.js";

test.describe("student live room", () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, { role: "student" });
  });

  test("shows the student's own signals and the camera check", async ({ page }) => {
    await mockStudentSocket(page);
    await page.goto("/student?preview=live");

    await expect(
      page.getByRole("heading", { name: /Your signals/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Your teacher sees repeated concerns, not every glance/i),
    ).toBeVisible();
    await expect(page.getByText(/A nudge is a quiet message, not a mark/i)).toBeVisible();
    await expect(page.getByText("Camera check")).toBeVisible();
  });

  test("the signals rail can be hidden and shown", async ({ page }) => {
    await mockStudentSocket(page);
    await page.goto("/student?preview=live");
    const rail = page.locator("#student-signals");
    const toggle = page.getByRole("button", { name: /Hide signals/i });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(rail).toHaveClass(/is-closed/);
    await page.getByRole("button", { name: /^Your signals$/i }).click();
    await expect(rail).toHaveClass(/is-open/);
  });

  test("a nudge arrives as a quiet note", async ({ page }) => {
    await mockStudentSocket(page, { nudge: true });
    await page.goto("/student?preview=live");
    await expect(page.getByText("A quiet nudge")).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("Look at the board for step 3."),
    ).toBeVisible();
  });

  test("leaving returns home", async ({ page }) => {
    await mockStudentSocket(page);
    await page.goto("/student?preview=live");
    await page.getByRole("button", { name: /^Leave$/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
