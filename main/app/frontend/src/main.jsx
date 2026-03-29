// src/main.jsx

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AnimatePresence } from "motion/react";

import { HMSRoomProvider } from "@100mslive/react-sdk";

// ── New pages (Phase 3+) ──────────────────────────────────────────────────
import HomePage        from "./pages/home-page.jsx";
import SignInPage      from "./pages/sign-in-page.jsx";
import SignUpPage      from "./pages/sign-up-page.jsx";
import ChooseRolePage  from "./pages/choose-role-page.jsx";
import ReadinessPage   from "./pages/readiness-page.jsx";
import AuthGuard       from "./components/auth-guard.jsx";

// ── Core app pages (Phase 8/9 protected routes) ──────────────────────────
import StudentPage from "./pages/student-page.jsx";
import TeacherPage from "./pages/teacher-page.jsx";
import MeetingRoom from "./pages/meeting-room.jsx";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <HMSRoomProvider>
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Routes>
          {/* ── Phase 3: landing page ── */}
        <Route path="/" element={<HomePage />} />

        {/* ── Phase 4 & 5: auth pages ── */}
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />

        {/* ── Phase 6 & 7: role selection + readiness (AuthGuard protected) ── */}
        <Route path="/choose-role" element={<AuthGuard><ChooseRolePage /></AuthGuard>} />
        <Route path="/readiness"   element={<AuthGuard><ReadinessPage /></AuthGuard>} />

        {/* ── Phase 8/9: core app routes (AuthGuard protected) ── */}
        <Route path="/student" element={<AuthGuard><StudentPage /></AuthGuard>} />
        <Route path="/teacher" element={<AuthGuard><TeacherPage /></AuthGuard>} />

        <Route path="/meeting" element={<MeetingRoom />} />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  </HMSRoomProvider>
);
