// Dev-only frame sequences for the student nudge and the session record print.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FAKE_USER, mockBackend, mockStudentSocket } from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const root = ".impeccable/motion-after/app/frames";

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

const analytics = {
  exists: true,
  analytics: [
    {
      session_id: "default-session",
      teacher_id: FAKE_USER.id,
      start_time: "2026-11-10T09:00:00Z",
      duration_minutes: 42,
      avg_engagement_score: 0.68,
      total_students: 8,
      tpi: 74,
      metrics_timeline: Array.from({ length: 14 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2026, 10, 10, 9, i * 3)).toISOString(),
        avgScore: 0.55 + Math.sin(i / 2) * 0.1,
        studentCount: 2,
        students: {
          "s-ananya": { score: 0.8, isSimulated: false },
          "s-dev": { score: 0.3, isSimulated: false },
        },
      })),
      confusion_hotspots: [{ time: "6m", percentage: 38 }],
      at_risk_students: [
        { userId: "s-dev", avgScore: 0.28, strikes: 3, identityIssues: 0, reason: "Low engagement (28%), 3 disengagement strikes" },
      ],
    },
  ],
};

async function record(browser, name, { auth = false, role = "teacher" } = {}, prepare, act) {
  const outDir = path.join(root, name);
  mkdirSync(outDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["camera", "microphone"],
    reducedMotion: "no-preference",
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
  await prepare(page);
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

  await record(browser, "student-nudge", { auth: true, role: "student" }, async (p) => {
    await mockBackend(p);
    await mockStudentSocket(p, { nudge: true });
    await p.goto(`${baseUrl}/student?preview=live`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1400);
  }, async (p) => {
    await p.waitForTimeout(2200);
  });

  await record(browser, "record-print", { auth: true }, async (p) => {
    await p.route(/\/session\/analytics\/list/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) }),
    );
    await p.route(/\/session\/[^/]+\/analytics/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(analytics) }),
    );
    await p.goto(`${baseUrl}/records`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1000);
  }, async (p) => {
    await p.getByRole("button", { name: /Open record/i }).first().click();
    await p.waitForTimeout(1200);
    await p.getByRole("button", { name: /Show details/i }).click();
    await p.waitForTimeout(500);
  });

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
