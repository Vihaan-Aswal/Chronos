// Dev-only frame-sequence evidence for the pilot. Not part of the app.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  FAKE_USER,
  mockBackend,
  mockTeacherSocket,
} from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const outDir = ".impeccable/motion-after/app/frames/teacher-live";

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
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const index = String(frames.length).padStart(3, "0");
    const file = path.join(outDir, `frame-${index}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ index, file, timestamp: metadata.timestamp });
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId });
    } catch {}
  });

  await cdp.send("Page.startScreencast", {
    format: "png",
    quality: 80,
    maxWidth: 1280,
    maxHeight: 900,
    everyNthFrame: 1,
  });

  await page.goto(`${baseUrl}/teacher?preview=live`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /All students/i }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Needs attention/i }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Mark s-dev engaged/i }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Send a message to s-dev" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /^Cancel$/ }).click();
  await page.waitForTimeout(700);

  await cdp.send("Page.stopScreencast");
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ frames }, null, 2));
  await context.close();
  await browser.close();
  console.log(`captured ${frames.length} frames`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
