// src/hooks/use-classroom-simulator.js
// Workstream W7: 50-Participant Classroom Simulator with Correlated Outages & Self-Recovery

import { useEffect, useRef } from "react";

const SIM_COUNT = 50;
const SIM_PREFIX = "sim_";
const METRICS_INTERVAL_MS = 3000;

export function isSimulatedStudentId(id) {
  return String(id || "").startsWith(SIM_PREFIX);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getScenarioPhase(tick, studentIndex) {
  // Correlated outage cluster (students 21 to 30) during ticks 12 to 18
  if (studentIndex >= 21 && studentIndex <= 30 && tick >= 12 && tick <= 18) {
    return "correlated_network_outage";
  }

  // 75% of class is steady attentive
  if (studentIndex % 4 !== 0) {
    return "attentive";
  }

  // 15% intermittent distraction with self-recovery
  const cycleLength = 20;
  const offset = (studentIndex * 3) % cycleLength;
  const phaseTick = (tick + offset) % cycleLength;

  if (phaseTick < 10) return "attentive";
  if (phaseTick < 14) return "distracted";
  if (phaseTick < 16) return "technical_camera";
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

  let baseScore = 0.88;
  let gaze_direction = "center";
  let ear = 0.34;
  let yaw = Math.sin(t * 0.9 + studentIndex * 0.4) * 0.05;
  let pitch = Math.cos(t * 0.8 + studentIndex * 0.29) * 0.03;
  let cameraUsable = true;
  let networkUsable = true;

  if (scenario === "attentive" || scenario === "recovery") {
    baseScore = 0.88;
    ear = 0.34;
  } else if (scenario === "distracted") {
    baseScore = 0.62;
    ear = 0.3;
    gaze_direction = (studentIndex + Math.floor(t)) % 2 === 0 ? "left" : "right";
    yaw = gaze_direction === "left" ? -0.12 : 0.12;
  } else if (scenario === "technical_camera") {
    baseScore = 0.5;
    cameraUsable = false;
  } else if (scenario === "correlated_network_outage") {
    baseScore = 0.2;
    networkUsable = false;
  }

  const score = clamp(baseScore + jitter, 0.1, 0.98);

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
    is_usable: cameraUsable && networkUsable,
    clean_streak: scenario === "attentive" || scenario === "recovery" ? (simState.cleanStreak || 2) : 0,
    warning_streak: scenario === "distracted" ? (simState.warningStreak || 1) : 0,
    is_simulated: true,
  };
}

/**
 * Streams realistic 50-student classroom telemetry over WebSockets.
 */
export default function useClassroomSimulator(sessionId, enabled) {
  const socketsRef = useRef([]);
  const intervalsRef = useRef([]);
  const studentStateRef = useRef(new Map());

  useEffect(() => {
    if (!sessionId || !enabled) {
      socketsRef.current.forEach((ws) => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      });
      intervalsRef.current.forEach((timer) => clearInterval(timer));
      socketsRef.current = [];
      intervalsRef.current = [];
      studentStateRef.current.clear();
      return;
    }

    const wsBase =
      import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000";

    for (let i = 1; i <= SIM_COUNT; i += 1) {
      const padded = String(i).padStart(2, "0");
      const userId = `${SIM_PREFIX}${padded}`;
      const url = `${wsBase}/ws/engagement/${sessionId}/${userId}`;

      const simState = {
        cleanStreak: 2,
        warningStreak: 0,
        hasContext: false,
      };
      studentStateRef.current.set(userId, simState);

      const ws = new WebSocket(url);
      socketsRef.current.push(ws);

      let tick = 0;

      ws.onopen = () => {
        // Heartbeat / metrics tick
        const timer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          tick += 1;
          const scenario = getScenarioPhase(tick, i);

          if (scenario === "attentive" || scenario === "recovery") {
            simState.cleanStreak = Math.min(5, (simState.cleanStreak || 0) + 1);
            simState.warningStreak = 0;
          } else if (scenario === "distracted") {
            simState.warningStreak = Math.min(3, (simState.warningStreak || 0) + 1);
            simState.cleanStreak = 0;
          }

          const message = buildMetricsMessage(
            sessionId,
            userId,
            scenario,
            simState,
            i,
          );
          ws.send(JSON.stringify(message));
        }, METRICS_INTERVAL_MS);

        intervalsRef.current.push(timer);
      };

      ws.onerror = () => {
        // Suppress expected mock socket drops
      };
    }

    return () => {
      socketsRef.current.forEach((ws) => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      });
      intervalsRef.current.forEach((timer) => clearInterval(timer));
      socketsRef.current = [];
      intervalsRef.current = [];
      studentStateRef.current.clear();
    };
  }, [sessionId, enabled]);
}
