// Dev-only audit: overflow, accessible names, heading order, small type, console errors.
import { chromium } from "@playwright/test";
import {
  FAKE_USER,
  mockBackend,
  mockStudentSocket,
  mockTeacherSocket,
  seedSession,
} from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5176";
const widths = [375, 768, 1280, 1920];
const routes = [
  { name: "home", path: "/", auth: false },
  { name: "signin", path: "/signin", auth: false },
  { name: "signup", path: "/signup", auth: false },
  { name: "choose-role", path: "/choose-role", auth: true, role: "teacher" },
  { name: "readiness", path: "/readiness", auth: true, role: "teacher" },
  { name: "teacher-desk", path: "/teacher", auth: true, role: "teacher" },
  {
    name: "teacher-live",
    path: "/teacher?preview=live",
    auth: true,
    role: "teacher",
    teacherSocket: true,
  },
  { name: "student-join", path: "/student", auth: true, role: "student" },
  {
    name: "student-live",
    path: "/student?preview=live",
    auth: true,
    role: "student",
    studentSocket: true,
  },
  { name: "records", path: "/records", auth: true, role: "teacher", records: true },
  { name: "not-found", path: "/does-not-exist", auth: false },
  { name: "meeting", path: "/meeting?user=guest", auth: false },
];

const EXPECTED = [
  /Failed to fetch/i,
  /ERR_FAILED/i,
  /CORS policy/i,
  /Permissions policy violation: unload/i,
  /\[HMS\] Join error/i,
  /TensorFlow Lite/i,
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
  ],
};

async function auditPage(browser, route, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    permissions: ["camera", "microphone"],
    reducedMotion: "reduce",
  });
  if (route.auth) {
    await context.addInitScript(
      ({ user, role }) => {
        sessionStorage.setItem("chronos_user", JSON.stringify(user));
        sessionStorage.setItem("chronos_role", role);
      },
      { user: FAKE_USER, role: route.role },
    );
  }
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await mockBackend(page);
  if (route.teacherSocket) await mockTeacherSocket(page);
  if (route.studentSocket) await mockStudentSocket(page);
  if (route.records) {
    await page.route(/\/session\/analytics\/list/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(list),
      }),
    );
  }
  await page.route(/\/identity\//, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        exists: true,
        embedding: Array.from({ length: 128 }, () => 0.02),
      }),
    }),
  );

  await page.goto(baseUrl + route.path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(route.teacherSocket || route.studentSocket ? 2600 : 1400);

  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const overflow = root.scrollWidth - root.clientWidth;
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
      (h) => Number(h.tagName.slice(1)),
    );
    const nameless = [];
    document.querySelectorAll("button, a[href]").forEach((el) => {
      const name =
        (el.getAttribute("aria-label") || "").trim() ||
        (el.textContent || "").trim() ||
        (el.getAttribute("title") || "").trim();
      if (!name) nameless.push(el.outerHTML.slice(0, 90));
    });
    document.querySelectorAll("input, select, textarea").forEach((el) => {
      const hasLabel =
        el.labels?.length > 0 ||
        el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby") ||
        el.getAttribute("title");
      if (!hasLabel) nameless.push(el.outerHTML.slice(0, 90));
    });
    const small = new Set();
    document.querySelectorAll("body *").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (!el.textContent || !el.textContent.trim()) return;
      if (el.children.length > 0 && el.textContent.trim().length > 60) return;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;
      const size = parseFloat(style.fontSize);
      if (size > 0 && size < 10) small.add(`${size}px:${el.className}`);
    });
    return {
      overflow,
      headings,
      nameless,
      small: [...small].slice(0, 8),
    };
  });

  await context.close();
  const unexpected = consoleErrors.filter(
    (text) => !EXPECTED.some((pattern) => pattern.test(text)),
  );
  return { route: route.name, width, ...result, consoleErrors: unexpected };
}

async function main() {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const rows = [];
  for (const route of routes) {
    for (const width of widths) {
      rows.push(await auditPage(browser, route, width));
    }
  }
  await browser.close();

  const problems = rows.filter(
    (r) =>
      r.overflow > 1 ||
      r.nameless.length > 0 ||
      r.consoleErrors.length > 0 ||
      r.headings.filter((h) => h === 1).length !== 1 ||
      r.headings.some((h, i) => i > 0 && h - r.headings[i - 1] > 1),
  );
  console.log("audited", rows.length, "page/width combinations");
  console.log("small type samples:", rows.flatMap((r) => r.small).slice(0, 6));
  if (problems.length === 0) {
    console.log("no overflow, nameless controls, heading skips, or unexpected console errors");
  } else {
    for (const p of problems) {
      console.log(JSON.stringify(p));
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
