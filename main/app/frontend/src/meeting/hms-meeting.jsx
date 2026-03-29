// src/meeting/hms-meeting.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  selectIsConnectedToRoom,
  selectPeers,
  useHMSActions,
  useHMSStore,
} from "@100mslive/react-sdk";
import { MediaControlButton } from "../components/teacher/teacher-buttons.jsx";

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="9"
        y="3"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5.5 11.5C5.5 15.09 8.41 18 12 18C15.59 18 18.5 15.09 18.5 11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 18V21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="9"
        y="3"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5.5 11.5C5.5 15.09 8.41 18 12 18C15.59 18 18.5 15.09 18.5 11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 18V21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4.5 4.5L19.5 19.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.75 8.5C3.75 7.26 4.76 6.25 6 6.25H13C14.24 6.25 15.25 7.26 15.25 8.5V15.5C15.25 16.74 14.24 17.75 13 17.75H6C4.76 17.75 3.75 16.74 3.75 15.5V8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M15.25 10L20.25 7.75V16.25L15.25 14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CamOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.75 8.5C3.75 7.26 4.76 6.25 6 6.25H13C14.24 6.25 15.25 7.26 15.25 8.5V15.5C15.25 16.74 14.24 17.75 13 17.75H6C4.76 17.75 3.75 16.74 3.75 15.5V8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M15.25 10L20.25 7.75V16.25L15.25 14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 4.5L19.5 19.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 5.75H6.75C5.65 5.75 4.75 6.65 4.75 7.75V16.25C4.75 17.35 5.65 18.25 6.75 18.25H9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M13.5 8L18 12L13.5 16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 12H17.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.22"
      />
      <path
        d="M20 12C20 7.58 16.42 4 12 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4.75L20 18.5H4L12 4.75Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 9V13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.4" r="0.9" fill="currentColor" />
    </svg>
  );
}

const MAX_TOTAL_TILES = 6;
const MAX_STUDENT_SLOTS = MAX_TOTAL_TILES - 1;
const HMS_TOKEN_TIMEOUT_MS = 10000;
const HMS_JOIN_TIMEOUT_MS = 15000;

function createTimeoutError(message) {
  const err = new Error(message);
  err.name = "TimeoutError";
  return err;
}

function withTimeout(promise, ms, onTimeout) {
  let timeoutId = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        if (typeof onTimeout === "function") onTimeout();
        reject(createTimeoutError("Operation timed out"));
      }, ms);
    }),
  ]).finally(() => {
    if (timeoutId) window.clearTimeout(timeoutId);
  });
}

function getGridLayout(count) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  return { cols: 3, rows: 2 };
}

