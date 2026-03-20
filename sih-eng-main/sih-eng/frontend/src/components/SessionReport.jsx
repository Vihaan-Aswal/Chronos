// src/components/SessionReport.jsx
import { useState } from 'react';
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
    metricsTimeline,
    distribution,
    confusionHotspots = [],
    atRiskStudents = [],
    perStudentTimelines = {},
    tpi
  } = sessionData;

  const [showPerStudent, setShowPerStudent] = useState(false);

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
    doc.text(`Attentive: ${distribution.attentive} | Distracted: ${distribution.distracted} | Disengaged: ${distribution.disengaged}`, 20, y);
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
    { name: 'Attentive', value: distribution.attentive, color: COLORS.attentive },
    { name: 'Distracted', value: distribution.distracted, color: COLORS.distracted },
    { name: 'Disengaged', value: distribution.disengaged, color: COLORS.disengaged }
  ];

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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto border border-slate-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-indigo-600 via-indigo-700 to-slate-800">
          <h2 className="text-2xl font-bold text-white mb-1">
            Session Complete! 🎉
          </h2>
          <p className="text-indigo-200 text-sm">
            Here's how your class performed
          </p>
        </div>

        {/* Stats Cards */}
        <div className="p-6 grid grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 h-[100px] flex flex-col justify-center">
            <div className="text-sm text-slate-600 font-medium mb-1 flex items-center gap-2">
              <span>⏱</span> Duration
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {formatTime(duration)}
            </div>
          </div>

          <div className={`rounded-xl p-4 border h-[100px] flex flex-col justify-center ${
            avgScore >= 0.7 ? 'bg-emerald-50 border-emerald-200' : 
            avgScore >= 0.4 ? 'bg-amber-50 border-amber-200' : 
            'bg-red-50 border-red-200'
          }`}>
            <div className="text-sm font-medium mb-1 flex items-center gap-2">
              <span>📊</span>
              <span className={avgScore >= 0.7 ? 'text-emerald-600' : avgScore >= 0.4 ? 'text-amber-600' : 'text-red-600'}>Avg Engagement</span>
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(avgScore)}`}>
              {(avgScore * 100).toFixed(0)}%
            </div>
            <div className={`text-xs font-medium mt-0.5 ${getScoreColor(avgScore)}`}>
              {getScoreLabel(avgScore)}
            </div>
          </div>

          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200 h-[100px] flex flex-col justify-center">
            <div className="text-sm text-indigo-600 font-medium mb-1 flex items-center gap-2">
              <span>👥</span> Students
            </div>
            <div className="text-2xl font-bold text-indigo-700">
              {totalStudents}
            </div>
          </div>

          {tpi != null && (
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200" style={{ gridColumn: '1 / -1' }}>
              <div className="text-sm text-indigo-600 font-medium mb-1 flex items-center gap-2">
                <span>📈</span> Teacher Performance Index (TPI)
              </div>
              <div className="text-3xl font-bold text-indigo-700">
                {tpi}/100
              </div>
              <div className="text-xs text-indigo-600 mt-1">
                Based on engagement retention and drop-points
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
                    return (
                      <div
                        key={idx}
                        title={`${m.time}: ${(s*100).toFixed(0)}%`}
                        className="flex-1 min-w-[8px] h-8 rounded-sm transition-opacity hover:opacity-80"
                        style={{ backgroundColor: color, opacity: 0.5 + s * 0.5 }}
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
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Engagement Timeline
            </h3>
            {metricsTimeline && metricsTimeline.length > 0 ? (
              <div className="bg-gray-50 rounded-lg p-4 border">
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={metricsTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#6b7280"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      style={{ fontSize: '12px' }}
                      domain={[0, 1]}
                      ticks={[0, 0.25, 0.5, 0.75, 1]}
                      tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                    />
                    <Tooltip 
                      formatter={(value, name) => {
                        if (name === "Class Average") {
                          return [`${(value * 100).toFixed(0)}%`, name];
                        }
                        return [value, name];
                      }}
                      contentStyle={{ 
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="avgScore" 
                      name="Class Average"
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
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
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Attention Distribution
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 border">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.attentive }} />
                  <span className="text-sm text-gray-700">Attentive (&gt;70%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.distracted }} />
                  <span className="text-sm text-gray-700">Distracted (40-70%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.disengaged }} />
                  <span className="text-sm text-gray-700">Disengaged (&lt;40%)</span>
                </div>
              </div>
            </div>
          </div>

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
                  {Object.entries(perStudentTimelines).map(([userId, data], idx) => (
                    <div key={userId} className="bg-gray-50 rounded-lg p-4 border">
                      <div className="text-sm font-medium text-gray-700 mb-2">
                        {userId.slice(0, 12)}...
                      </div>
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={data}>
                          <XAxis dataKey="time" stroke="#6b7280" style={{ fontSize: '10px' }} />
                          <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => `${(v*100).toFixed(0)}%`} style={{ fontSize: '10px' }} />
                          <Tooltip formatter={(v) => [`${(v*100).toFixed(0)}%`, 'Score']} />
                          <Line type="monotone" dataKey="score" stroke={STUDENT_COLORS[idx % STUDENT_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
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
        <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={handleExportPDF}
            className="px-6 py-2.5 rounded-xl font-medium bg-red-600 text-white hover:bg-red-700 transition-all duration-200"
          >
            Export PDF
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-all duration-200"
          >
            Close
          </button>
          <button
            onClick={onSave}
            className="px-6 py-2.5 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-all duration-200 shadow-md"
          >
            Save Report
          </button>
        </div>

      </div>
    </div>
  );
}