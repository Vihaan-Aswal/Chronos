export default function SummaryCards({
  flaggedCount,
  identityIssueCount,
  avgScore,
}) {
  return (
    <div className="td-summary-grid" aria-label="Summary metrics">
      <div className="td-summary-card">
        <div className="td-summary-label">Flagged</div>
        <div className="td-summary-value warn">{flaggedCount}</div>
      </div>

      <div className="td-summary-card">
        <div className="td-summary-label">Identity</div>
        <div className="td-summary-value danger">{identityIssueCount}</div>
      </div>

      <div className="td-summary-card">
        <div className="td-summary-label">Avg score</div>
        <div className="td-summary-value green">{avgScore}%</div>
      </div>
    </div>
  );
}
