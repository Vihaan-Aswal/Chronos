import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PreJoinNoticeModal from "../components/privacy/pre-join-notice-modal.jsx";

describe("PreJoinNoticeModal Component", () => {
  it("renders 8 consent categories and zero-raw-media guarantee", () => {
    render(<PreJoinNoticeModal isOpen={true} onConfirm={vi.fn()} />);

    expect(screen.getByText("Privacy & Consent Transparency")).toBeInTheDocument();
    expect(screen.getByText("Zero Raw Video Guarantee")).toBeInTheDocument();

    // Check presence of consent labels
    expect(screen.getByText("Live Session Participation")).toBeInTheDocument();
    expect(screen.getByText("Local Camera Processing (On-Device)")).toBeInTheDocument();
    expect(screen.getByText("Attention & Gaze Metrics")).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <PreJoinNoticeModal isOpen={false} onConfirm={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("submits selected consents when user confirms", () => {
    const handleConfirm = vi.fn();
    render(<PreJoinNoticeModal isOpen={true} onConfirm={handleConfirm} />);

    const confirmBtn = screen.getByText("Confirm Preferences & Join");
    fireEvent.click(confirmBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    const submitted = handleConfirm.mock.calls[0][0];
    expect(submitted.LIVE_SESSION_PARTICIPATION).toBe(true);
    expect(submitted.CAMERA_LOCAL_PROCESSING).toBe(true);
  });

  it("submits camera-optional configuration when camera-off joined", () => {
    const handleConfirm = vi.fn();
    render(<PreJoinNoticeModal isOpen={true} onConfirm={handleConfirm} />);

    const cameraOffBtn = screen.getByText("Join in Camera-Optional Mode");
    fireEvent.click(cameraOffBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    const submitted = handleConfirm.mock.calls[0][0];
    expect(submitted.LIVE_SESSION_PARTICIPATION).toBe(true);
    expect(submitted.CAMERA_LOCAL_PROCESSING).toBe(false);
    expect(submitted.ATTENTION_TELEMETRY).toBe(false);
  });
});
