// src/components/SessionReport.jsx
import { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

const STUDENT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function SessionReport({ 
  sessionData, 
  onClose, 
  onSave 
}) {
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
    tpi
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
      .map((series) => series.reduce((s, x) => s + (x.score ?? 0), 0) / series.length);
    if (!avgs.length) return avgScore || 0;
    return avgs.reduce((a, b) => a + b, 0) / avgs.length;
  }, [perStudentTimelines, avgScore]);

  const relativePieData = useMemo(() => {
    const mu = classMeanFromStudents || 0.01;
    const hi = Math.min(0.95, mu * 1.15);
    const lo = Math.max(0.05, mu * 0.7);
    const avgs = Object.entries(perStudentTimelines).map(([uid, series]) => {
      if (!series?.length) return { uid, avg: 0 };
      const avg = series.reduce((s, p) => s + (p.score ?? 0), 0) / series.length;
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
    const total = above + mid + below || 1;
    return {
      rows: [
        { name: `Strong (≥${(hi * 100).toFixed(0)}%)`, value: above, color: '#10b981' },
        { name: 'Typical band', value: mid, color: '#f59e0b' },
        { name: `Below (≤${(lo * 100).toFixed(0)}%)`, value: below, color: '#ef4444' },
      ],
      hi,
      lo,
      total,
    };
  }, [perStudentTimelines, classMeanFromStudents]);

  const hasSimLine = metricsTimeline?.some((m) => m.avgScoreSimulated != null && !Number.isNaN(m.avgScoreSimulated));
  const hasRealLine = metricsTimeline?.some((m) => m.avgScoreReal != null && !Number.isNaN(m.avgScoreReal));

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.text("Session Report", 20, y);
    y += 15;
    doc.setFontSize(11);
    const durStr = duration >= 60 ? `${Math.floor(duration / 60)}h ${Math.floor(duration % 60)}m` : `${Math.floor(duration)}m`;
    doc.text(`Duration: ${durStr} | Avg Engagement: ${(avgScore * 100).toFixed(0)}% | Students: ${totalStudents}`, 20, y);
    y += 10;
    if (tpi != null) {
      doc.text(`Teacher Performance Index (TPI): ${tpi}/100`, 20, y);
      y += 10;
    }
    doc.text(`Attentive: ${distributionEffective.attentive} | Distracted: ${distributionEffective.distracted} | Disengaged: ${distributionEffective.disengaged}`, 20, y);
    y += 15;
    if (atRiskStudents.length > 0) {
      doc.setFontSize(14);
      doc.text("At-Risk Students", 20, y);
      y += 8;
      doc.setFontSize(10);
      atRiskStudents.forEach((s) => {
        doc.text(`- ${s.userId?.slice(0, 16)}... | Avg: ${(s.avgScore * 100).toFixed(0)}% | ${s.reason}`, 25, y);
        y += 6;
      });
      y += 5;
    }
    doc.save(`session-report-${sessionData.sessionId || "report"}.pdf`);
  };

  const COLORS = {
    attentive: '#10b981',   
    distracted: '#f59e0b',  
    disengaged: '#ef4444'  
  };

  const pieData = [
    { name: 'Attentive', value: distributionEffective.attentive, color: COLORS.attentive },
    { name: 'Distracted', value: distributionEffective.distracted, color: COLORS.distracted },
    { name: 'Disengaged', value: distributionEffective.disengaged, color: COLORS.disengaged }
  ];
  const pieDataNonZero = pieData.filter((d) => d.value > 0);

  const formatTime = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const getScoreColor = (score) => {
    if (score >= 0.7) return 'text-green-600';
    if (score >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score) => {
    if (score >= 0.7) return 'Excellent';
    if (score >= 0.4) return 'Average';
    return 'Needs Improvement';
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-[0_25px_80px_-12px_rgba(0,0,0,0.35)] max-w-5xl w-full max-h-[92vh] overflow-y-auto border border-slate-200/80 ring-1 ring-white/60">
        
        {/* Header */}
        <div className="p-7 border-b border-slate-200/80 bg-gradient-to-br from-indigo-700 via-violet-700 to-indigo-950 text-white">
          <h2 className="text-2xl font-bold tracking-tight mb-1">
            Post-class analytics
          </h2>
          <p className="text-indigo-100/90 text-sm max-w-2xl">
            Engagement over time, simulated cohort (if used), and at-risk signals — class mean ≈ {(classMeanFromStudents * 100).toFixed(0)}% from per-learner series.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {classContextMode && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/15 border border-white/25">
                Context: {classContextMode}
              </span>
            )}
            {strictModeAtEnd != null && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/15 border border-white/25">
                Tab mode end: {strictModeAtEnd ? 'Strict' : 'Normal'}
              </span>
            )}
            {(totalStudentsSimulated ?? 0) > 0 && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-400/20 border border-emerald-200/40 text-emerald-100">
                Includes {totalStudentsSimulated} simulated learners
              </span>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100/80 rounded-2xl p-5 border border-slate-200/80 flex flex-col justify-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">Duration</div>
            <div className="text-2xl font-bold text-slate-900">
              {formatTime(duration)}
            </div>
          </div>

          <div className={`rounded-2xl p-5 border flex flex-col justify-center shadow-sm ${
            avgScore >= 0.7 ? 'bg-emerald-50/90 border-emerald-200' : 
            avgScore >= 0.4 ? 'bg-amber-50/90 border-amber-200' : 
            'bg-red-50/90 border-red-200'
          }`}>
            <div className="text-xs uppercase tracking-wide font-semibold mb-1 opacity-80">Avg engagement</div>
            <div className={`text-2xl font-bold ${getScoreColor(avgScore)}`}>
              {(avgScore * 100).toFixed(0)}%
            </div>
            <div className={`text-xs font-medium mt-1 ${getScoreColor(avgScore)}`}>
              {getScoreLabel(avgScore)}
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-5 border border-indigo-200/80 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-indigo-600 font-semibold mb-1">Learners</div>
            <div className="text-2xl font-bold text-indigo-900">
              {totalStudents}
            </div>
            {(totalStudentsReal != null || totalStudentsSimulated != null) && (
              <div className="text-xs text-indigo-700/80 mt-2 space-y-0.5">
                {totalStudentsReal != null && <div>Live / enrolled: {totalStudentsReal}</div>}
                {(totalStudentsSimulated ?? 0) > 0 && (
                  <div>Simulated (demo): {totalStudentsSimulated}</div>
                )}
              </div>
            )}
          </div>

          {tpi != null && (
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-5 border border-violet-200/80 shadow-sm lg:col-span-1">
              <div className="text-xs uppercase tracking-wide text-violet-700 font-semibold mb-1">TPI</div>
              <div className="text-3xl font-bold text-violet-900">
                {tpi}<span className="text-lg text-violet-600">/100</span>
              </div>
              <div className="text-xs text-violet-700/80 mt-2">
                Retention of attention + average engagement
              </div>
            </div>
          )}
        </div>

        {/* Charts */}
        <div className="px-6 pb-6 space-y-6">
          
          {/* Class Heatmap */}
          {metricsTimeline && metricsTimeline.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span>🔥</span>
                <span>Class Attention Heatmap</span>
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 border">
                <div className="flex gap-1 flex-wrap">
                  {metricsTimeline.map((m, idx) => {
                    const s = Number(m.avgScore) || 0;
                    const color = s >= 0.7 ? '#10b981' : s >= 0.4 ? '#f59e0b' : '#ef4444';
                    const parts = [`All: ${(s * 100).toFixed(0)}%`];
                    if (m.avgScoreReal != null) parts.push(`Live: ${(m.avgScoreReal * 100).toFixed(0)}%`);
                    if (m.avgScoreSimulated != null) parts.push(`Sim: ${(m.avgScoreSimulated * 100).toFixed(0)}%`);
                    return (
                      <div
                        key={idx}
                        title={`${m.time} — ${parts.join(' · ')}`}
                        className="flex-1 min-w-[8px] h-10 rounded-md transition-opacity hover:opacity-90 ring-1 ring-black/5"
                        style={{ backgroundColor: color, opacity: 0.45 + s * 0.55 }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>Start</span>
                  <span>End</span>
                </div>
              </div>
            </div>
          )}

          {/* Engagement Over Time */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              Engagement timeline
            </h3>
            <p className="text-sm text-slate-500 mb-3">
              Combined average includes simulated learners when simulation was on; split lines separate live vs simulated cohorts.
            </p>
            {metricsTimeline && metricsTimeline.length > 0 ? (
              <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/80 shadow-inner">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={metricsTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#64748b"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis 
                      stroke="#64748b"
                      tick={{ fontSize: 11 }}
                      domain={[0, 1]}
                      ticks={[0, 0.25, 0.5, 0.75, 1]}
                      tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                    />
                    <Tooltip 
                      formatter={(value, name) => {
                        if (value == null || Number.isNaN(value)) return ['—', name];
                        return [`${(Number(value) * 100).toFixed(0)}%`, name];
                      }}
                      contentStyle={{ 
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: '12px',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line 
                      type="monotone" 
                      dataKey="avgScore" 
                      name="All learners (avg)"
                      stroke="#4f46e5" 
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    {hasRealLine && (
                      <Line
                        type="monotone"
                        dataKey="avgScoreReal"
                        name="Live learners"
                        stroke="#0d9488"
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
                        stroke="#a855f7"
                        strokeDasharray="6 4"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-8 border text-center">
                <p className="text-gray-500">No timeline data available</p>
              </div>
            )}
          </div>

          {/* Distribution Pie Chart */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              Attention distribution
            </h3>
            <p className="text-sm text-slate-500 mb-3">
              Fixed bands: attentive &gt;70%, distracted 40–70%, disengaged &lt;40% (per learner session average).
            </p>
            <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/80">
              {pieDataNonZero.length === 0 ? (
                <p className="text-center text-slate-500 py-12">No distribution data</p>
              ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieDataNonZero}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={88}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieDataNonZero.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              )}
              
              <div className="flex flex-wrap justify-center gap-4 mt-4 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: COLORS.attentive }} />
                  <span>Attentive (&gt;70%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: COLORS.distracted }} />
                  <span>Distracted (40–70%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: COLORS.disengaged }} />
                  <span>Disengaged (&lt;40%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Relative to class mean */}
          {(() => {
            const relRows = relativePieData.rows.filter((r) => r.value > 0);
            if (relRows.length === 0) return null;
            return (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">
                vs class average
              </h3>
              <p className="text-sm text-slate-500 mb-3">
                Per-learner mean vs session cohort: strong ≥{(relativePieData.hi * 100).toFixed(0)}%, weak ≤{(relativePieData.lo * 100).toFixed(0)}%.
              </p>
              <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/80">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={relRows}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${String(name).split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={82}
                      dataKey="value"
                    >
                      {relRows.map((entry, index) => (
                        <Cell key={`rel-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            );
          })()}

          {/* CONFUSION HOTSPOTS */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span>🤔</span>
              <span>Confusion Hotspots Over Time</span>
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 border">
              {confusionHotspots.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-2">✅</div>
                  <p className="text-gray-600 font-medium">No significant confusion detected!</p>
                  <p className="text-sm text-gray-500 mt-1">Class maintained focus throughout</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={confusionHotspots}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="time" 
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis 
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                        domain={[0, 100]}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip 
                        formatter={(value) => [`${value}%`, 'Confusion Level']}
                        contentStyle={{ 
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                      />
                      <Bar 
                        dataKey="percentage" 
                        fill="#f59e0b" 
                        name="Confusion %"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-sm text-orange-800">
                      <strong>📊 Peak Confusion:</strong> {Math.max(...confusionHotspots.map(h => h.percentage))}% of students showed confusion signals at the highest point
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* PER-STUDENT ENGAGEMENT */}
          {Object.keys(perStudentTimelines).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span>📈</span>
                <span>Per-Student Engagement</span>
                <button
                  onClick={() => setShowPerStudent(!showPerStudent)}
                  className="ml-2 text-sm px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                >
                  {showPerStudent ? "Hide" : "Show"}
                </button>
              </h3>
              {showPerStudent && (
                <div className="space-y-4">
                  {Object.entries(perStudentTimelines)
                    .sort(([a], [b]) => {
                      const simA = studentMeta[a]?.isSimulated ? 1 : 0;
                      const simB = studentMeta[b]?.isSimulated ? 1 : 0;
                      return simA - simB;
                    })
                    .map(([userId, data], idx) => {
                      const sim = studentMeta[userId]?.isSimulated;
                      const label = studentMeta[userId]?.displayName || userId.slice(0, 12);
                      return (
                    <div key={userId} className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
                      <div className="text-sm font-semibold text-slate-800 mb-2 flex flex-wrap items-center gap-2">
                        <span className="truncate max-w-[220px]">{label}</span>
                        {sim && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
                            Simulated
                          </span>
                        )}
                      </div>
                      <ResponsiveContainer width="100%" height={130}>
                        <LineChart data={data}>
                          <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => `${(v*100).toFixed(0)}%`} tick={{ fontSize: 10 }} width={36} />
                          <Tooltip formatter={(v) => [`${(Number(v)*100).toFixed(0)}%`, 'Engagement']} />
                          <Line type="monotone" dataKey="score" stroke={STUDENT_COLORS[idx % STUDENT_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );})}
                </div>
              )}
            </div>
          )}

          {/* AT RISK STUDENTS */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <span>⚠️</span>
              <span>Students At Risk</span>
            </h3>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              {atRiskStudents.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-2">🌟</div>
                  <p className="text-slate-600 font-medium">All students maintained good engagement!</p>
                  <p className="text-sm text-slate-500 mt-1">No at-risk students identified</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-200 mb-4">
                    <strong>🎯 Criteria:</strong> Avg engagement &lt;35%, strikes ≥2, or identity violations ≥3
                  </div>
                  {atRiskStudents.map((student, idx) => {
                    const severity = (student.strikes >= 3 || student.identityIssues >= 2) ? 'high' : (student.avgScore < 0.3 ? 'medium' : 'low');
                    const badgeClass = severity === 'high' ? 'bg-red-500 text-white' : severity === 'medium' ? 'bg-amber-500 text-white' : 'bg-orange-400 text-white';
                    return (
                    <div key={idx} className="bg-white border border-red-200 rounded-xl p-4 flex items-start justify-between gap-4 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <span>👤</span>
                          <span>{student.userId?.slice(0, 12) || 'Unknown'}…</span>
                        </div>
                        <div className="text-sm text-slate-600 mt-2 space-y-1">
                          <div>
                            Avg: <span className="font-bold text-red-700">{(student.avgScore * 100).toFixed(0)}%</span>
                          </div>
                          {student.strikes > 0 && (
                            <div>Strikes: <span className="font-bold">{student.strikes}</span></div>
                          )}
                          {student.identityIssues > 0 && (
                            <div className="text-red-700 font-bold">🚨 Identity: {student.identityIssues}</div>
                          )}
                          <div className="text-xs mt-2 bg-slate-100 px-2 py-1 rounded-lg inline-block text-slate-700">
                            {student.reason}
                          </div>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${badgeClass}`}>
                        {severity === 'high' ? 'HIGH RISK' : severity === 'medium' ? 'MEDIUM' : 'LOW'}
                      </span>
                    </div>
                  );})}
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>📞 Recommendation:</strong> Follow up with these students individually to provide support and verify their participation
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-slate-200/90 bg-gradient-to-r from-slate-50 to-indigo-50/40 flex flex-wrap justify-end gap-3">
          <button
            onClick={handleExportPDF}
            className="px-5 py-2.5 rounded-xl font-semibold bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 shadow-sm transition"
          >
            Export PDF
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition"
          >
            Close
          </button>
          <button
            onClick={onSave}
            className="px-5 py-2.5 rounded-xl font-semibold bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/25 transition"
          >
            Save report
          </button>
        </div>

      </div>
    </div>
  );
}