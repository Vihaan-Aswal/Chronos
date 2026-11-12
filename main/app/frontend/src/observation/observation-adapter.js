/**
 * Chronos Local Observation Adapter
 * Workstream W4: Local Observation, Browser Context, and Active Presence
 * Specification: LOGIC_AND_EVENT_SPEC.md §2 & QUALITY_REQUIREMENTS.md §1
 * 
 * Enforces Core Invariants:
 * 1. Emits normalized observation heartbeat samples every 5.0s (real) or 1.0s (demo).
 * 2. Never computes engagement scores, strikes, or disengagement states in the browser.
 * 3. Disqualified segments (missing face, multiple face, blur, poor lighting) emit cue_away = false.
 * 4. Strictly avoids transmitting raw video frames, continuous landmarks, or continuous embeddings.
 */

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class ObservationAdapter {
  /**
   * @param {Object} options
   * @param {string} options.sessionId
   * @param {string} options.participantId
   * @param {string} [options.tenantId="ten-default"]
   * @param {string} [options.policyId="CLASSROOM"]
   * @param {boolean} [options.isDemo=false]
   * @param {Function} [options.onSampleProduced]
   */
  constructor({
    sessionId,
    participantId,
    tenantId = "ten-default",
    policyId = "CLASSROOM",
    isDemo = false,
    onSampleProduced = null,
  }) {
    this.sessionId = sessionId;
    this.participantId = participantId;
    this.tenantId = tenantId;
    this.policyId = policyId;
    this.isDemo = isDemo;
    this.onSampleProduced = onSampleProduced;

    this.sampleIntervalMs = isDemo ? 1000 : 5000;
    this.sampleIndex = 0;
    this.timerId = null;
    this.latestMetrics = null;
    this.isRunning = false;
  }

  /**
   * Updates latest frame metrics computed from the video inference loop.
   * @param {Object} metrics
   */
  updateMetrics(metrics) {
    this.latestMetrics = metrics;
  }

  /**
   * Starts the observation heartbeat sampling timer.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timerId = setInterval(() => this.sample(), this.sampleIntervalMs);
  }

  /**
   * Stops the observation heartbeat sampling timer.
   */
  stop() {
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Samples current observation state and emits a normalized OBSERVATION_SAMPLE event envelope.
   */
  sample() {
    const now = new Date().toISOString();
    this.sampleIndex += 1;
    const m = this.latestMetrics;

    // Fallback if camera stream or vision pipeline is inactive
    if (!m || !m.cameraActive) {
      const technicalReasons = m?.technicalReasons || ["CAMERA_UNAVAILABLE"];
      const payload = {
        sample_id: generateUUID(),
        sample_index: this.sampleIndex,
        timestamp: now,
        usable: false,
        camera_active: false,
        face_count: 0,
        quality_score: 0.0,
        pose_confidence: 0.0,
        orientation_away: false,
        cue_away: false,
        pitch_deg: null,
        yaw_deg: null,
        roll_deg: null,
        technical_reasons: technicalReasons,
        attention_reasons: [],
        local_processing_ms: 0.0,
      };
      this.emit(payload, now);
      return;
    }

    const technicalReasons = [...(m.technicalReasons || [])];
    let usable = true;

    // 1. Face Count Validation
    if (m.faceCount === 0) {
      usable = false;
      if (!technicalReasons.includes("NO_FACE_DETECTED")) {
        technicalReasons.push("NO_FACE_DETECTED");
      }
    } else if (m.faceCount > 1) {
      usable = false;
      if (!technicalReasons.includes("MULTIPLE_FACES_DETECTED")) {
        technicalReasons.push("MULTIPLE_FACES_DETECTED");
      }
    }

    // 2. Image Quality Validation (Lighting, Blur, Framing)
    const qualityScore = typeof m.qualityScore === "number" ? m.qualityScore : 1.0;
    if (qualityScore < 0.70) {
      usable = false;
      if (!technicalReasons.includes("IMAGE_QUALITY_INSUFFICIENT")) {
        technicalReasons.push("IMAGE_QUALITY_INSUFFICIENT");
      }
    }

    // 3. Pose Confidence Validation
    const poseConfidence = typeof m.poseConfidence === "number" ? m.poseConfidence : 1.0;
    if (poseConfidence < 0.60) {
      usable = false;
      if (!technicalReasons.includes("LOW_CONFIDENCE")) {
        technicalReasons.push("LOW_CONFIDENCE");
      }
    }

    // 4. Determine Head Pose Orientation Cues (ONLY if segment is usable)
    let orientationAway = false;
    let cueAway = false;
    const attentionReasons = [];

    if (usable && !m.isPageHidden) {
      const yawAway = m.yawDeg !== null && Math.abs(m.yawDeg) >= 25.0;
      const pitchAway = m.pitchDeg !== null && Math.abs(m.pitchDeg) >= 20.0;
      if (yawAway || pitchAway) {
        orientationAway = true;
        cueAway = true;
        attentionReasons.push("ORIENTATION_AWAY");
      }
    }

    const payload = {
      sample_id: generateUUID(),
      sample_index: this.sampleIndex,
      timestamp: now,
      usable,
      camera_active: m.cameraActive,
      face_count: m.faceCount,
      quality_score: Math.round(qualityScore * 100) / 100,
      pose_confidence: Math.round(poseConfidence * 100) / 100,
      orientation_away: orientationAway,
      cue_away: cueAway,
      pitch_deg: m.pitchDeg !== null && m.pitchDeg !== undefined ? Math.round(m.pitchDeg * 10) / 10 : null,
      yaw_deg: m.yawDeg !== null && m.yawDeg !== undefined ? Math.round(m.yawDeg * 10) / 10 : null,
      roll_deg: m.rollDeg !== null && m.rollDeg !== undefined ? Math.round(m.rollDeg * 10) / 10 : null,
      technical_reasons: technicalReasons,
      attention_reasons: attentionReasons,
      local_processing_ms: Math.round((m.processingDurationMs || 15.0) * 10) / 10,
    };

    this.emit(payload, now);
  }

  /**
   * Packages payload into canonical EventEnvelope and dispatches.
   */
  emit(payload, occurredAt) {
    const envelope = {
      event_id: generateUUID(),
      event_type: "OBSERVATION_SAMPLE",
      schema_version: 1,
      tenant_id: this.tenantId,
      session_id: this.sessionId,
      participant_id: this.participantId,
      actor_id: this.participantId,
      actor_role: "participant",
      source: "camera",
      occurred_at: occurredAt,
      policy_id: this.policyId,
      policy_version: "v1",
      model_versions: {
        face_landmarker: "mediapipe-v2",
        embedder: "vladmandic-1.7.15",
        adapter: "v1.0",
      },
      is_demo: this.isDemo,
      payload,
    };

    if (typeof this.onSampleProduced === "function") {
      this.onSampleProduced(envelope);
    }
  }
}
