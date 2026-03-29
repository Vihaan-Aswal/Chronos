import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { jsPDF } from "jspdf";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

const EASE = [0.16, 1, 0.3, 1];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.08 },
  },
};

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE },
  },
};

const MotionDiv = motion.div;
const MotionSection = motion.section;
const MotionArticle = motion.article;

function useCountUp(target, { duration = 900, decimals = 0 } = {}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const safeTarget = Number.isFinite(target) ? target : 0;
    if (safeTarget === 0) {
      const resetFrame = requestAnimationFrame(() => setValue(0));
      return () => cancelAnimationFrame(resetFrame);
    }

    let frameId = 0;
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = safeTarget * eased;
      const precision = 10 ** decimals;
      setValue(Math.round(next * precision) / precision);
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [decimals, duration, target]);

  return value;
}

function renderPiePercentLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}) {
  if (percent == null || percent <= 0) return null;
  const radius = (innerRadius + outerRadius) / 2;
  const rad = (-midAngle * Math.PI) / 180;
  const x = cx + radius * Math.cos(rad);
  const y = cy + radius * Math.sin(rad);

  return (
    <text
      x={x}
      y={y}
      fill="#d8e6f7"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function SessionReport({ sessionData, onClose, onSave }) {
  const {
    duration,
    avgScore,
    totalStudents,
    totalStudentsReal,
    totalStudentsSimulated,
    studentMeta = {},
    classContextMode,
    strictModeAtEnd,
    metricsTimeline,
    distribution,
    confusionHotspots = [],
    atRiskStudents = [],
    perStudentTimelines = {},
    tpi,
  } = sessionData;

  const [showPerStudent, setShowPerStudent] = useState(false);

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
    let disengaged = 0;
    avgs.forEach(({ avg }) => {
      if (avg > 0.7) attentive += 1;
      else if (avg >= 0.4) distracted += 1;
      else disengaged += 1;
    });

    return { attentive, distracted, disengaged };
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

  const relativePieData = useMemo(() => {
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
          name: `Strong (>=${(hi * 100).toFixed(0)}%)`,
          value: above,
          color: "#37d39a",
        },
        { name: "Typical band", value: mid, color: "#dcc492" },
        {
          name: `Below (<=${(lo * 100).toFixed(0)}%)`,
          value: below,
          color: "#ff6f7d",
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

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.text("Session Report", 20, y);
    y += 15;
    doc.setFontSize(11);

    const durStr =
      duration >= 60
        ? `${Math.floor(duration / 60)}h ${Math.floor(duration % 60)}m`
        : `${Math.floor(duration)}m`;

    doc.text(
      `Duration: ${durStr} | Avg Engagement: ${(avgScore * 100).toFixed(0)}% | Students: ${totalStudents}`,
      20,
      y,
    );
    y += 10;

    if (tpi != null) {
      doc.text(`Teacher Performance Index (TPI): ${tpi}/100`, 20, y);
      y += 10;
    }

    doc.text(
      `Attentive: ${distributionEffective.attentive} | Distracted: ${distributionEffective.distracted} | Disengaged: ${distributionEffective.disengaged}`,
      20,
      y,
    );
    y += 15;

    if (atRiskStudents.length > 0) {
      doc.setFontSize(14);
      doc.text("At-Risk Students", 20, y);
      y += 8;
      doc.setFontSize(10);
      atRiskStudents.forEach((s) => {
        doc.text(
          `- ${s.userId?.slice(0, 16)}... | Avg: ${(s.avgScore * 100).toFixed(0)}% | ${s.reason}`,
          25,
          y,
        );
        y += 6;
      });
      y += 5;
    }

    doc.save(`session-report-${sessionData.sessionId || "report"}.pdf`);
  };

  const COLORS = {
    attentive: "#37d39a",
    distracted: "#dcc492",
    disengaged: "#ff6f7d",
  };

  const pieData = [
    {
      name: "Attentive",
      value: distributionEffective.attentive,
      color: COLORS.attentive,
    },
    {
      name: "Distracted",
      value: distributionEffective.distracted,
      color: COLORS.distracted,
    },
    {
      name: "Disengaged",
      value: distributionEffective.disengaged,
      color: COLORS.disengaged,
    },
  ];
  const pieDataNonZero = pieData.filter((d) => d.value > 0);

  const formatTime = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const getScoreColor = (score) => {
    if (score >= 0.7) return "text-[#37d39a]";
    if (score >= 0.4) return "text-[#f7d8a0]";
    return "text-[#ff9ea7]";
  };

  const getScoreLabel = (score) => {
    if (score >= 0.7) return "Excellent";
    if (score >= 0.4) return "Balanced";
    return "Needs Support";
  };

  const animatedDuration = useCountUp(Math.max(0, Math.round(duration || 0)));
  const animatedAvgPercent = useCountUp(Math.max(0, (avgScore || 0) * 100));
  const animatedLearners = useCountUp(
    Math.max(0, Math.round(totalStudents || 0)),
  );
  const animatedTpi = useCountUp(Math.max(0, Math.round(tpi ?? 0)));

  const getStudentColor = (idx) => {
    const hue = Math.round((idx * 137.5) % 360);
    return `hsl(${hue} 74% 64%)`;
  };

  const relativeRows = relativePieData.rows.filter((r) => r.value > 0);
  const peakConfusion = confusionHotspots.length
    ? Math.max(...confusionHotspots.map((h) => Number(h.percentage) || 0))
    : 0;
  const confusionToneClass =
    peakConfusion >= 70
      ? "border-[#ff6f7d]/45 bg-[#ff6f7d]/12 text-[#ffd5da]"
      : peakConfusion >= 45
        ? "border-[#dcc492]/45 bg-[#dcc492]/14 text-[#fff0cf]"
        : "border-[#7eb2ff]/40 bg-[#7eb2ff]/10 text-[#d6e8ff]";

  const surfaceCardClass =
    "rounded-2xl border border-[rgba(211,228,248,0.14)] bg-[rgba(7,25,40,0.78)] p-4 sm:p-5 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_28px_rgba(0,0,0,0.36)]";
  const sectionTitleClass =
    "text-base sm:text-lg font-semibold text-[#e6eef8] tracking-tight";
  const sectionBodyClass = "text-xs sm:text-sm text-[#9fb3c9]";
  const chartTooltipStyle = {
    backgroundColor: "rgba(4, 20, 33, 0.96)",
    border: "1px solid rgba(211, 228, 248, 0.2)",
    borderRadius: "12px",
    boxShadow: "0 16px 28px rgba(0, 0, 0, 0.45)",
    color: "#d3e4f8",
    fontSize: "12px",
  };
  const chartTooltipLabelStyle = { color: "#fff0cf", fontWeight: 700 };
  const chartTooltipItemStyle = { color: "#d3e4f8" };
  const chartGridStroke = "rgba(211, 228, 248, 0.09)";
  const chartAxisStroke = "#86a0b8";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#020e18]">
      <MotionDiv
        role="dialog"
        aria-modal="true"
        aria-label="Post-class analytics"
        initial={{ opacity: 0, y: 24, scale: 0.985 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { duration: 0.42, ease: EASE },
        }}
        className="relative h-full w-full overflow-hidden bg-[linear-gradient(155deg,rgba(8,26,40,0.985),rgba(3,14,24,0.99))]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(220,196,146,0.12),transparent_34%),radial-gradient(circle_at_90%_8%,rgba(126,178,255,0.14),transparent_30%),radial-gradient(circle_at_60%_100%,rgba(168,146,255,0.1),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(211,228,248,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(211,228,248,0.02)_1px,transparent_1px)] [background-size:30px_30px]" />

        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <div className="border-b border-[rgba(211,228,248,0.12)] bg-[linear-gradient(180deg,rgba(6,22,35,0.95),rgba(5,19,30,0.88))] px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight text-[#fff6e1] sm:text-[30px]">
                  Post-class analytics
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-[#afc3d9]">
                  Class mean from learner series is{" "}
                  {(classMeanFromStudents * 100).toFixed(0)}%. Metrics below
                  blend live and simulated cohorts when simulation mode is
                  active.
                </p>
              </div>
              <div className="rounded-full border border-[rgba(220,196,146,0.34)] bg-[rgba(220,196,146,0.15)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#fff0cf]">
                Teacher Insights
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {classContextMode && (
                <span className="rounded-full border border-[rgba(211,228,248,0.2)] bg-[rgba(255,255,255,0.06)] px-3 py-1 text-[11px] font-semibold text-[#d5e6fa]">
                  Context: {classContextMode}
                </span>
              )}
              {strictModeAtEnd != null && (
                <span className="rounded-full border border-[rgba(211,228,248,0.2)] bg-[rgba(255,255,255,0.06)] px-3 py-1 text-[11px] font-semibold text-[#d5e6fa]">
                  Tab Mode: {strictModeAtEnd ? "Strict" : "Normal"}
                </span>
              )}
              {(totalStudentsSimulated ?? 0) > 0 && (
                <span className="rounded-full border border-[rgba(55,211,154,0.36)] bg-[rgba(55,211,154,0.13)] px-3 py-1 text-[11px] font-semibold text-[#ccf8e9]">
                  Simulated learners: {totalStudentsSimulated}
                </span>
              )}
            </div>
          </div>

          <MotionDiv
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-5 sm:px-7"
          >
            <MotionSection
              variants={sectionVariants}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
            >
              <MotionArticle
                whileHover={{
                  y: -2,
                  transition: { duration: 0.18, ease: EASE },
                }}
                className={`${surfaceCardClass} flex flex-col justify-center`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99adc2]">
                  Duration
                </div>
                <div className="mt-1 text-2xl font-bold text-[#e8f0fa]">
                  {formatTime(animatedDuration)}
                </div>
              </MotionArticle>

              <MotionArticle
                whileHover={{
                  y: -2,
                  transition: { duration: 0.18, ease: EASE },
                }}
                className={`${surfaceCardClass} flex flex-col justify-center`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99adc2]">
                  Avg engagement
                </div>
                <div
                  className={`mt-1 text-2xl font-bold ${getScoreColor(avgScore)}`}
                >
                  {Math.max(0, Math.min(100, Math.round(animatedAvgPercent)))}%
                </div>
                <div
                  className={`mt-1 text-xs font-semibold ${getScoreColor(avgScore)}`}
                >
                  {getScoreLabel(avgScore)}
                </div>
              </MotionArticle>

              <MotionArticle
                whileHover={{
                  y: -2,
                  transition: { duration: 0.18, ease: EASE },
                }}
                className={`${surfaceCardClass} flex flex-col justify-center`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99adc2]">
                  Learners
                </div>
                <div className="mt-1 text-2xl font-bold text-[#dce8f6]">
                  {Math.round(animatedLearners)}
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-[#9fb3c9]">
                  {totalStudentsReal != null && (
                    <div>Live / enrolled: {totalStudentsReal}</div>
                  )}
                  {(totalStudentsSimulated ?? 0) > 0 && (
                    <div>Simulated (demo): {totalStudentsSimulated}</div>
                  )}
                </div>
              </MotionArticle>

              <MotionArticle
                whileHover={{
                  y: -2,
                  transition: { duration: 0.18, ease: EASE },
                }}
                className={`${surfaceCardClass} flex flex-col justify-center`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99adc2]">
                  TPI
                </div>
                {tpi != null ? (
                  <>
                    <div className="mt-1 text-2xl font-bold text-[#fff0cf]">
                      {Math.round(animatedTpi)}
                      <span className="ml-1 text-base text-[#dcc492]">
                        /100
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-[#9fb3c9]">
                      TPI = (Avg engagement x 60%) + (Attention retention x 40%)
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-1 text-xl font-semibold text-[#b7c9dd]">
                      Unavailable
                    </div>
                    <div className="mt-2 text-xs text-[#8ea3ba]">
                      Needs more timeline snapshots to compute reliably.
                    </div>
                  </>
                )}
              </MotionArticle>
            </MotionSection>

            {metricsTimeline && metricsTimeline.length > 0 && (
              <MotionSection
                variants={sectionVariants}
                className={surfaceCardClass}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className={sectionTitleClass}>
                      Class attention heatmap
                    </h3>
                    <p className={`${sectionBodyClass} mt-1`}>
                      Each bar represents a snapshot over time with intensity
                      mapped to engagement score.
                    </p>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto pb-1">
                  <div className="inline-flex min-w-full gap-1.5">
                    {metricsTimeline.map((m, idx) => {
                      const s = Number(m.avgScore) || 0;
                      const color =
                        s >= 0.7 ? "#37d39a" : s >= 0.4 ? "#dcc492" : "#ff6f7d";
                      const parts = [`All: ${(s * 100).toFixed(0)}%`];
                      if (m.avgScoreReal != null)
                        parts.push(
                          `Live: ${(m.avgScoreReal * 100).toFixed(0)}%`,
                        );
                      if (m.avgScoreSimulated != null)
                        parts.push(
                          `Sim: ${(m.avgScoreSimulated * 100).toFixed(0)}%`,
                        );
                      return (
                        <div
                          key={idx}
                          aria-label={`${m.time} | ${parts.join(" | ")}`}
                          className="h-12 w-3.5 flex-none rounded-md border border-black/10 transition-transform duration-200 hover:-translate-y-0.5"
                          style={{
                            backgroundColor: color,
                            opacity: 0.25 + s * 0.75,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="mt-2 flex justify-between text-[11px] text-[#91a8bf]">
                  <span>Start</span>
                  <span>End</span>
                </div>
              </MotionSection>
            )}

            <MotionSection
              variants={sectionVariants}
              className={surfaceCardClass}
            >
              <h3 className={sectionTitleClass}>Engagement timeline</h3>
              <p className={`${sectionBodyClass} mt-1`}>
                Combined average includes simulated learners when simulation was
                active. Split lines separate live and simulated cohorts.
              </p>

              {metricsTimeline && metricsTimeline.length > 0 ? (
                <div className="mt-4">
                  <ResponsiveContainer width="100%" height={290}>
                    <LineChart data={metricsTimeline}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={chartGridStroke}
                      />
                      <XAxis
                        dataKey="time"
                        stroke={chartAxisStroke}
                        tick={{ fontSize: 11, fill: "#91a8bf" }}
                      />
                      <YAxis
                        stroke={chartAxisStroke}
                        tick={{ fontSize: 11, fill: "#91a8bf" }}
                        domain={[0, 1]}
                        ticks={[0, 0.25, 0.5, 0.75, 1]}
                        tickFormatter={(value) =>
                          `${(value * 100).toFixed(0)}%`
                        }
                      />
                      <Tooltip
                        formatter={(value, name) => {
                          if (value == null || Number.isNaN(value))
                            return ["-", name];
                          return [`${(Number(value) * 100).toFixed(0)}%`, name];
                        }}
                        contentStyle={chartTooltipStyle}
                        labelStyle={chartTooltipLabelStyle}
                        itemStyle={chartTooltipItemStyle}
                      />
                      <Legend
                        wrapperStyle={{
                          fontSize: 12,
                          color: "#bdd0e4",
                          paddingTop: 8,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgScore"
                        name="All learners"
                        stroke="#7eb2ff"
                        strokeWidth={2.6}
                        dot={{ r: 2.8, fill: "#7eb2ff" }}
                        activeDot={{ r: 5 }}
                      />
                      {hasRealLine && (
                        <Line
                          type="monotone"
                          dataKey="avgScoreReal"
                          name="Live learners"
                          stroke="#37d39a"
                          strokeWidth={2.2}
                          dot={false}
                          connectNulls
                        />
                      )}
                      {hasSimLine && (
                        <Line
                          type="monotone"
                          dataKey="avgScoreSimulated"
                          name="Simulated"
                          stroke="#d7b97f"
                          strokeWidth={2.2}
                          strokeDasharray="7 4"
                          dot={false}
                          connectNulls
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-[rgba(211,228,248,0.14)] bg-[rgba(255,255,255,0.04)] px-4 py-8 text-center text-sm text-[#a6bbd0]">
                  Timeline data is not available for this session.
                </div>
              )}
            </MotionSection>

            <MotionSection
              variants={sectionVariants}
              className="grid grid-cols-1 gap-6 lg:grid-cols-2"
            >
              <article className={surfaceCardClass}>
                <h3 className={sectionTitleClass}>Attention distribution</h3>
                <p className={`${sectionBodyClass} mt-1`}>
                  Bands: attentive above 70%, distracted between 40% and 70%,
                  disengaged below 40%.
                </p>

                {pieDataNonZero.length === 0 ? (
                  <div className="mt-4 grid h-[260px] place-items-center rounded-xl border border-[rgba(211,228,248,0.14)] bg-[rgba(255,255,255,0.04)] text-sm text-[#a6bbd0]">
                    No distribution data yet.
                  </div>
                ) : (
                  <div className="mt-4">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={pieDataNonZero}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={renderPiePercentLabel}
                          outerRadius={88}
                          dataKey="value"
                        >
                          {pieDataNonZero.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-[#bfd2e4]">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: COLORS.attentive }}
                    />
                    <span>Attentive</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: COLORS.distracted }}
                    />
                    <span>Distracted</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: COLORS.disengaged }}
                    />
                    <span>Disengaged</span>
                  </div>
                </div>
              </article>

              <article className={surfaceCardClass}>
                <h3 className={sectionTitleClass}>Vs class average</h3>
                <p className={`${sectionBodyClass} mt-1`}>
                  Strong is at least {(relativePieData.hi * 100).toFixed(0)}%.
                  Below is at most {(relativePieData.lo * 100).toFixed(0)}%.
                </p>

                {relativeRows.length === 0 ? (
                  <div className="mt-4 grid h-[260px] place-items-center rounded-xl border border-[rgba(211,228,248,0.14)] bg-[rgba(255,255,255,0.04)] text-sm text-[#a6bbd0]">
                    Relative comparison needs more learner data.
                  </div>
                ) : (
                  <div className="mt-4">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={relativeRows}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={renderPiePercentLabel}
                          outerRadius={88}
                          dataKey="value"
                        >
                          {relativeRows.map((entry, index) => (
                            <Cell key={`rel-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {relativeRows.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-[#bfd2e4]">
                    {relativeRows.map((row) => (
                      <div key={row.name} className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        <span>{row.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </MotionSection>

            <MotionSection
              variants={sectionVariants}
              className={surfaceCardClass}
            >
              <h3 className={sectionTitleClass}>
                Confusion hotspots over time
              </h3>
              <p className={`${sectionBodyClass} mt-1`}>
                Snapshot moments where at least 20% of learners showed confusion
                signals.
              </p>

              {confusionHotspots.length === 0 ? (
                <div className="mt-4 rounded-xl border border-[rgba(55,211,154,0.3)] bg-[rgba(55,211,154,0.12)] px-4 py-8 text-center text-sm text-[#ccf8e9]">
                  No significant confusion clusters were detected in this class.
                </div>
              ) : (
                <>
                  <div className="mt-4">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={confusionHotspots}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={chartGridStroke}
                        />
                        <XAxis
                          dataKey="time"
                          stroke={chartAxisStroke}
                          tick={{ fontSize: 11, fill: "#91a8bf" }}
                        />
                        <YAxis
                          stroke={chartAxisStroke}
                          tick={{ fontSize: 11, fill: "#91a8bf" }}
                          domain={[0, 100]}
                          tickFormatter={(value) => `${value}%`}
                        />
                        <Tooltip
                          formatter={(value) => [`${value}%`, "Confusion"]}
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                        />
                        <Bar
                          dataKey="percentage"
                          fill="#d7b97f"
                          name="Confusion %"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div
                    className={`mt-4 rounded-xl border px-4 py-3 text-sm ${confusionToneClass}`}
                  >
                    Peak confusion reached {peakConfusion.toFixed(0)}% of
                    learners at the highest point.
                  </div>
                </>
              )}
            </MotionSection>

            {Object.keys(perStudentTimelines).length > 0 && (
              <MotionSection
                variants={sectionVariants}
                className={surfaceCardClass}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className={sectionTitleClass}>
                      Per-student engagement
                    </h3>
                    <p className={`${sectionBodyClass} mt-1`}>
                      Expanded view is scroll-contained and sorted with live
                      learners first.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPerStudent((prev) => !prev)}
                    className="rounded-full border border-[rgba(211,228,248,0.2)] bg-[rgba(255,255,255,0.06)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#e1ecf8] transition hover:bg-[rgba(255,255,255,0.12)]"
                  >
                    {showPerStudent ? "Hide details" : "Show details"}
                  </button>
                </div>

                {showPerStudent && (
                  <div className="mt-4 max-h-[460px] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {Object.entries(perStudentTimelines)
                        .sort(([a], [b]) => {
                          const simA = studentMeta[a]?.isSimulated ? 1 : 0;
                          const simB = studentMeta[b]?.isSimulated ? 1 : 0;
                          return simA - simB;
                        })
                        .map(([userId, data], idx) => {
                          const sim = studentMeta[userId]?.isSimulated;
                          const label =
                            studentMeta[userId]?.displayName ||
                            userId.slice(0, 12);
                          return (
                            <MotionArticle
                              key={userId}
                              whileHover={{
                                y: -2,
                                transition: { duration: 0.18, ease: EASE },
                              }}
                              className="rounded-xl border border-[rgba(211,228,248,0.16)] bg-[rgba(255,255,255,0.04)] p-4"
                            >
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-[#deebf9]">
                                <span className="truncate max-w-[230px]">
                                  {label}
                                </span>
                                {sim && (
                                  <span className="rounded-full border border-[rgba(168,146,255,0.4)] bg-[rgba(168,146,255,0.16)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#efe8ff]">
                                    Simulated
                                  </span>
                                )}
                              </div>
                              <ResponsiveContainer width="100%" height={148}>
                                <LineChart data={data}>
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke={chartGridStroke}
                                  />
                                  <XAxis
                                    dataKey="time"
                                    stroke={chartAxisStroke}
                                    tick={{ fontSize: 10, fill: "#8fa6be" }}
                                  />
                                  <YAxis
                                    domain={[0, 1]}
                                    ticks={[0, 0.5, 1]}
                                    tickFormatter={(v) =>
                                      `${(v * 100).toFixed(0)}%`
                                    }
                                    tick={{ fontSize: 10, fill: "#8fa6be" }}
                                    stroke={chartAxisStroke}
                                    width={36}
                                  />
                                  <Tooltip
                                    formatter={(v) => [
                                      `${(Number(v) * 100).toFixed(0)}%`,
                                      "Engagement",
                                    ]}
                                    contentStyle={chartTooltipStyle}
                                    labelStyle={chartTooltipLabelStyle}
                                    itemStyle={chartTooltipItemStyle}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="score"
                                    stroke={getStudentColor(idx)}
                                    strokeWidth={2.2}
                                    dot={{ r: 2 }}
                                    activeDot={{ r: 4 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </MotionArticle>
                          );
                        })}
                    </div>
                  </div>
                )}
              </MotionSection>
            )}

            <MotionSection
              variants={sectionVariants}
              className={surfaceCardClass}
            >
              <h3 className={sectionTitleClass}>Students at risk</h3>
              <p className={`${sectionBodyClass} mt-1`}>
                Criteria: average engagement below 35%, strikes at least 2, or
                identity issues at least 3.
              </p>

              {atRiskStudents.length === 0 ? (
                <div className="mt-4 rounded-xl border border-[rgba(55,211,154,0.3)] bg-[rgba(55,211,154,0.12)] px-4 py-8 text-center text-sm text-[#ccf8e9]">
                  No at-risk learners identified in this session.
                </div>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {atRiskStudents.map((student, idx) => {
                      const severity =
                        student.strikes >= 3 || student.identityIssues >= 2
                          ? "high"
                          : student.avgScore < 0.3
                            ? "medium"
                            : "low";

                      const severityLabel =
                        severity === "high"
                          ? "HIGH RISK"
                          : severity === "medium"
                            ? "MEDIUM RISK"
                            : "LOW RISK";

                      const severityClass =
                        severity === "high"
                          ? "border-[rgba(255,111,125,0.45)] bg-[rgba(255,111,125,0.12)] text-[#ffd4d9]"
                          : severity === "medium"
                            ? "border-[rgba(220,196,146,0.45)] bg-[rgba(220,196,146,0.14)] text-[#fff0cf]"
                            : "border-[rgba(126,178,255,0.45)] bg-[rgba(126,178,255,0.12)] text-[#d6e8ff]";

                      return (
                        <article
                          key={`${student.userId || "learner"}-${idx}`}
                          className="rounded-xl border border-[rgba(255,111,125,0.28)] bg-[rgba(255,255,255,0.04)] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-[#eff5fc]">
                                {student.userId?.slice(0, 12) ||
                                  "Unknown learner"}
                              </div>
                              <div className="mt-2 space-y-1 text-xs text-[#a6bbd0]">
                                <div>
                                  Avg engagement:{" "}
                                  <span className="font-semibold text-[#ffd0d6]">
                                    {(student.avgScore * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <div>
                                  Strikes:{" "}
                                  <span className="font-semibold text-[#deebf9]">
                                    {student.strikes || 0}
                                  </span>
                                </div>
                                <div>
                                  Identity issues:{" "}
                                  <span className="font-semibold text-[#deebf9]">
                                    {student.identityIssues || 0}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] ${severityClass}`}
                            >
                              {severityLabel}
                            </span>
                          </div>
                          <div className="mt-3 rounded-lg border border-[rgba(211,228,248,0.14)] bg-[rgba(4,20,33,0.55)] px-2.5 py-1.5 text-xs text-[#b9ccdf]">
                            {student.reason}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="mt-4 rounded-xl border border-[rgba(126,178,255,0.35)] bg-[rgba(126,178,255,0.12)] px-4 py-3 text-sm text-[#d5e7ff]">
                    Recommendation: follow up individually with flagged learners
                    and verify support actions in the next class.
                  </div>
                </>
              )}
            </MotionSection>
          </MotionDiv>

          <div className="border-t border-[rgba(211,228,248,0.14)] bg-[linear-gradient(180deg,rgba(6,22,35,0.9),rgba(4,16,27,0.9))] px-5 py-4 sm:px-7">
            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={handleExportPDF}
                className="w-full rounded-xl border border-[rgba(211,228,248,0.22)] bg-[rgba(255,255,255,0.05)] px-5 py-2.5 text-sm font-semibold text-[#d7e7f8] transition hover:bg-[rgba(255,255,255,0.1)] sm:w-auto"
              >
                Export PDF
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-xl border border-[rgba(211,228,248,0.22)] bg-[rgba(255,255,255,0.04)] px-5 py-2.5 text-sm font-semibold text-[#c0d4e9] transition hover:bg-[rgba(255,255,255,0.1)] sm:w-auto"
              >
                Close
              </button>
              <button
                onClick={onSave}
                className="w-full rounded-xl border border-[rgba(220,196,146,0.36)] bg-[linear-gradient(160deg,rgba(220,196,146,0.28),rgba(220,196,146,0.12))] px-5 py-2.5 text-sm font-semibold text-[#fff4db] shadow-[0_8px_20px_rgba(220,196,146,0.18)] transition hover:bg-[linear-gradient(160deg,rgba(220,196,146,0.34),rgba(220,196,146,0.16))] sm:w-auto"
              >
                Save report
              </button>
            </div>
          </div>
        </div>
      </MotionDiv>
    </div>
  );
}
