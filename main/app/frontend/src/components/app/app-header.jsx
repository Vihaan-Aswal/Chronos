import { useNavigate } from "react-router-dom";
import Brand from "./brand.jsx";
import { signOut } from "./sign-out.js";

export default function AppHeader({
  tone = "paper",
  links = [],
  user = null,
  children,
  onSignOut,
}) {
  const navigate = useNavigate();

  return (
    <header
      className={`app-header ${tone === "forest" ? "app-header--forest" : ""}`.trim()}
    >
      <div className="wrap wrap-wide app-header-inner">
        <Brand tone={tone === "forest" ? "cream" : "ink"} />
        {links.length > 0 && (
          <nav className="app-nav" aria-label="Primary">
            {links.map((link) =>
              link.to ? (
                <Link
                  key={link.label}
                  to={link.to}
                  aria-current={link.current ? "page" : undefined}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  aria-current={link.current ? "page" : undefined}
                >
                  {link.label}
                </a>
              ),
            )}
          </nav>
        )}
        <div className="app-header-actions">
          {user?.email && <span className="app-user">{user.email}</span>}
          {children}
          {user && (
            <button
              type="button"
              className={`btn btn-sm btn-quiet${tone === "forest" ? "-cream" : ""}`}
              onClick={() => (onSignOut ? onSignOut() : signOut(navigate))}
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
