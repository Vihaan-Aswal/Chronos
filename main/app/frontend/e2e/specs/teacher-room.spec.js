import { test, expect } from "@playwright/test";
import {
  mockBackend,
  mockTeacherSocket,
  seedSession,
} from "../helpers.js";

test.describe("teacher live room", () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, { role: "teacher" });
    await mockBackend(page);
  });

  test("priority roster, filter, and message composer", async ({ page }) => {
    await mockTeacherSocket(page);
    await page.goto("/teacher?preview=live");

    await expect(
      page.getByRole("heading", { name: /In the room/i }),
    ).toBeVisible();

    const rows = page.locator(".room-row");
    await expect(rows).toHaveCount(3);

    const priority = page.getByRole("button", { name: /Needs attention \(3\)/ });
    await expect(priority).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: /All students \(8\)/ }).click();
    await expect(rows).toHaveCount(8);

    await page
      .getByRole("button", { name: "Send a message to s-dev" })
      .click();
    const dialog = page.getByRole("dialog", { name: /Send a private message/i });
    await expect(dialog).toBeVisible();
    await dialog.locator("#teacher-message").fill("Look at the board for step 3.");
    await dialog.getByRole("button", { name: /Send message/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Message sent.")).toBeVisible();
  });

  test("remove asks first, then removes the row", async ({ page }) => {
    await mockTeacherSocket(page);
    await page.goto("/teacher?preview=live");
    await expect(page.locator(".room-row")).toHaveCount(3);

    await page
      .getByRole("button", { name: "Remove s-dev from the room" })
      .click();
    const dialog = page.getByRole("dialog", { name: /Remove from the room/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Remove$/ }).click();
    await expect(page.locator(".room-row")).toHaveCount(2);
  });

  test("ending the session opens the record", async ({ page }) => {
    await mockTeacherSocket(page);
    await page.goto("/teacher?preview=live");
    await expect(page.locator(".room-row").first()).toBeVisible();

    await page.getByRole("button", { name: /^End session$/ }).click();
    const dialog = page.getByRole("dialog", { name: /End the session/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^End session$/ }).click();

    await expect(
      page.getByRole("button", { name: /Export PDF/i }),
    ).toBeVisible();
  });

  test("empty room explains itself", async ({ page }) => {
    await page.goto("/teacher?preview=live");
    await expect(page.getByText("No students yet")).toBeVisible();
    await expect(
      page.getByText(/Students appear here as they join the room/i),
    ).toBeVisible();
  });
});
