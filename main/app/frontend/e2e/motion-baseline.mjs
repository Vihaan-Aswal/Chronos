// Dev-only baseline capture for the motion pass. Not part of the app bundle.
// Usage: node e2e/motion-baseline.mjs
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
const outDir = process.env.OUT_DIR || ".impeccable/motion-baseline/app/screenshots";
const widths = [375, 768, 1280, 1920];

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

function analytics(sessionId = "default-session") {
  const metrics_timeline = Array.from({ length: 14 }, (_, i) => {
    const students = {};
    STUDENTS.forEach(([uid, base], index) => {
      students[uid] = {
        score: Math.max(0.1, Math.min(0.98, base + Math.sin((i + index) / 2.2) * 0.12)),
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

async function newContext(browser, { auth = false, role = "teacher", cameraDenied = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
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
  if (cameraDenied) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: () => Promise.reject(new Error("Permission denied")) },
      });
    });
  }
  return context;
}

async function mockRecords(page) {
  await page.route(/\/session\/analytics\/list/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(LIST) }),
  );
  await page.route(/\/session\/[^/]+\/analytics/, (route) => {
    const url = route.request().url();
    const id = decodeURIComponent(url.split("/session/")[1].split("/")[0]);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(analytics(id)),
    });
  });
}

async function shoot(page, name, width, { fullPage = true } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(350);
  const file = path.join(outDir, `${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage });
  return file;
}

async function captureRoute(browser, route) {
  const context = await newContext(browser, route);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  await mockBackend(page);
  if (route.records) await mockRecords(page);
  if (route.teacherSocket) await mockTeacherSocket(page);
  if (route.studentSocket) await mockStudentSocket(page, { nudge: route.nudge });
  if (route.signInError) await mockSupabaseSignIn(page, { ok: false });

  await page.goto(baseUrl + route.path, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(route.live ? 2400 : 1400);

  if (route.signInError) {
    await page.locator("#email").fill(FAKE_USER.email);
    await page.locator("#password").fill("wrong-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForTimeout(700);
  }

  const files = [];
  for (const width of widths) {
    files.push(await shoot(page, route.name, width, { fullPage: !route.live }));
  }

  if (route.report) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: /Open record/i }).first().click();
    await page.waitForTimeout(900);
    for (const width of widths) {
      files.push(await shoot(page, "record-report", width, { fullPage: false }));
    }
    await page.setViewportSize({ width: 1280, height: 3200 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, "record-report-full-1280.png") });
    await page.getByRole("button", { name: /Show details/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, "record-report-details-1280.png") });
  }

  if (route.dialogs) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Send a message to s-dev" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, "teacher-message-dialog-1280.png") });
    await page.getByRole("button", { name: /^Cancel$/ }).click();
    await page.getByRole("button", { name: "Remove s-dev from the room" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, "teacher-remove-dialog-1280.png") });
    await page.getByRole("button", { name: /Keep in room/ }).click();
    await page.getByRole("button", { name: /^End session$/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, "teacher-end-dialog-1280.png") });
    await page.getByRole("button", { name: /Keep teaching/ }).click();
  }

  if (route.nudge) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, "student-nudge-1280.png") });
  }

  const metrics = await page.evaluate(() => ({
    title: document.title,
    path: location.pathname + location.search,
    innerWidth: innerWidth,
    innerHeight: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  await context.close();
  return { route: route.name, metrics, files, errors };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const routes = [
    { name: "home", path: "/" },
    { name: "signin", path: "/signin" },
    { name: "signin-error", path: "/signin", signInError: true },
    { name: "signup", path: "/signup" },
    { name: "choose-role", path: "/choose-role", auth: true },
    { name: "readiness", path: "/readiness", auth: true },
    { name: "readiness-camera-denied", path: "/readiness", auth: true, cameraDenied: true },
    { name: "teacher-desk", path: "/teacher", auth: true },
    { name: "student-join", path: "/student", auth: true, role: "student" },
    { name: "records", path: "/records", auth: true, records: true, report: true },
    { name: "teacher-live", path: "/teacher?preview=live", auth: true, teacherSocket: true, live: true, dialogs: true },
    { name: "teacher-live-empty", path: "/teacher?preview=live", auth: true, live: true },
    { name: "student-live", path: "/student?preview=live", auth: true, role: "student", studentSocket: true, live: true, nudge: true },
    { name: "meeting", path: "/meeting?user=guest" },
    { name: "not-found", path: "/this-route-does-not-exist" },
  ];

  const results = [];
  for (const route of routes) {
    console.log("capture", route.name);
    results.push(await captureRoute(browser, route));
  }
  await browser.close();
  writeFileSync(
    path.join(outDir, "..", "screenshots.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, results }, null, 2),
  );
  console.log("captured", results.reduce((n, r) => n + r.files.length, 0), "screenshots");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
