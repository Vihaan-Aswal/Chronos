import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StudentHealthPanel from "../components/student/student-health-panel.jsx";

describe("StudentHealthPanel Component", () => {
  it("renders system health statuses correctly", () => {
    render(
      <StudentHealthPanel
        cameraActive={true}
        faceDetected={true}
        lightingQuality="optimal"
        networkStatus="connected"
        identityState="VERIFIED"
        activePresenceState="NOT_REQUESTED"
      />
    );

    expect(screen.getByText("System Health & Self-Recovery")).toBeInTheDocument();
    expect(screen.getByText("Camera & Lighting")).toBeInTheDocument();
    expect(screen.getByText("Network Telemetry")).toBeInTheDocument();
    expect(screen.getByText("Identity Continuity")).toBeInTheDocument();
    expect(screen.getByText("VERIFIED")).toBeInTheDocument();
    expect(screen.getByText("HEALTHY")).toBeInTheDocument();
  });

  it("shows recovery warning when camera is inactive", () => {
    const handleRetry = vi.fn();
    render(
      <StudentHealthPanel
        cameraActive={false}
        faceDetected={false}
        lightingQuality="low"
        networkStatus="connected"
        identityState="UNVERIFIED"
        onRetryCamera={handleRetry}
      />
    );

    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
    const retryBtn = screen.getByText("Retry Camera");
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenContextModal when Add Context button is clicked", () => {
    const handleOpenContext = vi.fn();
    render(
      <StudentHealthPanel
        cameraActive={true}
        faceDetected={true}
        onOpenContextModal={handleOpenContext}
      />
    );

    const contextBtn = screen.getByText("Add Context");
    fireEvent.click(contextBtn);
    expect(handleOpenContext).toHaveBeenCalledTimes(1);
  });
});
