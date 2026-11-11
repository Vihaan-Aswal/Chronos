// Dev-only state capture for design review. Usage: node e2e/states.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  FAKE_USER,
  mockBackend,
  mockTeacherSocket,
} from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5176";
const outDir = ".impeccable/redesign/states";

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["camera", "microphone"],
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
  await mockBackend(page);
  await mockTeacherSocket(page);

  await page.goto(`${baseUrl}/teacher?preview=live`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1600);

  await page.getByRole("button", { name: "Send a message to s-dev" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, "teacher-message-modal-1280.png") });
  await page.getByRole("button", { name: /^Cancel$/ }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Remove s-dev from the room" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, "teacher-remove-modal-1280.png") });
  await page.getByRole("button", { name: /Keep in room/ }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: /^End session$/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, "teacher-end-modal-1280.png") });
  await page.getByRole("button", { name: /Keep teaching/ }).click();
  await page.waitForTimeout(300);

  // Empty room (no signal stream mock).
  const emptyPage = await context.newPage();
  await emptyPage.goto(`${baseUrl}/teacher?preview=live`, {
    waitUntil: "domcontentloaded",
  });
  await emptyPage.waitForTimeout(2600);
  await emptyPage.screenshot({ path: path.join(outDir, "teacher-empty-1280.png") });

  await browser.close();
  console.log("states captured to", outDir);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
