// Dev-only: auth/readiness/teacher empty-state captures.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { FAKE_USER, mockBackend, mockTeacherSocket, seedSession } from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5176";
const outDir = ".impeccable/redesign/states";

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });

  // Sign-up success
  const signupContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  const signup = await signupContext.newPage();
  await signup.route(/\/auth\/v1\/signup/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: FAKE_USER.id, email: "new@chronos.local" },
        session: null,
      }),
    }),
  );
  await signup.goto(`${baseUrl}/signup`, { waitUntil: "domcontentloaded" });
  await signup.locator("#email").fill("new@chronos.local");
  await signup.locator("#password").fill("password123");
  await signup.locator("#confirmPassword").fill("password123");
  await signup.getByRole("button", { name: /Create account/i }).click();
  await signup.waitForTimeout(500);
  await signup.screenshot({ path: path.join(outDir, "signup-success-1280.png") });

  // Sign-up error
  const errContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  const err = await errContext.newPage();
  await err.route(/\/auth\/v1\/signup/, (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "user_already_exists",
        error_description: "User already registered",
        msg: "User already registered",
      }),
    }),
  );
  await err.goto(`${baseUrl}/signup`, { waitUntil: "domcontentloaded" });
  await err.locator("#email").fill("new@chronos.local");
  await err.locator("#password").fill("password123");
  await err.locator("#confirmPassword").fill("password123");
  await err.getByRole("button", { name: /Create account/i }).click();
  await err.waitForTimeout(700);
  await err.screenshot({ path: path.join(outDir, "signup-error-1280.png") });

  // Readiness with camera denied
  const camContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await camContext.addInitScript(() => {
    sessionStorage.setItem(
      "chronos_user",
      JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "teacher@chronos.local" }),
    );
    sessionStorage.setItem("chronos_role", "teacher");
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new Error("Permission denied"));
  });
  const cam = await camContext.newPage();
  await cam.goto(`${baseUrl}/readiness`, { waitUntil: "domcontentloaded" });
  await cam.waitForTimeout(1200);
  await cam.screenshot({ path: path.join(outDir, "readiness-camera-denied-1280.png") });

  // Teacher all-clear
  const clearContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await seedSession(clearContext, { role: "teacher" });
  const clear = await clearContext.newPage();
  await mockBackend(clear);
  await mockTeacherSocket(clear, {
    students: [
      { user_id: "s-ananya", score: 0.9, identity_status: "verified" },
      { user_id: "s-rahul", score: 0.8, identity_status: "verified" },
    ],
  });
  await clear.goto(`${baseUrl}/teacher?preview=live`, { waitUntil: "domcontentloaded" });
  await clear.waitForTimeout(1600);
  await clear.screenshot({ path: path.join(outDir, "teacher-all-clear-1280.png") });

  await browser.close();
  console.log("state captures written to", outDir);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
