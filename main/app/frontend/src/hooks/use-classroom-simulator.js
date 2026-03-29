import { useEffect, useRef } from "react";

const SIM_COUNT = 20;
const SIM_PREFIX = "sim_";
const METRICS_INTERVAL_MS = 3000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function riskTypeForIndex(studentIndex) {
  const riskTypes = [
    "strike",
    "tab_switch",
    "identity",
    "multi_face",
    "liveness",
  ];
  return riskTypes[studentIndex % riskTypes.length];
}

function getScenarioPhase(tick, studentIndex) {
  const cycleLength = 24;
  const offset = (studentIndex * 5) % cycleLength;
  const phaseTick = (tick + offset) % cycleLength;

  if (phaseTick < 8) return "attentive";
  if (phaseTick < 13) return "distracted";
  if (phaseTick < 17) return "away";
  if (phaseTick < 20) return "risk";
  return "recovery";
}

function buildMetricsMessage(
  sessionId,
  userId,
  scenario,
  simState,
  studentIndex,
) {
  const t = Date.now() / 1000;
  const jitter =
    Math.sin(t * 1.11 + studentIndex * 0.67) * 0.035 +
    Math.cos(t * 0.73 + studentIndex * 0.31) * 0.02;

  let baseScore;
  let gaze_direction = "center";
  let ear = 0.32;
  let yaw = Math.sin(t * 0.9 + studentIndex * 0.4) * 0.05;
  let pitch = Math.cos(t * 0.8 + studentIndex * 0.29) * 0.03;

  if (scenario === "attentive") {
    baseScore = 0.86;
    ear = 0.34;
  } else if (scenario === "distracted") {
    baseScore = 0.58;
    ear = 0.3;
    gaze_direction =
      (studentIndex + Math.floor(t)) % 2 === 0 ? "left" : "right";
    yaw = gaze_direction === "left" ? -0.12 : 0.12;
  } else if (scenario === "away") {
    baseScore = 0.27;
    ear = 0.25;
    gaze_direction = "down";
    pitch = 0.13;
  } else if (scenario === "risk") {
    baseScore = 0.2;
    ear = 0.24;
    gaze_direction =
      (studentIndex + Math.floor(t / 2)) % 2 === 0 ? "left" : "down";
    yaw = gaze_direction === "left" ? -0.14 : 0.02;
    pitch = gaze_direction === "down" ? 0.15 : 0.02;
  } else {
    baseScore = 0.74;
    ear = 0.31;
  }

  // Active risk signals pull score down further.
  if (simState.strikes >= 3 || simState.livenessFailed || simState.multiFace) {
    baseScore = Math.min(baseScore, 0.18);
  } else if (
    simState.identityMismatch >= 2 ||
    simState.antiCheatViolations > 0
  ) {
    baseScore = Math.min(baseScore, 0.33);
  }

  const score = clamp(baseScore + jitter, 0.06, 0.97);

  return {
    type: "metrics",
    session_id: sessionId,
    user_id: userId,
    score: Number(score.toFixed(3)),
    timestamp: new Date().toISOString(),
    gaze_direction,
    ear: Number(ear.toFixed(3)),
    head_pose: {
      yaw: Number(yaw.toFixed(3)),
      pitch: Number(pitch.toFixed(3)),
    },
    presence: "present",
    identity_status: simState.identityMismatch >= 2 ? "mismatch" : "verified",
    identity_mismatch_count: simState.identityMismatch,
    is_simulated: true,
  };
}

