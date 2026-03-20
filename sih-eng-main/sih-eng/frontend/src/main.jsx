// src/main.jsx

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { HMSRoomProvider } from "@100mslive/react-sdk";

import Login from "./components/Login.jsx";
import StudentPage from "./pages/StudentPage.jsx";
import TeacherPage from "./pages/TeacherPage.jsx";
import MeetingRoom from "./pages/MeetingRoom.jsx"; // replaces VideoClassroom

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <HMSRoomProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/teacher" element={<TeacherPage />} />
        <Route path="/meeting" element={<MeetingRoom />} />
      </Routes>
    </BrowserRouter>
  </HMSRoomProvider>
);
