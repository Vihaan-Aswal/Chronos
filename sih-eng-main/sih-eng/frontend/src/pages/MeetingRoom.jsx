// src/pages/MeetingRoom.jsx


import React from "react";
import { useSearchParams } from "react-router-dom";
import HMSMeeting from "../hms/HMSMeeting.jsx";

export default function MeetingRoom() {
  const [params] = useSearchParams();

  const userName = params.get("user") || `user_${Date.now()}`;

  return (
    <div className="w-full h-screen">
      <HMSMeeting
        userName={userName}
        onLeave={() => window.history.back()}
      />
    </div>
  );
}