function emitRiskEvent(ws, sessionId, userId, simState, riskType) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const timestamp = new Date().toISOString();

  if (riskType === "strike") {
    simState.strikes = 3;
    simState.disengaged = true;
    ws.send(
      JSON.stringify({
        type: "auto_disengaged_strike",
        session_id: sessionId,
        user_id: userId,
        strike_count: 3,
        timestamp,
        is_simulated: true,
      }),
    );
    return;
  }

  if (riskType === "tab_switch") {
    simState.antiCheatViolations += 1;
    ws.send(
      JSON.stringify({
        type: "anti_cheat_violation",
        session_id: sessionId,
        user_id: userId,
        violation_type: "tab_switch",
        timestamp,
        is_simulated: true,
      }),
    );
    return;
  }

  if (riskType === "identity") {
    simState.identityMismatch = 2;
    ws.send(
      JSON.stringify({
        type: "identity_update",
        session_id: sessionId,
        user_id: userId,
        identity_status: "mismatch",
        identity_mismatch_count: 2,
        timestamp,
        is_simulated: true,
      }),
    );
    return;
  }

  if (riskType === "multi_face") {
    simState.multiFace = true;
    ws.send(
      JSON.stringify({
        type: "multi_face_detected",
        session_id: sessionId,
        user_id: userId,
        face_count: 2,
        timestamp,
        is_simulated: true,
      }),
    );
    return;
  }

  simState.livenessFailed = true;
  simState.strikes = Math.max(simState.strikes, 2);
  ws.send(
    JSON.stringify({
      type: "liveness_fail",
      session_id: sessionId,
      user_id: userId,
      reason: "simulated_timeout",
      timestamp,
      is_simulated: true,
    }),
  );
}

function emitRecoveryEvent(ws, sessionId, userId, simState) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const timestamp = new Date().toISOString();

  simState.strikes = 0;
  simState.disengaged = false;
  simState.antiCheatViolations = 0;
  simState.identityMismatch = 0;
  simState.multiFace = false;
  simState.livenessFailed = false;

  ws.send(
    JSON.stringify({
      type: "mark_engaged_ack",
      session_id: sessionId,
      user_id: userId,
      timestamp,
      is_simulated: true,
    }),
  );
}

/**
 * Opens real student engagement WebSockets for dummy students and streams plausible metrics.
 */
export default function useClassroomSimulator(sessionId, enabled) {
  const socketsRef = useRef([]);
  const intervalsRef = useRef([]);
  const studentStateRef = useRef(new Map());

  useEffect(() => {
    if (!sessionId || !enabled) {
      intervalsRef.current.forEach(clearInterval);
      intervalsRef.current = [];
      socketsRef.current.forEach((ws) => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      });
      socketsRef.current = [];
      studentStateRef.current.clear();
      return;
    }

    const wsBase = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000";

    const userIds = Array.from({ length: SIM_COUNT }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return `${SIM_PREFIX}${n}`;
    });

    userIds.forEach((userId, idx) => {
      const url = `${wsBase}/ws/engagement/${sessionId}/${userId}`;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      socketsRef.current.push(ws);

      const simState = {
        tick: 0,
        previousPhase: null,
        strikes: 0,
        disengaged: false,
        antiCheatViolations: 0,
        identityMismatch: 0,
        multiFace: false,
        livenessFailed: false,
        riskType: riskTypeForIndex(idx),
      };
      studentStateRef.current.set(userId, simState);

      ws.onopen = () => {
        const tick = () => {
          if (ws.readyState !== WebSocket.OPEN) return;

          const currentState = studentStateRef.current.get(userId);
          if (!currentState) return;

          currentState.tick += 1;
          const scenario = getScenarioPhase(currentState.tick, idx);

          // Emit state transitions as events so teacher dashboard gets realistic flags.
          if (scenario !== currentState.previousPhase) {
            try {
              if (scenario === "risk") {
                emitRiskEvent(
                  ws,
                  sessionId,
                  userId,
                  currentState,
                  currentState.riskType,
                );
              } else if (scenario === "recovery") {
                emitRecoveryEvent(ws, sessionId, userId, currentState);
              }
            } catch {
              // Ignore transient WS race errors.
            }

            currentState.previousPhase = scenario;
          }

          try {
            ws.send(
              JSON.stringify(
                buildMetricsMessage(
                  sessionId,
                  userId,
                  scenario,
                  currentState,
                  idx,
                ),
              ),
            );
          } catch {
            /* ignore */
          }
        };
        tick();
        const id = setInterval(tick, METRICS_INTERVAL_MS);
        intervalsRef.current.push(id);
      };
    });

    return () => {
      intervalsRef.current.forEach(clearInterval);
      intervalsRef.current = [];
      socketsRef.current.forEach((ws) => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      });
      socketsRef.current = [];
      studentStateRef.current.clear();
    };
  }, [sessionId, enabled]);
}

export function isSimulatedStudentId(userId) {
  return typeof userId === "string" && userId.startsWith(SIM_PREFIX);
}
