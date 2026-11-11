import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppHeader from "../components/app/app-header.jsx";
import AppFooter from "../components/app/app-footer.jsx";
import EmptyState from "../components/app/empty-state.jsx";
import SessionReport from "../components/session-report.jsx";
import { AlertIcon } from "../components/app/icons.jsx";
import { listRecords, loadRecord } from "../api/records.js";
import "../styles/app-system.css";
import "../styles/records.css";

function formatDuration(minutes) {
  const safe = Math.max(0, Number(minutes) || 0);
  const hrs = Math.floor(safe / 60);
  const mins = Math.floor(safe % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatWhen(value) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RecordsPage() {
  let user = null;
  try {
    const raw = sessionStorage.getItem("chronos_user");
    if (raw) user = JSON.parse(raw);
  } catch {
    user = null;
  }
  const role = sessionStorage.getItem("chronos_role");

  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState("loading");
  const [selected, setSelected] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [openError, setOpenError] = useState("");

  async function load() {
    if (!user?.id) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      const list = await listRecords(user.id);
      setRecords(list);
      setStatus("ready");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  useEffect(() => {
    if (role !== "teacher") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function openRecord(record) {
    setOpeningId(record.session_id);
    setOpenError("");
    try {
      const data = await loadRecord(record.session_id);
      setSelected(data);
    } catch (err) {
      console.error(err);
      setOpenError("The record could not be opened. Try again.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="app page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppHeader
        user={user}
        links={[
          { label: "Home", to: "/" },
          { label: "Records", to: "/records", current: true },
        ]}
      />

      <main className="page-main" id="main">
        <div className="wrap records-page">
          <header className="records-head">
            <h1>
              Session <em>records.</em>
            </h1>
            <p>
              A class you end leaves a record: the attention over time, the
              follow-up list, and the TPI. Save or export it from the record
              itself.
            </p>
          </header>

          {role !== "teacher" ? (
            <EmptyState
              title="Records are for teachers"
              action={
                <Link className="btn btn-line" to="/choose-role">
                  Choose a role
                </Link>
              }
            >
              Sign in as a teacher to read a session record. Students see their
              own signals during class, not a history.
            </EmptyState>
          ) : (
            <>
              {status === "loading" && (
                <p className="records-loading" role="status">
                  Loading records…
                </p>
              )}

              {status === "error" && (
                <div className="notice notice-flag records-error" role="alert">
                  <AlertIcon />
                  <div>
                    <p>The records could not load.</p>
                    <button type="button" className="text-btn" onClick={load}>
                      Try again
                    </button>
                  </div>
                </div>
              )}

              {status === "ready" && records.length === 0 && (
                <div className="records-empty">
                  <EmptyState title="No records yet">
                    End a class and save the record; it appears here with its
                    TPI and follow-up list.
                  </EmptyState>
                </div>
              )}

              {status === "ready" && records.length > 0 && (
                <ul className="records-list">
                  {records.map((record) => (
                    <li
                      className="record-item"
                      key={record.id || record.session_id}
                    >
                      <div>
                        <p className="record-date">
                          {formatWhen(record.start_time)}
                        </p>
                        <p className="record-session">
                          {record.session_id || "Session not named"}
                        </p>
                      </div>
                      <dl className="record-facts">
                        <div className="record-fact">
                          <dt>Learners</dt>
                          <dd>{record.total_students ?? "—"}</dd>
                        </div>
                        <div className="record-fact">
                          <dt>Duration</dt>
                          <dd>{formatDuration(record.duration_minutes)}</dd>
                        </div>
                        <div className="record-fact">
                          <dt>Mean</dt>
                          <dd>
                            {record.avg_engagement_score != null
                              ? `${Math.round(record.avg_engagement_score * 100)}%`
                              : "—"}
                          </dd>
                        </div>
                        <div className="record-fact">
                          <dt>TPI</dt>
                          <dd>
                            {record.tpi != null ? Math.round(record.tpi) : "—"}
                          </dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="btn btn-line btn-sm"
                        onClick={() => openRecord(record)}
                        disabled={openingId === record.session_id}
                      >
                        {openingId === record.session_id
                          ? "Opening"
                          : "Open record"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {openError && (
                <p className="notice notice-flag records-error" role="alert">
                  <AlertIcon />
                  <span>{openError}</span>
                </p>
              )}
            </>
          )}
        </div>
      </main>

      <AppFooter />

      {selected && (
        <SessionReport
          sessionData={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
