import AppHeader from "./app-header.jsx";
import AppFooter from "./app-footer.jsx";

export default function ReadyLayout({ user, title, lede, children }) {
  return (
    <div className="app page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppHeader user={user} links={[{ label: "Home", to: "/" }]} />
      <main className="page-main" id="main">
        <div className="wrap ready-page">
          <header className="ready-head">
            <h1 className="page-title">{title}</h1>
            <p className="page-lede">{lede}</p>
          </header>
          {children}
        </div>
      </main>
      <AppFooter note="A face embedding verifies you. The video is not kept." />
    </div>
  );
}
