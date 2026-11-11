import { useSearchParams } from "react-router-dom";
import HMSMeeting from "../meeting/hms-meeting.jsx";
import ChronosMark from "../components/chronos-mark.jsx";
import "../styles/app-system.css";
import "../styles/room.css";

export default function MeetingRoom() {
  const [params] = useSearchParams();
  const userName = params.get("user") || "guest_user";

  return (
    <div className="app room">
      <header className="room-bar">
        <div className="room-bar-inner">
          <span className="room-brand">
            <span aria-hidden="true">
              <ChronosMark size={20} variant="gold" />
            </span>
            <span>Chronos</span>
          </span>
          <div className="room-session">
            <b>Meeting</b>
            <span className="room-sep" aria-hidden="true" />
            <span>{userName}</span>
          </div>
          <div className="room-bar-actions">
            <button
              type="button"
              className="btn btn-cream"
              onClick={() => window.history.back()}
            >
              Leave
            </button>
          </div>
        </div>
      </header>

      <div className="room-main">
        <main className="room-stage">
          <div className="room-stage-shell">
            <HMSMeeting
              userName={userName}
              onLeave={() => window.history.back()}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
