// Dev-only pilot check: screenshots of the teacher rail.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  FAKE_USER,
  mockBackend,
  mockTeacherSocket,
} from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const outDir = ".impeccable/motion-after/app";

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
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  await mockBackend(page);
  await mockTeacherSocket(page);
  await page.goto(`${baseUrl}/teacher?preview=live`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: path.join(outDir, "pilot-teacher-live-1280.png") });

  await page.getByRole("button", { name: /All students/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "pilot-teacher-all-1280.png") });
  await page.getByRole("button", { name: /Needs attention/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Mark s-dev engaged/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Send a message to s-dev" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "pilot-teacher-dialog-1280.png") });
  await page.getByRole("button", { name: /^Cancel$/ }).click();
  await page.waitForTimeout(500);

  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, "pilot-teacher-live-375.png") });
  const railToggle = page.locator(".room-toggle");
  if ((await railToggle.getAttribute("aria-expanded")) !== "true") {
    await railToggle.click();
    await page.waitForTimeout(500);
  }
  const rail = await page.evaluate(() => {
    const el = document.querySelector("#teacher-live-dashboard-rail");
    const r = el?.getBoundingClientRect();
    return {
      className: el?.className,
      display: el ? getComputedStyle(el).display : null,
      rect: r ? { top: r.top, height: r.height } : null,
      toggles: [...document.querySelectorAll(".room-toggle")].map((b) => ({
        text: b.textContent.trim(),
        expanded: b.getAttribute("aria-expanded"),
      })),
      dialogs: [...document.querySelectorAll("dialog[open]")].map((d) => d.className),
    };
  });
  console.log("rail after toggle", rail);
  await page.locator("#teacher-live-dashboard-rail").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.locator("#teacher-live-dashboard-rail").screenshot({ path: path.join(outDir, "pilot-teacher-rail-375.png") });

  await context.close();
  await browser.close();
  console.log(JSON.stringify({ errors, rail }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
