// Dev-only: capture one route at the four widths, with mock auth + WS.
// Usage: node e2e/shoot.mjs <route> <name> [--rail] [--student]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const route = process.argv[2] || "/teacher?preview=live";
const name = process.argv[3] || "shot";
const withRail = process.argv.includes("--rail");
const isStudent = process.argv.includes("--student");
const baseUrl = process.env.BASE_URL || "http://localhost:5176";
const outDir = process.env.OUT_DIR || ".impeccable/redesign/current";
const widths = [375, 768, 1280, 1920];

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "teacher@chronos.local",
};

const STUDENTS = [
  { user_id: "s-ananya", score: 0.86, identity_status: "verified" },
  { user_id: "s-rahul", score: 0.74, identity_status: "verified" },
  { user_id: "s-meera", score: 0.52, identity_status: "verified" },
  { user_id: "s-joseph", score: 0.33, identity_status: "verified" },
  { user_id: "s-fatima", score: 0.91, identity_status: "verified" },
  { user_id: "s-dev", score: 0.28, identity_status: "mismatch", identity_mismatch_count: 3 },
  { user_id: "s-nisha", score: 0.61, identity_status: "verified" },
  { user_id: "s-arjun", score: 0.44, identity_status: "verified" },
];

async function run() {
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
    ({ user, role }) => {
      sessionStorage.setItem("chronos_user", JSON.stringify(user));
      sessionStorage.setItem("chronos_role", role);
    },
    { user: USER, role: isStudent ? "student" : "teacher" },
  );
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.routeWebSocket(/\/ws\/engagement\//, (ws) => {
    ws.onMessage(() => {});
  });
  if (!isStudent) {
    await page.routeWebSocket(/\/ws\/teacher\//, (ws) => {
      ws.onMessage(() => {});
      let i = 0;
      const timer = setInterval(() => {
        for (const s of STUDENTS) {
          ws.send(
            JSON.stringify({
              type: "metrics",
              user_id: s.user_id,
              score: Math.max(0.12, Math.min(0.98, s.score + Math.sin((i + s.score * 10) / 3) * 0.06)),
              timestamp: new Date().toISOString(),
              gaze_direction: "center",
              ear: 0.3,
              head_pose: { yaw: 0.02, pitch: 0.01 },
              presence: s.user_id === "s-meera" ? "no_face" : "present",
              identity_status: s.identity_status,
              identity_mismatch_count: s.identity_mismatch_count || 0,
            }),
          );
        }
        if (i === 0) {
          ws.send(JSON.stringify({ type: "multi_face_detected", user_id: "s-nisha", face_count: 2 }));
          ws.send(JSON.stringify({ type: "auto_disengaged", user_id: "s-joseph", strike_count: 3 }));
        }
        i += 1;
      }, 900);
      ws.onClose(() => clearInterval(timer));
    });
  }

  await page.goto(baseUrl + route, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2200);

  if (withRail) {
    const toggle = page.getByRole("button", { name: /students|hide students/i }).first();
    if (await toggle.count()) {
      const expanded = await toggle.getAttribute("aria-expanded");
      if (expanded !== "true") await toggle.click().catch(() => {});
      await page.waitForTimeout(400);
    }
  }

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(outDir, `${name}-${width}.png`),
      fullPage: false,
    });
  }

  console.log("errors:", errors.length ? errors.slice(0, 8) : "none");
  await browser.close();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
