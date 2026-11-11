import { Link } from "react-router-dom";
import AppHeader from "../components/app/app-header.jsx";
import AppFooter from "../components/app/app-footer.jsx";
import "../styles/app-system.css";

export default function NotFoundPage() {
  let user = null;
  try {
    const raw = sessionStorage.getItem("chronos_user");
    if (raw) user = JSON.parse(raw);
  } catch {
    user = null;
  }

  return (
    <div className="app page">
      <AppHeader user={user} links={[{ label: "Home", to: "/" }]} />
      <main className="page-main" id="main">
        <div className="wrap ready-page">
          <header className="ready-head">
            <h1 className="page-title">
              This page isn&rsquo;t <em>in the record.</em>
            </h1>
            <p className="page-lede">
              The address may be wrong, or the page may have moved. The room is
              still where you left it.
            </p>
          </header>
          <div className="row">
            <Link className="btn btn-ink" to="/">
              Back to the homepage
            </Link>
            {!user && (
              <Link className="btn btn-line" to="/signin">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