function normalizeKey(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildStudentLookup(cameraStudents) {
  const lookup = new Map();

  cameraStudents.forEach((student) => {
    const rawId = String(student.userId || "");
    const rawEmailName = rawId.includes("@") ? rawId.split("@")[0] : rawId;
    const keys = [normalizeKey(rawId), normalizeKey(rawEmailName)].filter(
      Boolean,
    );

    keys.forEach((key) => {
      if (!lookup.has(key)) {
        lookup.set(key, student);
      }
    });
  });

  return lookup;
}

function resolveStudentForPeer(peer, lookup) {
  const name = String(peer?.name || "");
  const localName = name.includes("@") ? name.split("@")[0] : name;
  const keys = [normalizeKey(name), normalizeKey(localName)].filter(Boolean);

  for (const key of keys) {
    if (lookup.has(key)) {
      return lookup.get(key);
    }
  }

  return null;
}

function statusRank(status) {
  if (status === "flagged") return 4;
  if (status === "away") return 3;
  if (status === "distracted") return 2;
  if (status === "attentive") return 1;
  return 0;
}

function buildTeacherStageTiles(peers, cameraStudents) {
  const localPeer = peers.find((peer) => peer.isLocal) || peers[0] || null;
  const remotePeers = localPeer
    ? peers.filter((peer) => peer.id !== localPeer.id)
    : peers;

  const studentLookup = buildStudentLookup(cameraStudents);
  const representedStudentIds = new Set();
  const fallbackRealStudents = cameraStudents
    .filter((student) => !student.isSimulated)
    .sort((a, b) => {
      const byRank = statusRank(b.stageStatus) - statusRank(a.stageStatus);
      if (byRank !== 0) return byRank;
      return (a.score || 0) - (b.score || 0);
    });
  const fallbackUsedIds = new Set();

  const realPeerTiles = remotePeers.map((peer) => {
    let matched = resolveStudentForPeer(peer, studentLookup);

    if (!matched) {
      matched = fallbackRealStudents.find(
        (student) => !fallbackUsedIds.has(student.userId),
      );
      if (matched?.userId) {
        fallbackUsedIds.add(matched.userId);
      }
    }

    if (matched?.userId) representedStudentIds.add(matched.userId);

    return {
      type: "peer",
      id: `peer-${peer.id}`,
      peer,
      status: matched?.stageStatus || "attentive",
      statusLabel: matched?.statusLabel || "Attentive",
    };
  });

  const simulatedCandidates = cameraStudents
    .filter(
      (student) =>
        student.isSimulated && !representedStudentIds.has(student.userId),
    )
    .sort((a, b) => {
      const byRank = statusRank(b.stageStatus) - statusRank(a.stageStatus);
      if (byRank !== 0) return byRank;
      return (a.score || 0) - (b.score || 0);
    });

  const totalStudents = cameraStudents.length;
  const needsOverflow = totalStudents > MAX_STUDENT_SLOTS;
  const visibleStudentSlots = needsOverflow
    ? MAX_STUDENT_SLOTS - 1
    : MAX_STUDENT_SLOTS;

  const stageStudentTiles = [];
  const realCount = Math.min(realPeerTiles.length, visibleStudentSlots);

  for (let i = 0; i < realCount; i += 1) {
    stageStudentTiles.push(realPeerTiles[i]);
  }

  const remainingSlots = visibleStudentSlots - stageStudentTiles.length;
  for (
    let i = 0;
    i < remainingSlots && i < simulatedCandidates.length;
    i += 1
  ) {
    const student = simulatedCandidates[i];
    stageStudentTiles.push({
      type: "simulated",
      id: `sim-${student.userId}`,
      student,
      status: student.stageStatus || "attentive",
      statusLabel: student.statusLabel || "Simulated",
    });
  }

  const hiddenCount = Math.max(totalStudents - stageStudentTiles.length, 0);

  const tiles = [];

  if (localPeer) {
    tiles.push({
      type: "teacher",
      id: `teacher-${localPeer.id}`,
      peer: localPeer,
      status: "neutral",
      statusLabel: "Teacher",
    });
  }

  tiles.push(...stageStudentTiles);

  if (needsOverflow && hiddenCount > 0) {
    tiles.push({
      type: "overflow",
      id: "overflow",
      count: hiddenCount,
    });
  }

  return tiles.slice(0, MAX_TOTAL_TILES);
}

export default function HMSMeeting({
  userName,
  role = "guest",
  onLeave,
  cameraStudents,
}) {
  const hmsActions = useHMSActions();
  const isConnected = useHMSStore(selectIsConnectedToRoom);
  const peers = useHMSStore(selectPeers);

  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const joinAttemptRef = useRef(false);
  const connectionKeyRef = useRef("");

  useEffect(() => {
    const nextConnectionKey = `${userName}::${role}`;
    if (connectionKeyRef.current !== nextConnectionKey) {
      connectionKeyRef.current = nextConnectionKey;
      joinAttemptRef.current = false;
    }

    if (isConnected) {
      setLoading(false);
      setError(null);
      joinAttemptRef.current = false;
      return;
    }

    if (joinAttemptRef.current) {
      return;
    }

    const abortController = new AbortController();
    let disposed = false;
    joinAttemptRef.current = true;

    async function join() {
      try {
        if (disposed) return;
        setLoading(true);
        setError(null);

        const tokenEndpoint =
          import.meta.env.VITE_HMS_TOKEN_ENDPOINT ||
          "http://localhost:8000/hms-token";

        const response = await withTimeout(
          fetch(tokenEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            signal: abortController.signal,
            body: JSON.stringify({
              user_name: userName,
              role: role,
            }),
          }),
          HMS_TOKEN_TIMEOUT_MS,
          () => abortController.abort(),
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to get HMS token");
        }

        const data = await response.json();
        const authToken = data.token;

        if (!authToken) {
          throw new Error("No token received from server");
        }

        await withTimeout(
          hmsActions.join({
            userName,
            authToken,
            settings: {
              isAudioMuted: false,
              isVideoMuted: false,
            },
          }),
          HMS_JOIN_TIMEOUT_MS,
        );

        if (!disposed) {
          setLoading(false);
        }
      } catch (err) {
        if (disposed || err?.name === "AbortError") {
          return;
        }
        console.error("[HMS] Join error:", err);
        if (err?.name === "TimeoutError") {
          setError(
            "Connection timed out. Check that backend HMS token service is running.",
          );
        } else {
          setError(err.message || "Failed to join meeting");
        }
        setLoading(false);
        joinAttemptRef.current = false;
      }
    }

    join();

    return () => {
      disposed = true;
      abortController.abort();
    };
  }, [isConnected, userName, role, hmsActions]);

  async function toggleVideo() {
    await hmsActions.setLocalVideoEnabled(!videoOn);
    setVideoOn(!videoOn);
  }

  async function toggleAudio() {
    await hmsActions.setLocalAudioEnabled(!audioOn);
    setAudioOn(!audioOn);
  }

  function handleLeave() {
    hmsActions.leave();
    onLeave?.();
  }

  const isTeacherStageMode = Array.isArray(cameraStudents);

  const stageTiles = useMemo(() => {
    if (!isTeacherStageMode) {
      return peers.map((peer) => ({
        type: peer.isLocal ? "teacher" : "peer",
        id: `peer-${peer.id}`,
        peer,
        status: peer.isLocal ? "neutral" : "attentive",
        statusLabel: peer.isLocal ? "You" : "Live",
      }));
    }

    return buildTeacherStageTiles(peers, cameraStudents);
  }, [cameraStudents, isTeacherStageMode, peers]);

  const layout = getGridLayout(stageTiles.length || 1);

  if (loading) {
    return (
      <div className="w-full h-full bg-[#111] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="td-hms-state-icon td-spin mb-2">
            <SpinnerIcon />
          </div>
          <div>Connecting to meeting...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-[#111] text-white flex items-center justify-center">
        <div className="text-center max-w-md p-6">
          <div className="td-hms-state-icon td-error mb-4">
            <WarningIcon />
          </div>
          <div className="text-xl font-bold mb-2">Connection Failed</div>
          <div className="text-sm text-gray-400 mb-4">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="td-hms-root w-full h-full bg-[#111] text-white flex flex-col relative overflow-hidden">
      <div className="td-hms-grid-wrap flex-1 overflow-hidden p-4 flex items-center justify-center">
        <div
          className="td-hms-grid grid gap-3 w-full h-full"
          style={{
            gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
            gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
          }}
        >
          {stageTiles.map((tile) => {
            if (tile.type === "simulated") {
              return (
                <SimulatedTile
                  key={tile.id}
                  student={tile.student}
                  status={tile.status}
                  statusLabel={tile.statusLabel}
                />
              );
            }

            if (tile.type === "overflow") {
              return <OverflowTile key={tile.id} count={tile.count} />;
            }

            return (
              <PeerTile
                key={tile.id}
                peer={tile.peer}
                status={tile.status}
                statusLabel={tile.statusLabel}
                isTeacher={tile.type === "teacher"}
              />
            );
          })}
        </div>
      </div>

      <div className="td-media-controls absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-xl p-3 rounded-full shadow-lg flex items-center gap-4 border border-gray-700">
        <MediaControlButton
          onClick={toggleAudio}
          state={audioOn ? "on" : "off"}
          title={audioOn ? "Mute microphone" : "Unmute microphone"}
        >
          {audioOn ? <MicIcon /> : <MicOffIcon />}
        </MediaControlButton>

        <MediaControlButton
          onClick={toggleVideo}
          state={videoOn ? "on" : "off"}
          title={videoOn ? "Turn camera off" : "Turn camera on"}
        >
          {videoOn ? <CamIcon /> : <CamOffIcon />}
        </MediaControlButton>

        <MediaControlButton onClick={handleLeave} title="Leave meeting" danger>
          <LeaveIcon />
        </MediaControlButton>
      </div>
    </div>
  );
}

function PeerTile({
  peer,
  status = "neutral",
  statusLabel = "Live",
  isTeacher = false,
}) {
  const videoRef = useRef(null);
  const hmsActions = useHMSActions();

  useEffect(() => {
    if (peer.videoTrack && videoRef.current) {
      hmsActions.attachVideo(peer.videoTrack, videoRef.current);
    }
    return () => {
      if (peer.videoTrack && videoRef.current) {
        hmsActions.detachVideo(peer.videoTrack, videoRef.current);
      }
    };
  }, [peer.videoTrack, hmsActions]);

  const statusClass = isTeacher
    ? "td-peer-status-neutral"
    : `td-peer-status-${status}`;

  return (
    <div
      className={`td-peer-tile ${statusClass} bg-black border border-gray-700 rounded-xl overflow-hidden relative w-full h-full group flex items-center justify-center`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={peer.isLocal}
        className="td-peer-video w-full h-full object-cover"
      />

      <div className="td-peer-aura" aria-hidden="true" />

      <div className="td-peer-label absolute bottom-2 left-2 px-2 py-1 text-xs bg-black/50 rounded opacity-90">
        {peer.name} {peer.isLocal ? "(You)" : ""}
      </div>

      {!isTeacher && (
        <div
          className="td-peer-status-chip"
          aria-label={`Status ${statusLabel}`}
        >
          {statusLabel}
        </div>
      )}
    </div>
  );
}

function SimulatedTile({
  student,
  status = "attentive",
  statusLabel = "Simulated",
}) {
  const score = Math.round((student?.score || 0) * 100);

  return (
    <div
      className={`td-peer-tile td-simulated-tile td-peer-status-${status} bg-black border border-gray-700 rounded-xl overflow-hidden relative w-full h-full flex flex-col items-center justify-center`}
    >
      <div className="td-peer-aura" aria-hidden="true" />

      <div className="td-sim-avatar">SIM</div>
      <div className="td-sim-name" title={student?.userId}>
        {student?.userId}
      </div>
      <div className="td-sim-score">{score}%</div>
      <div className="td-peer-status-chip">{statusLabel}</div>
    </div>
  );
}

function OverflowTile({ count }) {
  return (
    <div className="td-peer-tile td-overflow-tile bg-black border border-gray-700 rounded-xl overflow-hidden relative w-full h-full flex items-center justify-center">
      <div className="td-overflow-text">+{count} more students</div>
    </div>
  );
}
