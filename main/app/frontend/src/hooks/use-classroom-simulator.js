// src/hooks/use-classroom-simulator.js
// Workstream W7: 50-Participant Classroom Simulator with Correlated Outages & Self-Recovery

import { useEffect, useRef } from "react";
import { getAuthToken } from "../api/ws-auth.js";

const SIM_COUNT = 50;
const SIM_PREFIX = "sim_";
const METRICS_INTERVAL_MS = 1000; // 1.0s Demo Clock

export function isSimulatedStudentId(id) {
  return String(id || "").startsWith(SIM_PREFIX);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getScenarioPhase(tick, studentIndex) {
  // Correlated outage cluster (students 21 to 30) during ticks 15 to 25
  if (studentIndex >= 21 && studentIndex <= 30 && tick >= 15 && tick <= 25) {
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

function buildObservationEnvelope(
  sessionId,
  userId,
  scenario,
  studentIndex,
) {
  const t = Date.now() / 1000;
  const jitter =
    Math.sin(t * 1.11 + studentIndex * 0.67) * 0.035 +
    Math.cos(t * 0.73 + studentIndex * 0.31) * 0.02;

  let baseScore = 0.88;
  let yaw = Math.sin(t * 0.9 + studentIndex * 0.4) * 5;
  let pitch = Math.cos(t * 0.8 + studentIndex * 0.29) * 3;
  let faceCount = 1;
  let qualityScore = 0.92;
  const technicalReasons = [];
  let usable = true;

  if (scenario === "attentive" || scenario === "recovery") {
    baseScore = 0.88;
    yaw = (studentIndex % 2 === 0 ? 2 : -2) + jitter * 10;
    pitch = 1 + jitter * 5;
  } else if (scenario === "distracted") {
    baseScore = 0.55;
    yaw = (studentIndex % 2 === 0 ? -28 : 28); // >= 20 deg cue exposure
    pitch = 8;
  } else if (scenario === "technical_camera") {
    baseScore = 0.4;
    usable = false;
    faceCount = 0;
    technicalReasons.push("CAMERA_UNAVAILABLE");
  } else if (scenario === "correlated_network_outage") {
    baseScore = 0.2;
    usable = false;
    technicalReasons.push("NETWORK_DISCONNECTED");
  }

  const score = clamp(baseScore + jitter, 0.1, 0.98);
  const nowIso = new Date().toISOString();

  return {
    type: "metrics",
    event_id: `sim_evt_${userId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    event_type: "OBSERVATION_SAMPLE",
    schema_version: 1,
    tenant_id: "ten-default",
    session_id: sessionId,
    participant_id: userId,
    actor_id: userId,
    actor_role: "participant",
    source: "camera",
    occurred_at: nowIso,
    received_at: nowIso,
    policy_id: "RESOURCE_SUPPORTED_ASSESSMENT",
    is_demo: true,
    user_id: userId,
    score: Number(score.toFixed(3)),
    is_simulated: true,
    payload: {
      sample_id: `samp_${userId}_${Date.now()}`,
      sample_timestamp: nowIso,
      usable,
      face_count: faceCount,
      quality_score: qualityScore,
      head_pose: {
        yaw_deg: Number(yaw.toFixed(1)),
        pitch_deg: Number(pitch.toFixed(1)),
        roll_deg: 0.0,
      },
      technical_reasons: technicalReasons,
      is_page_hidden: false,
    },
  };
}

/**
 * Streams realistic 50-student classroom telemetry over WebSockets using the 1s demo clock.
 */
export default function useClassroomSimulator(sessionId, enabled) {
  const socketsRef = useRef([]);
  const intervalsRef = useRef([]);

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
      return;
    }

    const wsBase =
      import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000";
    const token = getAuthToken();

    for (let i = 1; i <= SIM_COUNT; i += 1) {
      const padded = String(i).padStart(2, "0");
      const userId = `${SIM_PREFIX}${padded}`;
      const url = `${wsBase}/ws/engagement/${sessionId}?token=${token || "sim_token"}`;

      let ws = null;
      try {
        ws = new WebSocket(url);
        socketsRef.current.push(ws);
      } catch {
        continue;
      }

      let tick = 0;

      ws.onopen = () => {
        const timer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          tick += 1;
          const scenario = getScenarioPhase(tick, i);
          const message = buildObservationEnvelope(
            sessionId,
            userId,
            scenario,
            i,
          );

          try {
            ws.send(JSON.stringify(message));
          } catch {
            // socket send error ignored
          }
        }, METRICS_INTERVAL_MS);

        intervalsRef.current.push(timer);
      };

      ws.onerror = () => {};
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
    };
  }, [sessionId, enabled]);
}
