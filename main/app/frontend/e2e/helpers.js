export const FAKE_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "teacher@chronos.local",
};

export const STUDENTS = [
  { user_id: "s-ananya", score: 0.86, identity_status: "verified" },
  { user_id: "s-rahul", score: 0.74, identity_status: "verified" },
  { user_id: "s-meera", score: 0.52, identity_status: "verified" },
  { user_id: "s-joseph", score: 0.33, identity_status: "verified" },
  { user_id: "s-fatima", score: 0.91, identity_status: "verified" },
  { user_id: "s-dev", score: 0.28, identity_status: "mismatch", identity_mismatch_count: 3 },
  { user_id: "s-nisha", score: 0.61, identity_status: "verified" },
  { user_id: "s-arjun", score: 0.44, identity_status: "verified" },
];

export async function seedSession(page, { role = "teacher", user = FAKE_USER } = {}) {
  await page.addInitScript(
    ({ user, role }) => {
      sessionStorage.setItem("chronos_user", JSON.stringify(user));
      if (role) sessionStorage.setItem("chronos_role", role);
      else sessionStorage.removeItem("chronos_role");
    },
    { user, role },
  );
}

export async function mockTeacherSocket(page, { students = STUDENTS } = {}) {
  await page.routeWebSocket(/\/ws\/teacher\//, (ws) => {
    ws.onMessage(() => {});
    let i = 0;
    const timer = setInterval(() => {
      for (const s of students) {
        ws.send(
          JSON.stringify({
            type: "metrics",
            user_id: s.user_id,
            score: Math.max(
              0.12,
              Math.min(0.98, s.score + Math.sin((i + s.score * 10) / 3) * 0.06),
            ),
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
        ws.send(
          JSON.stringify({
            type: "multi_face_detected",
            user_id: "s-nisha",
            face_count: 2,
          }),
        );
        ws.send(
          JSON.stringify({
            type: "auto_disengaged",
            user_id: "s-joseph",
            strike_count: 3,
          }),
        );
      }
      i += 1;
    }, 500);
    ws.onClose(() => clearInterval(timer));
  });
}

export async function mockStudentSocket(page) {
  await page.routeWebSocket(/\/ws\/engagement\//, (ws) => {
    ws.onMessage(() => {});
  });
}

export async function mockSupabaseSignIn(page, { ok = true } = {}) {
  await page.route(/\/auth\/v1\/token/, async (route) => {
    if (!ok) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid login credentials",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "fake-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "fake-refresh-token",
        user: {
          id: FAKE_USER.id,
          aud: "authenticated",
          role: "authenticated",
          email: FAKE_USER.email,
          email_confirmed_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      }),
    });
  });
}

export async function mockBackend(page) {
  await page.route(/\/teacher\/action/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    }),
  );
  await page.route(/\/nudge\/send/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    }),
  );
  await page.route(/\/liveness\/trigger/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    }),
  );
  await page.route(/\/session\/set-mode/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    }),
  );
  await page.route(/\/session\/set-class-context/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    }),
  );
}
