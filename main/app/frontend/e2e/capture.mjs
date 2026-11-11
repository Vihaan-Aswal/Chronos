// Dev-only visual capture tool. Not part of the app bundle.
// Usage: node e2e/capture.mjs <outDir> [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || ".impeccable/redesign/capture";
const baseUrl = process.argv[3] || process.env.BASE_URL || "http://localhost:5176";
const widths = [375, 768, 1280, 1920];

const FAKE_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "teacher@chronos.local",
  user_metadata: { full_name: "A. Iyer" },
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

async function mockTeacherSocket(page) {
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
            presence: "present",
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

async function mockOtherSockets(page) {
  await page.routeWebSocket(/\/ws\/engagement\//, (ws) => {
    ws.onMessage(() => {});
  });
}

async function shoot(page, name, width, { full = true } = {}) {
  await page.setViewportSize({ width, height: width >= 1280 ? 900 : 900 });
  await page.waitForTimeout(700);
  const file = path.join(outDir, `${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: full });
  return file;
}

async function run() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const newPage = async ({ auth = false, role = "teacher" } = {}) => {
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
    const page = await context.newPage();
    await mockOtherSockets(page);
    return { context, page };
  };

  const targets = [
    { name: "home", url: "/" },
    { name: "signin", url: "/signin" },
    { name: "signup", url: "/signup" },
    { name: "choose-role", url: "/choose-role", auth: true },
    { name: "readiness", url: "/readiness", auth: true },
    { name: "teacher-join", url: "/teacher", auth: true },
    { name: "student-join", url: "/student", auth: true, role: "student" },
    { name: "teacher-live", url: "/teacher?preview=live", auth: true, live: true },
    { name: "student-live", url: "/student?preview=live", auth: true, role: "student", live: true },
  ];

  const done = [];
  for (const t of targets) {
    console.log("→", t.name);
    const { context, page } = await newPage({ auth: t.auth, role: t.role });
    if (t.live) await mockTeacherSocket(page);
    await page.goto(baseUrl + t.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1800);
    for (const w of widths) {
      console.log("   shot", w);
      await shoot(page, t.name, w, { full: !t.live });
      done.push(`${t.name}@${w}`);
    }
    if (t.live) {
      // Open the rail / report states where available.
      const railBtn = page.getByRole("button", { name: /live dashboard|show dashboard/i }).first();
      if (await railBtn.count()) {
        await railBtn.click().catch(() => {});
        await page.waitForTimeout(500);
        for (const w of widths) await shoot(page, `${t.name}-rail`, w, { full: false });
      }
    }
    await context.close();
  }

  await browser.close();
  console.log("Captured:", done.length, "shots to", path.resolve(outDir));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
