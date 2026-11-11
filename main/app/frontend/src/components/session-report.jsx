import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { AlertIcon, CheckIcon, DownloadIcon } from "./app/icons.jsx";

const CHART = {
  grid: "rgba(11, 26, 20, 0.09)",
  axis: "#56685c",
  ink: "#0b1a14",
  sage: "#4c6146",
  gold: "#8a6a2f",
  red: "#b3261e",
};

const tooltipStyle = {
  backgroundColor: "#fcf9f1",
  border: "1px solid rgba(11, 26, 20, 0.16)",
  borderRadius: 4,
  color: CHART.ink,
  fontSize: 12,
};
const tooltipLabelStyle = { color: CHART.ink, fontWeight: 700 };
const tooltipItemStyle = { color: "#56685c" };

function formatTime(minutes) {
  const safe = Math.max(0, Number(minutes) || 0);
  const hrs = Math.floor(safe / 60);
  const mins = Math.floor(safe % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(value) {
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

export default function SessionReport({ sessionData, onClose, onSave }) {
  const {
    sessionId,
    startTime,
    duration,
    avgScore,
    totalStudents,
    totalStudentsReal,
    totalStudentsSimulated,
    studentMeta = {},
    classContextMode,
    strictModeAtEnd,
    metricsTimeline = [],
    distribution,
    confusionHotspots = [],
    atRiskStudents = [],
    perStudentTimelines = {},
    tpi,
  } = sessionData;

  const [showPerStudent, setShowPerStudent] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (event) => {
      event.preventDefault();
      onClose?.();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  const distributionEffective = useMemo(() => {
    const hasData =
      (distribution?.attentive || 0) +
        (distribution?.distracted || 0) +
        (distribution?.disengaged || 0) >
      0;
    if (hasData) return distribution;

    const avgs = Object.entries(perStudentTimelines).map(([uid, pts]) => {
      if (!pts?.length) return { uid, avg: 0 };
      const avg = pts.reduce((s, p) => s + (p.score ?? 0), 0) / pts.length;
      return { uid, avg };
    });

    let attentive = 0;
    let distracted = 0;
    let away = 0;
    avgs.forEach(({ avg }) => {
      if (avg > 0.7) attentive += 1;
      else if (avg >= 0.4) distracted += 1;
      else away += 1;
    });

    return { attentive, distracted, disengaged: away };
  }, [distribution, perStudentTimelines]);

  const classMeanFromStudents = useMemo(() => {
    const pts = Object.values(perStudentTimelines);
    if (!pts.length) return avgScore || 0;

    const avgs = pts
      .filter((p) => p?.length)
      .map(
        (series) =>
          series.reduce((s, x) => s + (x.score ?? 0), 0) / series.length,
      );
    if (!avgs.length) return avgScore || 0;

    return avgs.reduce((a, b) => a + b, 0) / avgs.length;
  }, [perStudentTimelines, avgScore]);

  const relativeData = useMemo(() => {
    const mu = classMeanFromStudents || 0.01;
    const hi = Math.min(0.95, mu * 1.15);
    const lo = Math.max(0.05, mu * 0.7);

    const avgs = Object.entries(perStudentTimelines).map(([uid, series]) => {
      if (!series?.length) return { uid, avg: 0 };
      const avg =
        series.reduce((s, p) => s + (p.score ?? 0), 0) / series.length;
      return { uid, avg };
    });

    let above = 0;
    let mid = 0;
    let below = 0;
    avgs.forEach(({ avg }) => {
      if (avg >= hi) above += 1;
      else if (avg <= lo) below += 1;
      else mid += 1;
    });

    return {
      rows: [
        {
          name: `Strong (≥${(hi * 100).toFixed(0)}%)`,
          value: above,
          dot: "attentive",
        },
        { name: "Typical band", value: mid, dot: "distracted" },
        {
          name: `Below (≤${(lo * 100).toFixed(0)}%)`,
          value: below,
          dot: "away",
        },
      ],
      hi,
      lo,
    };
  }, [perStudentTimelines, classMeanFromStudents]);

  const hasSimLine = metricsTimeline?.some(
    (m) => m.avgScoreSimulated != null && !Number.isNaN(m.avgScoreSimulated),
  );
  const hasRealLine = metricsTimeline?.some(
    (m) => m.avgScoreReal != null && !Number.isNaN(m.avgScoreReal),
  );

  const distributionTotal =
    (distributionEffective.attentive || 0) +
    (distributionEffective.distracted || 0) +
    (distributionEffective.disengaged || 0);

  const peakConfusion = confusionHotspots.length
    ? Math.max(...confusionHotspots.map((h) => Number(h.percentage) || 0))
    : 0;

  const meanPercent = Math.round((classMeanFromStudents || 0) * 100);
  const simulated = totalStudentsSimulated || 0;
  const live = totalStudentsReal ?? Math.max(0, (totalStudents || 0) - simulated);
  const relativeRows = relativeData.rows.filter((r) => r.value > 0);

  async function handleSave() {
    if (!onSave || saveState === "saving") return;
    setSaveState("saving");
    setSaveError("");
    try {
      await onSave();
      setSaveState("saved");
    } catch (err) {
      console.error("Save record failed:", err);
      setSaveError(
        "The record did not save. Check the connection and try again.",
      );
      setSaveState("error");
    }
  }

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.text("Session record", 20, y);
    y += 12;
    doc.setFontSize(10);
    doc.text(`Session: ${sessionId || "—"}`, 20, y);
    y += 6;
    doc.text(`Started: ${formatDate(startTime)}`, 20, y);
    y += 10;
    doc.setFontSize(11);

    doc.text(
      `Duration: ${formatTime(duration)} | Mean engagement: ${meanPercent}% | Learners: ${totalStudents}`,
      20,
      y,
    );
    y += 8;

    if (tpi != null) {
      doc.text(`TPI: ${Math.round(tpi)}/100`, 20, y);
      y += 6;
      doc.setFontSize(9);
      doc.text("TPI = 60% mean engagement + 40% attention retention.", 20, y);
      doc.text("It is a post-class index, not a student grade.", 20, y + 4);
      y += 12;
      doc.setFontSize(11);
    }

    doc.text(
      `Attentive: ${distributionEffective.attentive} | Distracted: ${distributionEffective.distracted} | Away: ${distributionEffective.disengaged}`,
      20,
      y,
    );
    y += 12;

    if (atRiskStudents.length > 0) {
      doc.setFontSize(14);
      doc.text("Follow-up", 20, y);
      y += 8;
      doc.setFontSize(10);
      atRiskStudents.forEach((s) => {
        doc.text(
          `- ${s.userId?.slice(0, 16) || "Learner"} | Avg: ${(s.avgScore * 100).toFixed(0)}% | ${s.reason}`,
          25,
          y,
        );
        y += 6;
      });
    }

    doc.save(`session-record-${sessionId || "record"}.pdf`);
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="app rec"
      aria-labelledby="rec-title"
    >
      <header className="rec-bar">
        <div className="wrap wrap-wide rec-bar-inner">
          <div>
            <h1 className="rec-title" id="rec-title">
              Session record
            </h1>
            <div className="rec-meta">
              <span>{sessionId || "Session not named"}</span>
              <span>{formatDate(startTime)}</span>
              <span>{formatTime(duration)}</span>
              {classContextMode && <span>{classContextMode} context</span>}
              {strictModeAtEnd != null && (
                <span>{strictModeAtEnd ? "Strict" : "Normal"} tab</span>
              )}
            </div>
          </div>
          <div className="rec-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleExportPDF}
            >
              <DownloadIcon />
              Export PDF
            </button>
            {onSave && (
              <button
                type="button"
                className="btn btn-cream btn-sm"
                onClick={handleSave}
                disabled={saveState === "saving" || saveState === "saved"}
              >
                <CheckIcon />
                {saveState === "saving"
                  ? "Saving"
                  : saveState === "saved"
                    ? "Saved"
                    : "Save record"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-quiet-cream btn-sm"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </header>

      <div className="wrap wrap-wide rec-body">
        <p className="rec-lede">
          A <strong>{formatTime(duration)}</strong> class with{" "}
          <strong>{totalStudents}</strong>{" "}
          {totalStudents === 1 ? "learner" : "learners"}. The mean engagement
          was <strong>{meanPercent}%</strong>.
          {simulated > 0 && (
            <>
              {" "}
              {simulated} simulated {simulated === 1 ? "learner is" : "learners are"}{" "}
              labelled as demo data.
            </>
          )}
        </p>

        <dl className="rec-facts">
          <div className="rec-fact">
            <dt>TPI</dt>
            <dd>
              {tpi != null ? (
                <>
                  {Math.round(tpi)}
                  <small>/100</small>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="rec-fact">
            <dt>Mean engagement</dt>
            <dd>{meanPercent}%</dd>
          </div>
          <div className="rec-fact">
            <dt>Learners</dt>
            <dd>
              {totalStudents}
              <small>
                {live} live
                {simulated > 0 ? ` · ${simulated} simulated` : ""}
              </small>
            </dd>
          </div>
          <div className="rec-fact">
            <dt>Duration</dt>
            <dd>{formatTime(duration)}</dd>
          </div>
        </dl>

        <p className="meta rec-note">
          TPI is a post-class index: 60% mean engagement + 40% attention
          retention. It is not a student grade.
          {tpi == null &&
            " This session did not have enough timeline snapshots to compute it."}
        </p>

        {saveState === "saved" && (
          <p className="notice notice-ok rec-save-note" role="status">
            <CheckIcon />
            <span>Record saved. It is available under Session records.</span>
          </p>
        )}
        {saveState === "error" && (
          <p className="notice notice-flag rec-save-note" role="alert">
            <AlertIcon />
            <span>{saveError}</span>
          </p>
        )}

        <section className="rec-section" aria-labelledby="rec-timeline">
          <div className="rec-section-head">
            <h2 id="rec-timeline">Attention over time</h2>
            <p>
              The combined line includes simulated learners when the simulator
              was on. Live and simulated cohorts are split when both exist.
            </p>
          </div>

          {metricsTimeline.length > 0 ? (
            <div className="rec-figure">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={metricsTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                  <XAxis
                    dataKey="time"
                    stroke={CHART.axis}
                    tick={{ fontSize: 11, fill: CHART.axis }}
                  />
                  <YAxis
                    stroke={CHART.axis}
                    tick={{ fontSize: 11, fill: CHART.axis }}
                    domain={[0, 1]}
                    ticks={[0, 0.25, 0.5, 0.75, 1]}
                    tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      if (value == null || Number.isNaN(value))
                        return ["—", name];
                      return [`${(Number(value) * 100).toFixed(0)}%`, name];
                    }}
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 11,
                      color: CHART.axis,
                      paddingTop: 8,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgScore"
                    name="All learners"
                    stroke={CHART.ink}
                    strokeWidth={2.4}
                    dot={{ r: 2.4, fill: CHART.ink }}
                    activeDot={{ r: 4 }}
                  />
                  {hasRealLine && (
                    <Line
                      type="monotone"
                      dataKey="avgScoreReal"
                      name="Live learners"
                      stroke={CHART.sage}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  )}
                  {hasSimLine && (
                    <Line
                      type="monotone"
                      dataKey="avgScoreSimulated"
                      name="Simulated"
                      stroke={CHART.gold}
                      strokeWidth={2}
                      strokeDasharray="7 4"
                      dot={false}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="notice notice-quiet">
              <AlertIcon />
              <span>Timeline data is not available for this session.</span>
            </p>
          )}
        </section>

        <div className="rec-grid2">
          <section className="rec-section" aria-labelledby="rec-distribution">
            <div className="rec-section-head">
              <h2 id="rec-distribution">Attention distribution</h2>
              <p>
                Attentive above 70%, distracted between 40% and 70%, away below
                40%.
              </p>
            </div>

            {distributionTotal > 0 ? (
              <>
                <div
                  className="rec-band"
                  role="img"
                  aria-label={`Attentive ${distributionEffective.attentive}, distracted ${distributionEffective.distracted}, away ${distributionEffective.disengaged}`}
                >
                  {distributionEffective.attentive > 0 && (
                    <span
                      className="rec-band-seg is-attentive"
                      style={{
                        width: `${(distributionEffective.attentive / distributionTotal) * 100}%`,
                      }}
                    />
                  )}
                  {distributionEffective.distracted > 0 && (
                    <span
                      className="rec-band-seg is-distracted"
                      style={{
                        width: `${(distributionEffective.distracted / distributionTotal) * 100}%`,
                      }}
                    />
                  )}
                  {distributionEffective.disengaged > 0 && (
                    <span
                      className="rec-band-seg is-away"
                      style={{
                        width: `${(distributionEffective.disengaged / distributionTotal) * 100}%`,
                      }}
                    />
                  )}
                </div>
                <div className="rec-band-legend">
                  <span className="rec-band-item">
                    <i className="dot dot-attentive" /> Attentive{" "}
                    <b>{distributionEffective.attentive}</b>
                  </span>
                  <span className="rec-band-item">
                    <i className="dot dot-distracted" /> Distracted{" "}
                    <b>{distributionEffective.distracted}</b>
                  </span>
                  <span className="rec-band-item">
                    <i className="dot dot-away" /> Away{" "}
                    <b>{distributionEffective.disengaged}</b>
                  </span>
                </div>
              </>
            ) : (
              <p className="notice notice-quiet">
                <AlertIcon />
                <span>No distribution data for this session.</span>
              </p>
            )}
          </section>

          <section className="rec-section" aria-labelledby="rec-compare">
            <div className="rec-section-head">
              <h2 id="rec-compare">Compared with the class mean</h2>
              <p>
                Strong is at least {(relativeData.hi * 100).toFixed(0)}%; below
                is at most {(relativeData.lo * 100).toFixed(0)}%.
              </p>
            </div>

            {relativeRows.length > 0 ? (
              <div className="rec-compare">
                {relativeRows.map((row) => (
                  <div className="rec-compare-row" key={row.name}>
                    <i className={`dot dot-${row.dot}`} aria-hidden="true" />
                    <span>{row.name}</span>
                    <b>{row.value}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="notice notice-quiet">
                <AlertIcon />
                <span>
                  Relative comparison needs more learner data.
                </span>
              </p>
            )}
          </section>
        </div>

        <section className="rec-section" aria-labelledby="rec-confusion">
          <div className="rec-section-head">
            <h2 id="rec-confusion">Confusion moments</h2>
            <p>
              Snapshots where at least 20% of learners showed confusion signals.
            </p>
          </div>

          {confusionHotspots.length === 0 ? (
            <p className="notice notice-ok">
              <CheckIcon />
              <span>No significant confusion clusters in this class.</span>
            </p>
          ) : (
            <>
              <div className="rec-figure">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={confusionHotspots}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                    <XAxis
                      dataKey="time"
                      stroke={CHART.axis}
                      tick={{ fontSize: 11, fill: CHART.axis }}
                    />
                    <YAxis
                      stroke={CHART.axis}
                      tick={{ fontSize: 11, fill: CHART.axis }}
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                      formatter={(value) => [`${value}%`, "Confusion"]}
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                    />
                    <Bar
                      dataKey="percentage"
                      fill={CHART.gold}
                      name="Confusion"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="notice notice-quiet rec-note">
                <AlertIcon />
                <span>
                  Peak confusion reached {peakConfusion.toFixed(0)}% of learners.
                </span>
              </p>
            </>
          )}
        </section>

        {Object.keys(perStudentTimelines).length > 0 && (
          <section className="rec-section" aria-labelledby="rec-students">
            <div className="rec-section-head">
              <h2 id="rec-students">Per-student attention</h2>
              <p>
                The expanded view is scroll-contained and lists live learners
                first. Simulated learners are labelled.
              </p>
            </div>

            <button
              type="button"
              className="rec-detail-toggle"
              onClick={() => setShowPerStudent((prev) => !prev)}
              aria-expanded={showPerStudent}
              aria-controls="rec-student-grid"
            >
              {showPerStudent ? "Hide details" : "Show details"}
              <span aria-hidden="true">{showPerStudent ? "−" : "+"}</span>
            </button>

            {showPerStudent && (
              <div id="rec-student-grid" className="rec-students">
                {Object.entries(perStudentTimelines)
                  .sort(([a], [b]) => {
                    const simA = studentMeta[a]?.isSimulated ? 1 : 0;
                    const simB = studentMeta[b]?.isSimulated ? 1 : 0;
                    return simA - simB;
                  })
                  .map(([userId, data]) => {
                    const sim = studentMeta[userId]?.isSimulated;
                    const label =
                      studentMeta[userId]?.displayName || userId.slice(0, 12);
                    return (
                      <article key={userId} className="rec-student">
                        <div className="rec-student-head">
                          <span className="rec-student-name" title={label}>
                            {label}
                          </span>
                          {sim && <span className="badge">Simulated</span>}
                        </div>
                        <ResponsiveContainer width="100%" height={140}>
                          <LineChart data={data}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={CHART.grid}
                            />
                            <XAxis
                              dataKey="time"
                              stroke={CHART.axis}
                              tick={{ fontSize: 10, fill: CHART.axis }}
                            />
                            <YAxis
                              domain={[0, 1]}
                              ticks={[0, 0.5, 1]}
                              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                              tick={{ fontSize: 10, fill: CHART.axis }}
                              stroke={CHART.axis}
                              width={34}
                            />
                            <Tooltip
                              formatter={(v) => [
                                `${(Number(v) * 100).toFixed(0)}%`,
                                "Engagement",
                              ]}
                              contentStyle={tooltipStyle}
                              labelStyle={tooltipLabelStyle}
                              itemStyle={tooltipItemStyle}
                            />
                            <Line
                              type="monotone"
                              dataKey="score"
                              stroke={CHART.sage}
                              strokeWidth={2}
                              dot={{ r: 1.8 }}
                              activeDot={{ r: 3.5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </article>
                    );
                  })}
              </div>
            )}
          </section>
        )}

        <section className="rec-section" aria-labelledby="rec-followup">
          <div className="rec-section-head">
            <h2 id="rec-followup">Follow-up</h2>
            <p>
              Learners with a mean below 35%, at least 2 strikes, or at least 3
              identity issues.
            </p>
          </div>

          {atRiskStudents.length === 0 ? (
            <p className="notice notice-ok">
              <CheckIcon />
              <span>No learner crossed the follow-up thresholds.</span>
            </p>
          ) : (
            <>
              <div className="rec-followup">
                {atRiskStudents.map((student, index) => {
                  const severity =
                    student.strikes >= 3 || student.identityIssues >= 2
                      ? "High"
                      : student.avgScore < 0.3
                        ? "Medium"
                        : "Low";
                  return (
                    <article
                      className="rec-followup-row"
                      key={`${student.userId || "learner"}-${index}`}
                    >
                      <div>
                        <p className="rec-followup-name">
                          {student.userId?.slice(0, 16) || "Unknown learner"}
                        </p>
                        <p className="rec-followup-reason">
                          {student.reason || "Crossed a follow-up threshold."}
                        </p>
                      </div>
                      <div className="rec-followup-facts">
                        <span>
                          Avg{" "}
                          <b>{(student.avgScore * 100).toFixed(0)}%</b>
                        </span>
                        <span>
                          Strikes <b>{student.strikes || 0}</b>
                        </span>
                        <span>
                          Identity <b>{student.identityIssues || 0}</b>
                        </span>
                        <span
                          className={`badge ${severity === "High" ? "badge-flag" : severity === "Medium" ? "badge-distracted" : ""}`.trim()}
                        >
                          {severity}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <p className="notice notice-quiet rec-note">
                <AlertIcon />
                <span>
                  Follow up individually with these learners and check support
                  actions in the next class.
                </span>
              </p>
            </>
          )}
        </section>

        <footer className="rec-footer">
          <p className="rec-footer-note">
            A record, not a recording. No video frames, audio, page content, or
            grades are kept. TPI is a post-class index, not a student grade.
          </p>
          <button
            type="button"
            className="btn btn-line btn-sm"
            onClick={onClose}
          >
            Close record
          </button>
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}
