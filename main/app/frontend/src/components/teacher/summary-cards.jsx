export default function SummaryCards({
  actionRequiredCount = 0,
  monitorCount = 0,
  identityIssueCount = 0,
  totalStudents = 0,
}) {
  return (
    <div className="td-summary-grid" aria-label="Summary metrics">
      <div className="td-summary-card">
        <div className="td-summary-label">Action Required</div>
        <div className="td-summary-value danger">{actionRequiredCount}</div>
      </div>

      <div className="td-summary-card">
        <div className="td-summary-label">Monitor</div>
        <div className="td-summary-value warn">{monitorCount}</div>
      </div>

      <div className="td-summary-card">
        <div className="td-summary-label">Identity Concerns</div>
        <div className="td-summary-value danger">{identityIssueCount}</div>
      </div>

      <div className="td-summary-card">
        <div className="td-summary-label">Active Roster</div>
        <div className="td-summary-value green">{totalStudents}</div>
      </div>
    </div>
  );
}
