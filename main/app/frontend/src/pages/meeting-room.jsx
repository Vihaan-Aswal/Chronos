// src/pages/MeetingRoom.jsx

import { useSearchParams } from "react-router-dom";
import HMSMeeting from "../meeting/hms-meeting.jsx";

export default function MeetingRoom() {
  const [params] = useSearchParams();

  const userName = params.get("user") || "guest_user";

  return (
    <div className="w-full h-screen">
      <HMSMeeting userName={userName} onLeave={() => window.history.back()} />
    </div>
  );
}
