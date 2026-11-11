// src/meeting/hms-meeting.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  selectIsConnectedToRoom,
  selectPeers,
  useHMSActions,
  useHMSStore,
} from "@100mslive/react-sdk";
import { MediaControlButton } from "../components/teacher/teacher-buttons.jsx";
import { StateDot } from "../components/app/state.jsx";
import { AlertIcon } from "../components/app/icons.jsx";

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
  leaveSignal = 0,
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

  // Declarative leave signal from the page's own "End session" control, so the
  // room can be left even when the video connection failed.
  useEffect(() => {
    if (!leaveSignal) return;
    try {
      hmsActions.leave();
    } catch {
      // Already disconnected; the page still needs to end the session.
    }
    onLeave?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveSignal]);

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
      <div className="stage-state" role="status">
        <div className="stage-state-inner">
          <span className="stage-icon" aria-hidden="true">
            <svg className="icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
            </svg>
          </span>
          <h3>Opening the video room</h3>
          <p>Waiting for the room token. This usually takes a moment.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stage-state" role="alert">
        <div className="stage-state-inner">
          <span className="stage-icon">
            <AlertIcon />
          </span>
          <h3>The video room did not open</h3>
          <p>{error}</p>
          <p className="stage-detail">
            {role === "host"
              ? "Class signals keep arriving. Retry the video when you can, or end the session and keep the record."
              : "Your signals keep arriving. Retry the video when you can."}
          </p>
          <button
            type="button"
            className="btn btn-cream"
            onClick={() => window.location.reload()}
          >
            Retry video
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="room-video-root">
      <div
        className="room-grid"
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

      <div className="room-media" role="group" aria-label="Room controls">
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

        <MediaControlButton onClick={handleLeave} title="Leave the room" danger>
          <LeaveIcon />
        </MediaControlButton>
      </div>
    </div>
  );
}

function kindFromStatus(status) {
  if (status === "flagged") return "identity";
  if (status === "away") return "away";
  if (status === "distracted") return "distracted";
  return "attentive";
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
    const node = videoRef.current;
    if (peer.videoTrack && node) {
      hmsActions.attachVideo(peer.videoTrack, node);
    }
    return () => {
      if (peer.videoTrack && node) {
        hmsActions.detachVideo(peer.videoTrack, node);
      }
    };
  }, [peer.videoTrack, hmsActions]);

  return (
    <div className="room-tile">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={peer.isLocal}
        className="room-video"
      />
      <span className="room-tile-label">
        {peer.name}
        {peer.isLocal ? " (you)" : ""}
      </span>
      {!isTeacher && (
        <span className="room-tile-state">
          <StateDot kind={kindFromStatus(status)} />
          {statusLabel}
        </span>
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
    <div className="room-tile room-tile--sim">
      <span className="room-tile-state">
        <StateDot kind={kindFromStatus(status)} />
        {statusLabel}
      </span>
      <span className="room-sim-mark" aria-hidden="true">
        SIM
      </span>
      <span className="room-sim-name" title={student?.userId}>
        {student?.userId}
      </span>
      <span className="room-sim-score">{score}%</span>
    </div>
  );
}

function OverflowTile({ count }) {
  return (
    <div className="room-tile room-tile--more">
      <span>+{count} more in the room</span>
    </div>
  );
}

