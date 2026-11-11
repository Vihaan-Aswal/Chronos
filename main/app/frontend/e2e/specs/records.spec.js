import { test, expect } from "@playwright/test";
import { FAKE_USER, seedSession } from "../helpers.js";

const LIST = {
  sessions: [
    {
      id: "r1",
      session_id: "default-session",
      start_time: "2026-11-10T09:00:00Z",
      total_students: 8,
      duration_minutes: 42,
      avg_engagement_score: 0.68,
      tpi: 74,
    },
    {
      id: "r2",
      session_id: "staff-briefing",
      start_time: "2026-11-07T14:30:00Z",
      total_students: 12,
      duration_minutes: 55,
      avg_engagement_score: 0.61,
      tpi: 66,
    },
  ],
};

const ANALYTICS = {
  exists: true,
  analytics: [
    {
      session_id: "default-session",
      teacher_id: FAKE_USER.id,
      start_time: "2026-11-10T09:00:00Z",
      duration_minutes: 42,
      avg_engagement_score: 0.68,
      total_students: 8,
      tpi: 74,
      metrics_timeline: Array.from({ length: 8 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2026, 10, 10, 9, i * 3)).toISOString(),
        avgScore: 0.55 + Math.sin(i / 2) * 0.1,
        studentCount: 2,
        students: {
          "s-ananya": { score: 0.8, isSimulated: false },
          "s-dev": { score: 0.3, isSimulated: false },
        },
      })),
      confusion_hotspots: [{ time: "6m", percentage: 38 }],
      at_risk_students: [
        {
          userId: "s-dev",
          avgScore: 0.28,
          strikes: 3,
          identityIssues: 0,
          reason: "Low engagement (28%), 3 disengagement strikes",
        },
      ],
    },
  ],
};

test.describe("records", () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, { role: "teacher" });
    await page.route(/\/session\/analytics\/list/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(LIST),
      }),
    );
    await page.route(/\/session\/[^/]+\/analytics/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ANALYTICS),
      }),
    );
  });

  test("lists records and opens one", async ({ page }) => {
    await page.goto("/records");
    await expect(
      page.getByRole("heading", { name: /Session records/i }),
    ).toBeVisible();
    await expect(page.getByText("default-session")).toBeVisible();
    await expect(page.getByText("staff-briefing")).toBeVisible();

    await page.getByRole("button", { name: /Open record/i }).first().click();
    await expect(
      page.getByRole("heading", { name: /^Session record$/i }),
    ).toBeVisible();
    const report = page.getByRole("dialog", { name: "Session record" });
    await expect(report.getByText("TPI", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Export PDF/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^Close record$/ }).click();
    await expect(page.getByText("default-session")).toBeVisible();
  });

  test("empty records explain what will appear", async ({ page }) => {
    await page.unroute(/\/session\/analytics\/list/);
    await page.route(/\/session\/analytics\/list/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [] }),
      }),
    );
    await page.goto("/records");
    await expect(page.getByText("No records yet")).toBeVisible();
    await expect(
      page.getByText(/End a class and save the record/i),
    ).toBeVisible();
  });

  test("record list failure offers a retry", async ({ page }) => {
    await page.unroute(/\/session\/analytics\/list/);
    await page.route(/\/session\/analytics\/list/, (route) =>
      route.fulfill({ status: 500, body: "nope" }),
    );
    await page.goto("/records");
    await expect(page.getByText(/The records could not load/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Try again/i })).toBeVisible();
  });
});
