// Dev-only: records + report fixtures for design review.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { FAKE_USER } from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5176";
const outDir = ".impeccable/redesign/states";
const widths = [375, 768, 1280, 1920];

const STUDENTS = [
  ["s-ananya", 0.86],
  ["s-rahul", 0.74],
  ["s-meera", 0.52],
  ["s-joseph", 0.33],
  ["s-fatima", 0.91],
  ["s-dev", 0.28],
  ["s-nisha", 0.61],
  ["sim-1", 0.66],
];

const list = {
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
    {
      id: "r3",
      session_id: "revision-hour",
      start_time: "2026-11-04T11:15:00Z",
      total_students: 6,
      duration_minutes: 28,
      avg_engagement_score: 0.72,
      tpi: 78,
    },
  ],
};

function makeAnalytics(sessionId = "default-session") {
  const metrics_timeline = Array.from({ length: 14 }, (_, i) => {
    const students = {};
    STUDENTS.forEach(([uid, base], index) => {
      students[uid] = {
        score: Math.max(
          0.1,
          Math.min(0.98, base + Math.sin((i + index) / 2.2) * 0.12),
        ),
        strikes: uid === "s-dev" ? 3 : 0,
        identityStatus: "verified",
        isSimulated: uid.startsWith("sim-"),
      };
    });
    return {
      timestamp: new Date(Date.UTC(2026, 10, 10, 9, i * 3)).toISOString(),
      avgScore: 0.55 + Math.sin(i / 2) * 0.1,
      studentCount: STUDENTS.length,
      students,
    };
  });

  return {
    exists: true,
    analytics: [
      {
        session_id: sessionId,
        teacher_id: FAKE_USER.id,
        start_time: "2026-11-10T09:00:00Z",
        duration_minutes: 42,
        avg_engagement_score: 0.68,
        total_students: 8,
        tpi: 74,
        metrics_timeline,
        confusion_hotspots: [
          { time: "6m", percentage: 38 },
          { time: "18m", percentage: 52 },
          { time: "30m", percentage: 27 },
        ],
        at_risk_students: [
          {
            userId: "s-dev",
            avgScore: 0.28,
            strikes: 3,
            identityIssues: 0,
            reason: "Low engagement (28%), 3 disengagement strikes",
          },
          {
            userId: "s-joseph",
            avgScore: 0.33,
            strikes: 0,
            identityIssues: 3,
            reason: "Low engagement (33%), 3 identity violations",
          },
        ],
      },
    ],
  };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ({ user }) => {
      sessionStorage.setItem("chronos_user", JSON.stringify(user));
      sessionStorage.setItem("chronos_role", "teacher");
    },
    { user: FAKE_USER },
  );
  const page = await context.newPage();
  await page.route(/\/session\/analytics\/list/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(list),
    }),
  );
  await page.route(/\/session\/[^/]+\/analytics/, (route) => {
    const url = route.request().url();
    const id = decodeURIComponent(url.split("/session/")[1].split("/")[0]);
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeAnalytics(id)),
    });
  });

  await page.goto(`${baseUrl}/records`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, `records-${width}.png`) });
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: /Open record/i }).first().click();
  await page.waitForTimeout(900);

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(outDir, `record-report-${width}.png`),
      fullPage: false,
    });
  }

  // Expanded per-student section.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: /Show details/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(outDir, "record-report-details-1280.png"),
  });

  await page.setViewportSize({ width: 1280, height: 3400 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(outDir, "record-report-full-1280.png"),
  });

  // Empty records state.
  const emptyPage = await context.newPage();
  await emptyPage.route(/\/session\/analytics\/list/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  await emptyPage.goto(`${baseUrl}/records`, { waitUntil: "domcontentloaded" });
  await emptyPage.waitForTimeout(700);
  await emptyPage.screenshot({ path: path.join(outDir, "records-empty-1280.png") });

  await browser.close();
  console.log("records states captured to", outDir);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
