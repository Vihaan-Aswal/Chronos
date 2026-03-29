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

const missingEnv = [];
if (!import.meta.env.VITE_SUPABASE_URL) missingEnv.push('VITE_SUPABASE_URL');
if (!import.meta.env.VITE_SUPABASE_ANON_KEY) missingEnv.push('VITE_SUPABASE_ANON_KEY');
if (!import.meta.env.VITE_BACKEND_URL) missingEnv.push('VITE_BACKEND_URL');
if (!import.meta.env.VITE_BACKEND_WS_URL) missingEnv.push('VITE_BACKEND_WS_URL');
if (!import.meta.env.VITE_HMS_TOKEN_ENDPOINT) missingEnv.push('VITE_HMS_TOKEN_ENDPOINT');

if (missingEnv.length > 0) {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', color: '#ba1a1a', background: '#ffebee', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>🚨 Environment Configuration Error</h1>
      <p style={{ marginTop: '1rem' }}>The application cannot start because the following required environment variables are missing:</p>
      <ul style={{ marginTop: '1rem', listStyle: 'disc', paddingLeft: '2rem' }}>
        {missingEnv.map(env => <li key={env}><strong>{env}</strong></li>)}
      </ul>
      <p style={{ marginTop: '1rem' }}>Please copy <code>.env.example</code> to <code>.env</code> in the <code>frontend</code> directory and provide the necessary values.</p>
    </div>
  );
} else {
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
}
