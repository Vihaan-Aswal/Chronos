const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export async function listRecords(teacherId) {
  const res = await fetch(
    `${BASE}/session/analytics/list?teacher_id=${encodeURIComponent(teacherId)}`,
  );
  if (!res.ok) throw new Error(`Failed to load records: ${res.status}`);
  const data = await res.json();
  return data.sessions || [];
}

export async function loadRecord(sessionId, signal) {
  const res = await fetch(`${BASE}/session/${sessionId}/analytics`, {
    signal,
  });
  if (!res.ok) throw new Error(`Failed to load record: ${res.status}`);

  const { exists, analytics } = await res.json();
  if (!exists || !analytics?.length) {
    throw new Error("No record found for this session.");
  }

  const a = analytics[0];
  const rawTimeline = a.metrics_timeline || [];
  const metricsTimeline = rawTimeline.map((m, idx) => {
    const stud = m.students || {};
    let rSum = 0,
      rN = 0,
      sSum = 0,
      sN = 0;
    Object.values(stud).forEach((met) => {
      const sc = Number(met?.score || 0);
      if (met?.isSimulated) {
        sSum += sc;
        sN += 1;
      } else {
        rSum += sc;
        rN += 1;
      }
    });
    return {
      time: `${(idx * 0.5).toFixed(1)}m`,
      avgScore: Number(m.avgScore) || 0,
      students: m.studentCount || 0,
      avgScoreReal: rN ? rSum / rN : null,
      avgScoreSimulated: sN ? sSum / sN : null,
    };
  });

  const perStudentTimelines = {};
  const studentMeta = {};
  rawTimeline.forEach((snapshot, idx) => {
    const t = `${(idx * 0.5).toFixed(1)}m`;
    const studentData = snapshot.students || {};
    Object.entries(studentData).forEach(([uid, metrics]) => {
      if (!perStudentTimelines[uid]) perStudentTimelines[uid] = [];
      perStudentTimelines[uid].push({
        time: t,
        score: Number(metrics?.score || 0),
      });
      if (metrics?.isSimulated != null) {
        studentMeta[uid] = {
          isSimulated: Boolean(metrics.isSimulated),
          displayName: metrics.isSimulated
            ? `Simulated · ${uid}`
            : uid.slice(0, 12),
        };
      }
    });
  });

  const lastSnap = rawTimeline[rawTimeline.length - 1];
  const lastStudents = lastSnap?.students || {};
  Object.keys(lastStudents).forEach((uid) => {
    const met = lastStudents[uid];
    if (!studentMeta[uid]) {
      studentMeta[uid] = {
        isSimulated: Boolean(met?.isSimulated),
        displayName: met?.isSimulated ? `Simulated · ${uid}` : uid.slice(0, 12),
      };
    }
  });

  const simCount = Object.values(lastStudents).filter(
    (m) => m?.isSimulated,
  ).length;

  return {
    sessionId: a.session_id,
    teacherId: a.teacher_id,
    startTime: a.start_time,
    duration: a.duration_minutes || 0,
    avgScore: a.avg_engagement_score || 0,
    totalStudents: a.total_students || 0,
    totalStudentsSimulated: simCount,
    totalStudentsReal: Math.max(0, (a.total_students || 0) - simCount),
    studentMeta,
    tpi: a.tpi,
    metricsTimeline,
    perStudentTimelines,
    distribution: { attentive: 0, distracted: 0, disengaged: 0 },
    confusionHotspots: a.confusion_hotspots || [],
    atRiskStudents: (a.at_risk_students || []).map((s) => ({
      userId: s.userId || s.user_id,
      avgScore: s.avgScore ?? s.avg_score ?? 0,
      strikes: s.strikes || 0,
      identityIssues: s.identityIssues ?? s.identity_issues ?? 0,
      reason: s.reason || "",
    })),
  };
}
