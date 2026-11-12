import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ActivePresenceModal from "../components/presence/ActivePresenceModal.jsx";
import * as presenceApi from "../api/presence.js";

vi.mock("../api/presence.js", () => ({
  respondPresenceChallenge: vi.fn().mockResolvedValue({ status: "PASSED" }),
  requestManualReview: vi.fn().mockResolvedValue({ status: "MANUAL_REVIEW" }),
  declinePresenceChallenge: vi.fn().mockResolvedValue({ status: "DECLINED" }),
}));

describe("ActivePresenceModal Component", () => {
  const mockChallenge = {
    challenge_id: "chal-test-101",
    nonce: "nonce-random-1234",
    actions: ["TURN_LEFT", "LOOK_UP"],
    timeout_sec: 15,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders active presence prompt and baseline instructions", () => {
    render(
      <ActivePresenceModal
        challenge={mockChallenge}
        sessionId="ses-presence-1"
        currentPose={{ yaw: 0, pitch: 0, roll: 0 }}
      />
    );

    expect(screen.getByText("Active Presence Verification")).toBeInTheDocument();
  });

  it("triggers manual review when manual review button is clicked", async () => {
    const handleComplete = vi.fn();
    render(
      <ActivePresenceModal
        challenge={mockChallenge}
        sessionId="ses-presence-1"
        onComplete={handleComplete}
      />
    );

    const manualBtn = screen.getByText("Teacher Check");
    fireEvent.click(manualBtn);

    await waitFor(() => {
      expect(presenceApi.requestManualReview).toHaveBeenCalledWith(
        "ses-presence-1",
        expect.objectContaining({ challenge_id: "chal-test-101" })
      );
      expect(handleComplete).toHaveBeenCalledWith({ status: "MANUAL_REVIEW" });
    });
  });

  it("triggers decline when student declines check", async () => {
    const handleDismiss = vi.fn();
    render(
      <ActivePresenceModal
        challenge={mockChallenge}
        sessionId="ses-presence-1"
        onDismiss={handleDismiss}
      />
    );

    const declineBtn = screen.getByText("Decline Check");
    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(presenceApi.declinePresenceChallenge).toHaveBeenCalledWith(
        "ses-presence-1",
        expect.objectContaining({ challenge_id: "chal-test-101" })
      );
      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });
  });
});
