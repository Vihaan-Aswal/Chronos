// Dev-only frame sequences for auth/choose/readiness. Not part of the app.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FAKE_USER, mockSupabaseSignIn, seedSession } from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const root = ".impeccable/motion-after/app/frames";

async function record(browser, name, { auth = false, role = "teacher" } = {}, prepare, act) {
  const outDir = path.join(root, name);
  mkdirSync(outDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["camera", "microphone"],
    reducedMotion: "no-preference",
  });
  if (auth) await seedSession(context, { role });
  const page = await context.newPage();
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
  await prepare(page);
  await act(page);
  await cdp.send("Page.stopScreencast");
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ frames }, null, 2));
  await context.close();
  console.log(name, frames.length);
}

async function main() {
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });

  await record(browser, "signin-load-error", {}, async (p) => {
    await mockSupabaseSignIn(p, { ok: false });
    await p.goto(`${baseUrl}/signin`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(600);
  }, async (p) => {
    await p.waitForTimeout(600);
    await p.locator("#email").fill(FAKE_USER.email);
    await p.locator("#password").fill("wrong-password");
    await p.getByRole("button", { name: /^sign in$/i }).click();
    await p.waitForTimeout(900);
  });

  await record(browser, "signup-success", {}, async (p) => {
    await p.route(/\/auth\/v1\/signup/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: FAKE_USER.id, email: "new@chronos.local" }, session: null }),
      }),
    );
    await p.goto(`${baseUrl}/signup`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(600);
  }, async (p) => {
    await p.locator("#email").fill("new@chronos.local");
    await p.locator("#password").fill("password123");
    await p.locator("#confirmPassword").fill("password123");
    await p.getByRole("button", { name: /Create account/i }).click();
    await p.waitForTimeout(900);
  });

  await record(browser, "choose-role-load", { auth: true }, async (p) => {
    await p.goto(`${baseUrl}/choose-role`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(600);
  }, async (p) => {
    await p.waitForTimeout(700);
  });

  await record(browser, "readiness-load", { auth: true }, async (p) => {
    await p.goto(`${baseUrl}/readiness`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(600);
  }, async (p) => {
    await p.waitForTimeout(1600);
  });

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
