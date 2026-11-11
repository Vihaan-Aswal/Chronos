import { test, expect } from "@playwright/test";

const WIDTHS = [375, 768, 1280, 1920];

test.describe("frozen homepage", () => {
  test("renders the room and the six-label argument", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /Notice the room/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Six labels/i }),
    ).toBeVisible();
    await expect(page.getByText("Signals, not surveillance.").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Host a class/i }).first()).toBeVisible();
  });

  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
