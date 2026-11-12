// Dev-only 4x CPU trace for the pilot. Not part of the app.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  FAKE_USER,
  mockBackend,
  mockTeacherSocket,
} from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const outDir = ".impeccable/motion-after/app/traces";

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["camera", "microphone"],
    reducedMotion: "no-preference",
  });
  await context.addInitScript(
    ({ user }) => {
      sessionStorage.setItem("chronos_user", JSON.stringify(user));
      sessionStorage.setItem("chronos_role", "teacher");
    },
    { user: FAKE_USER },
  );
  const page = await context.newPage();
  await mockBackend(page);
  await mockTeacherSocket(page);
  const cdp = await context.newCDPSession(page);
  const cpuRate = Number(process.env.CPU || 4); if (cpuRate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });

  await page.goto(`${baseUrl}/teacher?preview=live`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  await page.evaluate(() => {
    window.__pilotPerf = { longTasks: [], shifts: 0, shiftValue: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__pilotPerf.longTasks.push({ start: entry.startTime, duration: entry.duration });
        }
      }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__pilotPerf.shifts += 1;
            window.__pilotPerf.shiftValue += entry.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });

  const events = [];
  cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));
  const done = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline",
    transferMode: "ReportEvents",
  });

  await page.getByRole("button", { name: /All students/i }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Needs attention/i }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Mark s-dev engaged/i }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Send a message to s-dev" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Cancel$/ }).click();
  await page.waitForTimeout(500);

  await cdp.send("Tracing.end");
  await done;
  const perf = await page.evaluate(() => window.__pilotPerf);
  writeFileSync(path.join(outDir, `teacher-live-${cpuRate}x.json`), JSON.stringify(events));
  writeFileSync(path.join(outDir, `teacher-live-${cpuRate}x-summary.json`), JSON.stringify({ perf, eventCount: events.length }, null, 2));
  await context.close();
  await browser.close();
  console.log(JSON.stringify({ perf, eventCount: events.length }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
