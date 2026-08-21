import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SummaryCards from "../components/teacher/summary-cards.jsx";

describe("SummaryCards Component", () => {
  it("renders metric cards with correct counts", () => {
    render(
      <SummaryCards
        actionRequiredCount={3}
        monitorCount={7}
        identityIssueCount={1}
        totalStudents={25}
      />
    );

    expect(screen.getByText("Action Required")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    expect(screen.getByText("Monitor")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    expect(screen.getByText("Identity Concerns")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    expect(screen.getByText("Active Roster")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });
});
