export default function AppFooter({ note = "Signals, not surveillance." }) {
  return (
    <footer className="app-footer">
      <div className="wrap wrap-wide app-footer-inner">
        <span className="app-footer-note">
          <i aria-hidden="true" />
          {note}
        </span>
        <span>© 2026 Chronos · Intelligence for Presence</span>
      </div>
    </footer>
  );
}
