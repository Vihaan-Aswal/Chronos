import { useEffect, useRef, useState } from "react";
import { getWebSocketTicket, getAuthToken } from "../api/ws-auth.js";

/**
 * Teacher WebSocket Hook:
 * - Real-time case updates and student projections from server.
 * - Single-use ticket admission with zero-trust token fallback.
 * - Auto-reconnection loop.
 */
export default function useTeacherWebSocket(sessionId) {
  const [connected, setConnected] = useState(false);
  const [students, setStudents] = useState({});
  const [cases, setCases] = useState([]);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    let isMounted = true;

    async function connect() {
      if (!isMounted) return;

      const base = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000";
      let wsUrl = `${base}/ws/teacher/${sessionId}`;

      try {
        try {
          const ticket = await getWebSocketTicket(sessionId, "teacher");
          wsUrl = `${wsUrl}?ticket=${ticket}`;
        } catch {
          const token = getAuthToken();
          if (token) {
            wsUrl = `${wsUrl}?token=${token}`;
          }
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setConnected(true);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;

          try {
            const msg = JSON.parse(event.data);

            // Real-time cases update from server projections
            if (msg.type === "cases_update" && Array.isArray(msg.cases)) {
              setCases(msg.cases);
              return;
            }

            const uid = msg.user_id || msg.participant_id;
            if (!uid) return;

            setStudents((prev) => {
              const prevStudent = prev[uid] || {};
              const isSimulated =
                Boolean(msg.is_simulated) || prevStudent.isSimulated === true;

              // --- Normalized Event / Metric Handlers ---
              if (msg.type === "metrics" || msg.type === "OBSERVATION_SAMPLE") {
                const payload = msg.payload || {};
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    score: msg.score ?? prevStudent.score ?? 0,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                    gazeDirection:
                      msg.gaze_direction ||
                      prevStudent.gazeDirection ||
                      "center",
                    ear: msg.ear ?? prevStudent.ear ?? 0,
                    headPose: msg.head_pose || payload.head_pose ||
                      prevStudent.headPose || { yaw: 0, pitch: 0 },
                    presence: msg.presence || prevStudent.presence || "unknown",
                    identityStatus:
                      msg.identity_status ||
                      prevStudent.identityStatus ||
                      "checking",
                    identityMismatchCount:
                      msg.identity_mismatch_count ??
                      prevStudent.identityMismatchCount ??
                      0,
                    warningStreak: msg.warning_streak ?? prevStudent.warningStreak ?? 0,
                    cleanStreak: msg.clean_streak ?? prevStudent.cleanStreak ?? 0,
                    caseState: msg.case_state || prevStudent.caseState || "NONE",
                    isSimulated,
                  },
                };
              }

              if (msg.type === "identity_update" || msg.type === "IDENTITY_RESULT") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    identityStatus:
                      msg.identity_status ||
                      msg.identity_state ||
                      prevStudent.identityStatus ||
                      "checking",
                    identityMismatchCount:
                      msg.identity_mismatch_count ??
                      prevStudent.identityMismatchCount ??
                      0,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  },
                };
              }

              if (msg.type === "window_finalized" || msg.type === "WINDOW_FINALIZED") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    warningStreak: msg.warning_streak ?? prevStudent.warningStreak ?? 0,
                    cleanStreak: msg.clean_streak ?? prevStudent.cleanStreak ?? 0,
                    observationState: msg.observation_state || prevStudent.observationState,
                    classification: msg.classification || prevStudent.classification,
                    attentionPattern: msg.attention_pattern || prevStudent.attentionPattern,
                    caseState: msg.case_state || prevStudent.caseState,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  },
                };
              }

              if (msg.type === "liveness_pass" || msg.type === "active_presence_passed" || msg.type === "ACTIVE_PRESENCE_PASSED") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    livenessVerified: true,
                    livenessFailed: false,
                    activePresenceState: "PASSED",
                    livenessLastCheck: msg.timestamp || new Date().toISOString(),
                  },
                };
              }

              if (
                msg.type === "liveness_fail" ||
                msg.type === "active_presence_quality_fail" ||
                msg.type === "active_presence_timed_out" ||
                msg.type === "ACTIVE_PRESENCE_QUALITY_FAIL" ||
                msg.type === "ACTIVE_PRESENCE_TIMED_OUT"
              ) {
                const presenceState = msg.type.includes("timed_out") ? "TIMED_OUT" : "QUALITY_FAIL";
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    livenessFailed: true,
                    activePresenceState: presenceState,
                    livenessFailReason: msg.reason || msg.failure_reason || "timeout",
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  },
                };
              }

              if (msg.type === "active_presence_declined" || msg.type === "ACTIVE_PRESENCE_DECLINED") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    activePresenceState: "DECLINED",
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  },
                };
              }

              if (msg.type === "active_presence_manual_review" || msg.type === "ACTIVE_PRESENCE_MANUAL_REVIEW") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    activePresenceState: "MANUAL_REVIEW",
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  },
                };
              }

              // Fallback
              return {
                ...prev,
                [uid]: {
                  ...prevStudent,
                  isSimulated,
                  ...msg,
                },
              };
            });
          } catch (err) {
            console.error("Teacher WS message error:", err);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setConnected(false);
          wsRef.current = null;
          reconnectRef.current = setTimeout(connect, 2500);
        };

        ws.onerror = () => {
          if (!isMounted) return;
          setConnected(false);
        };
      } catch {
        reconnectRef.current = setTimeout(connect, 2500);
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId]);

  return { connected, students, cases, setCases };
}
