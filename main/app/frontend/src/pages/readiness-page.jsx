import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import JoinScreen from "../components/join-screen.jsx";
import ReadyLayout from "../components/app/ready-layout.jsx";
import "../styles/app-system.css";
import "../styles/readiness.css";

export default function ReadinessPage() {
  const navigate = useNavigate();

  let user = null;
  try {
    const raw = sessionStorage.getItem("chronos_user");
    if (raw) user = JSON.parse(raw);
  } catch {
    // Malformed JSON — AuthGuard handles the signed-out case.
  }

  const role = sessionStorage.getItem("chronos_role");

  useEffect(() => {
    if (!role) navigate("/choose-role", { replace: true });
  }, [role, navigate]);

  if (!role) return null;

  function handleJoin() {
    navigate(`/${role}`, {
      replace: true,
      state: { user, role, readinessCompleted: true },
    });
  }

  return (
    <ReadyLayout
      user={user}
      title={
        <>
          Before you <em>join.</em>
        </>
      }
      lede={`You are joining as a ${role}. Three checks, then class. The camera check runs on this device.`}
    >
      <JoinScreen user={user} role={role} onJoin={handleJoin} />
    </ReadyLayout>
  );
}
