// Dev-only baseline performance traces for key interactions. Not part of the app.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  FAKE_USER,
  mockBackend,
  mockStudentSocket,
  mockSupabaseSignIn,
  mockTeacherSocket,
} from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const outDir = ".impeccable/motion-baseline/app/traces";
const widths = { viewport: { width: 1280, height: 900 } };

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
  ],
};

const analytics = {
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
      metrics_timeline: Array.from({ length: 10 }, (_, i) => ({
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
        { userId: "s-dev", avgScore: 0.28, strikes: 3, identityIssues: 0, reason: "Low engagement (28%), 3 disengagement strikes" },
      ],
    },
  ],
};

async function contextFor(browser, { auth = false, role = "teacher" } = {}) {
  const context = await browser.newContext({
    ...widths,
    permissions: ["camera", "microphone"],
    reducedMotion: "reduce",
  });
  if (auth) {
    await context.addInitScript(
      ({ user, role }) => {
        sessionStorage.setItem("chronos_user", JSON.stringify(user));
        sessionStorage.setItem("chronos_role", role);
      },
      { user: FAKE_USER, role },
    );
  }
  return context;
}

async function tracePage(context, name, prepare, interact) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const events = [];
  cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));
  await prepare(page);
  await page.evaluate(() => {
    window.__motionPerf = { longTasks: [], shifts: 0, shiftValue: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__motionPerf.longTasks.push({ start: entry.startTime, duration: entry.duration });
        }
      }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__motionPerf.shifts += 1;
            window.__motionPerf.shiftValue += entry.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  const done = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline",
    transferMode: "ReportEvents",
  });
  await interact(page);
  await page.waitForTimeout(700);
  await cdp.send("Tracing.end");
  await done;
  const perf = await page.evaluate(() => window.__motionPerf);
  const file = path.join(outDir, `${name}.json`);
  writeFileSync(file, JSON.stringify(events));
  await context.close();
  return { name, file, perf, eventCount: events.length };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const results = [];

  // Sign in error path.
  {
    const context = await contextFor(browser);
    results.push(
      await tracePage(
        context,
        "signin-error",
        async (p) => {
          await mockSupabaseSignIn(p, { ok: false });
          await p.goto(`${baseUrl}/signin`, { waitUntil: "domcontentloaded" });
          await p.waitForTimeout(1000);
        },
        async (p) => {
          await p.locator("#email").fill(FAKE_USER.email);
          await p.locator("#password").fill("wrong-password");
          await p.getByRole("button", { name: /^sign in$/i }).click();
          await p.waitForTimeout(500);
        },
      ),
    );
  }

  // Teacher live: filter and nudge.
  {
    const context = await contextFor(browser, { auth: true });
    results.push(
      await tracePage(
        context,
        "teacher-live",
        async (p) => {
          await mockBackend(p);
          await mockTeacherSocket(p);
          await p.goto(`${baseUrl}/teacher?preview=live`, { waitUntil: "domcontentloaded" });
          await p.waitForTimeout(2200);
        },
        async (p) => {
          await p.getByRole("button", { name: /All students/i }).click();
          await p.waitForTimeout(250);
          await p.getByRole("button", { name: /Needs attention/i }).click();
          await p.waitForTimeout(250);
          await p.getByRole("button", { name: /Mark s-dev engaged/i }).click();
          await p.waitForTimeout(400);
        },
      ),
    );
  }

  // Student live: nudge.
  {
    const context = await contextFor(browser, { auth: true, role: "student" });
    results.push(
      await tracePage(
        context,
        "student-live-nudge",
        async (p) => {
          await mockBackend(p);
          await mockStudentSocket(p, { nudge: true });
          await p.goto(`${baseUrl}/student?preview=live`, { waitUntil: "domcontentloaded" });
          await p.waitForTimeout(1200);
        },
        async (p) => {
          await p.waitForTimeout(2200);
        },
      ),
    );
  }

  // Records: open record and expand details.
  {
    const context = await contextFor(browser, { auth: true });
    results.push(
      await tracePage(
        context,
        "records-report",
        async (p) => {
          await p.route(/\/session\/analytics\/list/, (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) }),
          );
          await p.route(/\/session\/[^/]+\/analytics/, (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(analytics) }),
          );
          await p.goto(`${baseUrl}/records`, { waitUntil: "domcontentloaded" });
          await p.waitForTimeout(1000);
        },
        async (p) => {
          await p.getByRole("button", { name: /Open record/i }).first().click();
          await p.waitForTimeout(600);
          await p.getByRole("button", { name: /Show details/i }).click();
          await p.waitForTimeout(400);
        },
      ),
    );
  }

  await browser.close();
  writeFileSync(
    path.join(outDir, "..", "traces-summary.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
