// Dev-only motion-system checks: tokens, kill switch, reduced motion, dialog.
import { chromium } from "@playwright/test";
import { FAKE_USER, mockBackend, mockTeacherSocket } from "./helpers.js";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";

async function inspect(page) {
  return page.evaluate(() => {
    const style = (sel, pseudo) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el, pseudo || null);
      return {
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
        transitionDuration: cs.transitionDuration,
        rise: cs.getPropertyValue("--motion-rise").trim(),
      };
    };
    return {
      mode: window.chronosMotion?.get?.(),
      attr: document.documentElement.dataset.motion || null,
      headerRule: style(".app-header", "::after"),
      authFact: style(".auth-fact"),
      authField: style(".auth-form .field"),
      button: style(".btn"),
    };
  });
}

async function main() {
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });

  const normal = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p1 = await normal.newPage();
  await p1.goto(`${baseUrl}/signin`, { waitUntil: "domcontentloaded" });
  await p1.waitForTimeout(500);
  console.log("normal", JSON.stringify(await inspect(p1), null, 2));
  await normal.close();

  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await off.newPage();
  await p2.goto(`${baseUrl}/signin?motion=off`, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(500);
  console.log("off", JSON.stringify(await inspect(p2), null, 2));
  await off.close();

  const reduced = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  const p3 = await reduced.newPage();
  await p3.goto(`${baseUrl}/signin`, { waitUntil: "domcontentloaded" });
  await p3.waitForTimeout(500);
  console.log("reduced", JSON.stringify(await inspect(p3), null, 2));
  await reduced.close();

  const live = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["camera", "microphone"],
    reducedMotion: "no-preference",
  });
  await live.addInitScript(
    ({ user }) => {
      sessionStorage.setItem("chronos_user", JSON.stringify(user));
      sessionStorage.setItem("chronos_role", "teacher");
    },
    { user: FAKE_USER },
  );
  const p4 = await live.newPage();
  await mockBackend(p4);
  await mockTeacherSocket(p4);
  await p4.goto(`${baseUrl}/teacher?preview=live`, { waitUntil: "domcontentloaded" });
  await p4.waitForTimeout(2200);
  const row = await p4.evaluate(() => {
    const el = document.querySelector(".room-row");
    const cs = el ? getComputedStyle(el) : null;
    return { animationName: cs?.animationName, animationDuration: cs?.animationDuration, rise: cs?.getPropertyValue("--motion-rise").trim() };
  });
  await p4.getByRole("button", { name: "Send a message to s-dev" }).click();
  await p4.waitForTimeout(300);
  const dialog = await p4.evaluate(() => {
    const el = document.querySelector("dialog[open]");
    const cs = el ? getComputedStyle(el) : null;
    return { animationName: cs?.animationName, animationDuration: cs?.animationDuration };
  });
  console.log("live", JSON.stringify({ row, dialog }, null, 2));
  await live.close();

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
