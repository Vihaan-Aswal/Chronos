import { useEffect, useRef } from "react";

const SIM_COUNT = 20;
const SIM_PREFIX = "sim_";
const METRICS_INTERVAL_MS = 3000;

function buildMetricsMessage(sessionId, userId, phase, studentIndex) {
  const t = Date.now() / 1000;
  const wave = 0.5 + 0.35 * Math.sin(t / 8 + studentIndex * 0.7);
  const noise = (Math.sin(t * 1.3 + studentIndex) * 0.08 + Math.cos(t * 0.7) * 0.05);
  let score = Math.max(0.05, Math.min(0.98, wave + noise));

  const gazePhase = (t + studentIndex) % 7;
  let gaze_direction = "center";
  if (gazePhase < 1.2) gaze_direction = "left";
  else if (gazePhase < 2.4) gaze_direction = "right";
  else if (gazePhase < 3.2) gaze_direction = "down";

  if (phase === "dip" && studentIndex % 5 === 0) {
    score *= 0.55;
    gaze_direction = Math.random() > 0.5 ? "left" : "right";
  }

  const yaw = gaze_direction === "left" ? -0.12 : gaze_direction === "right" ? 0.12 : (Math.sin(t + studentIndex) * 0.06);
  const pitch = gaze_direction === "down" ? 0.1 : (Math.cos(t * 0.9) * 0.04);

  return {
    type: "metrics",
    session_id: sessionId,
    user_id: userId,
    score: Number(score.toFixed(3)),
    timestamp: new Date().toISOString(),
    gaze_direction,
    ear: Number((0.26 + Math.random() * 0.12).toFixed(3)),
    head_pose: { yaw: Number(yaw.toFixed(3)), pitch: Number(pitch.toFixed(3)) },
    presence: "present",
    identity_status: "verified",
    identity_mismatch_count: 0,
    is_simulated: true,
  };
}

/**
 * Opens real student engagement WebSockets for dummy students and streams plausible metrics.
 */
export default function useClassroomSimulator(sessionId, enabled) {
  const socketsRef = useRef([]);
  const intervalsRef = useRef([]);

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
      return;
    }

    const wsBase =
      import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000";

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

      ws.onopen = () => {
        const tick = () => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const phase = Math.floor(Date.now() / 45000) % 2 === 0 ? "normal" : "dip";
          try {
            ws.send(
              JSON.stringify(buildMetricsMessage(sessionId, userId, phase, idx))
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
    };
  }, [sessionId, enabled]);
}

export function isSimulatedStudentId(userId) {
  return typeof userId === "string" && userId.startsWith(SIM_PREFIX);
}
