// Dev-only hardening checks for the motion pass.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  FAKE_USER,
  mockBackend,
  mockStudentSocket,
  mockTeacherSocket,
} from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const outDir = ".impeccable/motion-after/app";
const routes = [
  { name: "signin", path: "/signin" },
  { name: "signup", path: "/signup" },
  { name: "choose-role", path: "/choose-role", auth: true },
  { name: "readiness", path: "/readiness", auth: true },
  { name: "records", path: "/records", auth: true, records: true },
  { name: "teacher-live", path: "/teacher?preview=live", auth: true, teacher: true },
  { name: "student-live", path: "/student?preview=live", auth: true, role: "student", student: true },
  { name: "meeting", path: "/meeting?user=guest" },
  { name: "not-found", path: "/does-not-exist" },
];

async function contextFor(browser, { auth = false, role = "teacher", reducedMotion = "no-preference", query = "" } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["camera", "microphone"],
    reducedMotion,
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

async function prepare(page, route) {
  await mockBackend(page);
  if (route.records) {
    await page.route(/\/session\/analytics\/list/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
        }),
      }),
    );
  }
  if (route.teacher) await mockTeacherSocket(page);
  if (route.student) await mockStudentSocket(page, { nudge: false });
}

async function auditPage(page, route, { reducedMotion } = {}) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  await prepare(page, route);
  await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(route.teacher || route.student ? 2200 : 1200);
  const data = await page.evaluate(() => {
    const root = document.documentElement;
    const fact = document.querySelector(".auth-fact");
    const row = document.querySelector(".room-row");
    const rule = document.querySelector(".app-header") || document.querySelector(".room-bar");
    const cs = fact ? getComputedStyle(fact) : null;
    const rowCs = row ? getComputedStyle(row) : null;
    const ruleCs = rule ? getComputedStyle(rule, "::after") : null;
    return {
      mode: window.chronosMotion?.get?.(),
      attr: root.dataset.motion || null,
      rise: cs?.getPropertyValue("--motion-rise").trim() || null,
      factAnimation: cs?.animationName || null,
      rowAnimation: rowCs?.animationName || null,
      ruleAnimation: ruleCs?.animationName || null,
      overflow: root.scrollWidth - root.clientWidth,
    };
  });
  return { route: route.name, reducedMotion, ...data, errors: errors.filter((e) => !/Permissions policy violation: unload/.test(e)) };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const results = [];

  // Reduced motion and global off across representative pages.
  for (const route of [routes[0], routes[2], routes[3], routes[4], routes[5], routes[6], routes[7], routes[8]]) {
    const context = await contextFor(browser, {
      auth: route.auth,
      role: route.role || "teacher",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    results.push(await auditPage(page, route, { reducedMotion: "reduce" }));
    await context.close();
  }

  for (const route of [routes[0], routes[2], routes[4], routes[5], routes[7], routes[8]]) {
    const context = await contextFor(browser, { auth: route.auth, role: route.role || "teacher" });
    const page = await context.newPage();
    await page.goto(`${baseUrl}${route.path}${route.path.includes("?") ? "&" : "?"}motion=off`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    results.push(await auditPage(page, route, { reducedMotion: "off" }));
    await context.close();
  }

  // Rapid filter/dialog interruption + resize + hidden pause on teacher live.
  {
    const context = await contextFor(browser, { auth: true });
    const page = await context.newPage();
    await prepare(page, routes[5]);
    await page.goto(`${baseUrl}${routes[5].path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    const errors = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (err) => errors.push(String(err)));
    for (let i = 0; i < 10; i++) {
      await page.getByRole("button", { name: /All students/i }).click();
      await page.getByRole("button", { name: /Needs attention/i }).click();
    }
    await page.waitForTimeout(400);
    const rowCount = await page.locator(".room-row").count();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Send a message to s-dev" }).click();
      await page.getByRole("button", { name: /^Cancel$/ }).click();
    }
    await page.waitForTimeout(300);
    const dialogOpen = await page.locator("dialog[open]").count();
    await page.setViewportSize({ width: 375, height: 700 });
    await page.waitForTimeout(300);
    const overflowSmall = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(300);
    const hidden = await page.evaluate(() => {
      document.documentElement.dataset.hidden = "true";
      const dot = document.querySelector(".room-connection i");
      const cs = dot ? getComputedStyle(dot) : null;
      return { animationPlayState: cs?.animationPlayState || null };
    });
    results.push({
      route: "teacher-live-interruption",
      rowCount,
      dialogOpen,
      overflowSmall,
      hidden,
      errors: errors.filter((e) => !/Permissions policy violation: unload/.test(e)),
    });
    await context.close();
  }

  // Fast repeated route navigation.
  {
    const context = await contextFor(browser, { auth: true });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (err) => errors.push(String(err)));
    const sequence = ["/signin", "/signup", "/choose-role", "/readiness", "/records", "/teacher", "/does-not-exist"];
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const path of sequence) {
        await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(120);
      }
    }
    results.push({
      route: "route-loop",
      errors: errors.filter((e) => !/Permissions policy violation: unload/.test(e)),
    });
    await context.close();
  }

  await browser.close();
  writeFileSync(path.join(outDir, "hardening.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
