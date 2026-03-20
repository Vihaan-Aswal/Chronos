// src/hms/HMSMeeting.jsx
import React, { useEffect, useState, useRef } from "react";
import {
  selectIsConnectedToRoom,
  selectPeers,
  useHMSActions,
  useHMSStore,
} from "@100mslive/react-sdk";

// ICONS 
const Mic = () => <span>🎤</span>;
const MicOff = () => <span>🔇</span>;
const Cam = () => <span>📷</span>;
const CamOff = () => <span>🚫</span>;
const LeaveIcon = () => <span>🚪</span>;

export default function HMSMeeting({ userName, role = "guest", onLeave }) {
  const hmsActions = useHMSActions();
  const isConnected = useHMSStore(selectIsConnectedToRoom);
  const peers = useHMSStore(selectPeers);

  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function join() {
      try {
        setLoading(true);
        setError(null);

        // Fetch token from backend
        const tokenEndpoint = import.meta.env.VITE_HMS_TOKEN_ENDPOINT || "http://localhost:8000/hms-token";
        
        console.log("[HMS] Fetching token for:", userName, "role:", role);
        
        const response = await fetch(tokenEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_name: userName,
            role: role,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to get HMS token");
        }

        const data = await response.json();
        const authToken = data.token;

        if (!authToken) {
          throw new Error("No token received from server");
        }

        console.log("[HMS] Token received, joining room...");

        // Join HMS room
        await hmsActions.join({
          userName,
          authToken,
          settings: {
            isAudioMuted: false,
            isVideoMuted: false,
          },
        });

        console.log("[HMS] Successfully joined room");
        setLoading(false);
      } catch (err) {
        console.error("[HMS] Join error:", err);
        setError(err.message);
        setLoading(false);
      }
    }

    if (!isConnected) {
      join();
    }
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

  // Calculate optimal grid layout
  function getGridLayout(count) {
    if (count === 0) return { cols: 1, rows: 1 };
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    if (count <= 12) return { cols: 4, rows: 3 };
    if (count <= 16) return { cols: 4, rows: 4 };
    return { cols: 5, rows: Math.ceil(count / 5) };
  }

  if (loading) {
    return (
      <div className="w-full h-full bg-[#111] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-2">🔄</div>
          <div>Connecting to meeting...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-[#111] text-white flex items-center justify-center">
        <div className="text-center max-w-md p-6">
          <div className="text-4xl mb-4">❌</div>
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

  const layout = getGridLayout(peers.length);

  return (
    <div className="w-full h-full bg-[#111] text-white flex flex-col relative overflow-hidden">
      {/* Grid with smart layout */}
      <div className="flex-1 overflow-hidden p-4 flex items-center justify-center">
        <div
          className="grid gap-3 w-full h-full"
          style={{
            gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
            gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
          }}
        >
          {peers.map((peer) => (
            <PeerTile key={peer.id} peer={peer} />
          ))}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="
        absolute bottom-6 left-1/2 -translate-x-1/2
        bg-black/60 backdrop-blur-xl
        p-3 rounded-full shadow-lg flex items-center gap-4
        border border-gray-700
      ">
        <button
          onClick={toggleAudio}
          className="
            w-12 h-12 flex items-center justify-center
            rounded-full bg-gray-800 hover:bg-gray-700
            transition-all
          "
        >
          {audioOn ? <Mic/> : <MicOff/>}
        </button>

        <button
          onClick={toggleVideo}
          className="
            w-12 h-12 flex items-center justify-center
            rounded-full bg-gray-800 hover:bg-gray-700
            transition-all
          "
        >
          {videoOn ? <Cam/> : <CamOff/>}
        </button>

        <button
          onClick={handleLeave}
          className="
            w-12 h-12 flex items-center justify-center
            rounded-full bg-red-600 hover:bg-red-700
            transition-all
          "
        >
          <LeaveIcon/>
        </button>
      </div>
    </div>
  );
}

/* -----------------------------
    Peer Tile
--------------------------------*/
function PeerTile({ peer }) {
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

  return (
    <div className="
      bg-black border border-gray-700 rounded-xl
      overflow-hidden relative
      w-full h-full
      group
      flex items-center justify-center
    ">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={peer.isLocal}
        className="w-full h-full object-cover"
      />

      <div className="
        absolute bottom-2 left-2 px-2 py-1 text-xs
        bg-black/50 rounded opacity-90
      ">
        {peer.name} {peer.isLocal ? "(You)" : ""}
      </div>
    </div>
  );
}