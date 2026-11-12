import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StudentCard from "../components/teacher/student-card.jsx";

describe("StudentCard Component", () => {
  const mockStudent = {
    userId: "usr-stud-1",
    score: 0.85,
    presence: "present",
    identityStatus: "verified",
    warningStreak: 0,
    cleanStreak: 2,
    caseState: "NONE",
    gazeDirection: "center",
    ear: 0.35,
    headPose: { yaw: 0, pitch: 0 },
    timestamp: new Date().toISOString(),
  };

  it("renders student name, initials and status", () => {
    render(
      <StudentCard
        student={mockStudent}
        statusLabel="Engaged"
        statusKey="engaged"
        priority="NORMAL"
        isSimulated={false}
        isFlagged={false}
        signals={[]}
        onMarkEngaged={vi.fn()}
        onMessage={vi.fn()}
        onIgnore={vi.fn()}
        onRemove={vi.fn()}
        onVerify={vi.fn()}
      />
    );

    expect(screen.getByText("usr-stud-1")).toBeInTheDocument();
    expect(screen.getByText("US")).toBeInTheDocument();
    expect(screen.getByText("Engaged")).toBeInTheDocument();
  });

  it("calls onVerify when verify action is clicked", () => {
    const handleVerify = vi.fn();
    render(
      <StudentCard
        student={mockStudent}
        statusLabel="Engaged"
        statusKey="engaged"
        priority="NORMAL"
        isSimulated={false}
        isFlagged={false}
        signals={[]}
        onMarkEngaged={vi.fn()}
        onMessage={vi.fn()}
        onIgnore={vi.fn()}
        onRemove={vi.fn()}
        onVerify={handleVerify}
      />
    );

    const verifyBtn = screen.getByTitle("Verify");
    fireEvent.click(verifyBtn);

    expect(handleVerify).toHaveBeenCalledWith("usr-stud-1");
  });
});
