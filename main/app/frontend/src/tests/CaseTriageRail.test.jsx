import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CaseTriageRail from "../components/teacher/case-triage-rail.jsx";

describe("CaseTriageRail Component", () => {
  const mockCases = [
    {
      case_id: "case-001",
      participant_id: "usr-stud-1",
      priority: "ACTION_REQUIRED",
      status: "OPEN",
      category: "ATTENTION_PERSISTENT",
      summary: "Persistent attention divergence for 3+ windows",
      warning_streak: 3,
      clean_streak: 0,
      student_context_count: 0,
    },
    {
      case_id: "case-002",
      participant_id: "usr-stud-2",
      priority: "MONITOR",
      status: "OPEN",
      category: "ATTENTION_EARLY",
      summary: "Early warning stage",
      warning_streak: 1,
      clean_streak: 0,
      student_context_count: 1,
    },
    {
      case_id: "case-003",
      participant_id: "usr-stud-3",
      priority: "MONITOR",
      status: "OPEN",
      category: "TECHNICAL_CAMERA",
      summary: "Camera feed inactive",
      warning_streak: 0,
      clean_streak: 0,
      student_context_count: 0,
    },
  ];

  it("renders triage rail and tabs with counts", () => {
    render(<CaseTriageRail cases={mockCases} />);

    expect(screen.getByText("Exception & Triage Queue")).toBeInTheDocument();
    expect(screen.getByText("3 Total Exceptions")).toBeInTheDocument();

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
    expect(screen.getByText("Technical")).toBeInTheDocument();
  });

  it("filters cases according to active tab", () => {
    render(<CaseTriageRail cases={mockCases} />);

    // Default tab is 'Active' -> should show usr-stud-1 (case-001)
    expect(screen.getByText("usr-stud-1")).toBeInTheDocument();
    expect(screen.queryByText("usr-stud-2")).toBeNull();

    // Click 'Monitor' tab
    const monitorTab = screen.getByText("Monitor");
    fireEvent.click(monitorTab);

    expect(screen.getByText("usr-stud-2")).toBeInTheDocument();
    expect(screen.queryByText("usr-stud-1")).toBeNull();
  });

  it("executes batch action when cases are selected and action triggered", async () => {
    const handleBatchAction = vi.fn().mockResolvedValue({});
    render(<CaseTriageRail cases={mockCases} onExecuteBatchAction={handleBatchAction} />);

    // In Active tab, select all via checkbox label text
    const selectAllLabel = screen.getByText("Select All (1)");
    fireEvent.click(selectAllLabel);

    // Batch actions bar should appear
    expect(screen.getByText("1 Selected")).toBeInTheDocument();

    const resolveBtn = screen.getByText("Resolve Selected (1)");
    fireEvent.click(resolveBtn);

    expect(handleBatchAction).toHaveBeenCalledWith({
      caseIds: ["case-001"],
      actionType: "batch_resolve",
    });
  });
});
