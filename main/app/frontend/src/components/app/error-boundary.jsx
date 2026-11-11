import { Component } from "react";
import "../../styles/app-system.css";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Chronos route error:", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="app page">
        <main className="page-main" id="main">
          <div className="wrap ready-page">
            <header className="ready-head">
              <h1 className="page-title">
                Something in this room <em>failed to render.</em>
              </h1>
              <p className="page-lede">
                The page stopped before it could draw. Reload it, or go back to
                the homepage. Nothing in your session was changed by this.
              </p>
            </header>
            <div className="row">
              <button
                type="button"
                className="btn btn-ink"
                onClick={() => window.location.reload()}
              >
                Reload the page
              </button>
              <a className="btn btn-line" href="/">
                Back to the homepage
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }
}
