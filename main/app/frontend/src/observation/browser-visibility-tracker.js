/**
 * Chronos Browser Visibility & Context Tracker
 * Workstream W4: Local Observation, Browser Context, and Active Presence
 * Specification: LOGIC_AND_EVENT_SPEC.md §8 & PRIVACY_DATA_MODEL.md §4
 * 
 * Enforces Core Invariants:
 * 1. Measures visibility intervals (started_at, ended_at, duration_ms).
 * 2. destination_known is ALWAYS false (never fabricates or guesses destination URL/app).
 * 3. Correlates declared resource clicks without claiming unauthorized website access.
 * 4. Completely suppresses event emission when policy is NO_ANALYTICS.
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

export class BrowserVisibilityTracker {
  /**
   * @param {Object} options
   * @param {string} options.sessionId
   * @param {string} options.participantId
   * @param {string} [options.tenantId="ten-default"]
   * @param {string} [options.policyId="CLASSROOM"]
   * @param {Function} [options.onEventProduced]
   */
  constructor({
    sessionId,
    participantId,
    tenantId = "ten-default",
    policyId = "CLASSROOM",
    onEventProduced = null,
  }) {
    this.sessionId = sessionId;
    this.participantId = participantId;
    this.tenantId = tenantId;
    this.policyId = policyId;
    this.onEventProduced = onEventProduced;

    this.hiddenStartTs = null;
    this.blurStartTs = null;
    this.lastDeclaredResourceClick = null; // { resourceId, timestamp }
    this.isListening = false;

    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handleFocus = this.handleFocus.bind(this);
    this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
  }

  /**
   * Records that a declared session resource link was clicked by the student.
   * @param {string} resourceId
   */
  recordExternalResourceClick(resourceId) {
    this.lastDeclaredResourceClick = {
      resourceId,
      timestamp: Date.now(),
    };
  }

  /**
   * Starts listening to browser events.
   */
  start() {
    if (this.isListening || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    // Complete suppression if policy is NO_ANALYTICS
    if (this.policyId === "NO_ANALYTICS") {
      return;
    }

    this.isListening = true;
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("focus", this.handleFocus);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
  }

  /**
   * Stops listening to browser events.
   */
  stop() {
    if (!this.isListening || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    this.isListening = false;
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("blur", this.handleBlur);
    window.removeEventListener("focus", this.handleFocus);
    document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
  }

  handleVisibilityChange() {
    if (this.policyId === "NO_ANALYTICS") return;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    if (document.hidden) {
      this.hiddenStartTs = now;
      this.emitEvent("PAGE_HIDDEN", {
        started_at: nowIso,
        visibility_state: "HIDDEN",
        destination_known: false,
      });
    } else {
      const startedAtIso = this.hiddenStartTs ? new Date(this.hiddenStartTs).toISOString() : nowIso;
      const durationMs = this.hiddenStartTs ? Math.max(0, now - this.hiddenStartTs) : 0;
      this.hiddenStartTs = null;

      // Check if a declared resource was clicked recently (< 30 seconds ago)
      let declaredResourceRecent = false;
      let associatedResourceId = null;
      if (this.lastDeclaredResourceClick && now - this.lastDeclaredResourceClick.timestamp < 30000) {
        declaredResourceRecent = true;
        associatedResourceId = this.lastDeclaredResourceClick.resourceId;
      }

      this.emitEvent("PAGE_VISIBLE", {
        started_at: startedAtIso,
        ended_at: nowIso,
        duration_ms: durationMs,
        visibility_state: "VISIBLE",
        destination_known: false,
        declared_resource_opened_recently: declaredResourceRecent,
        associated_declared_resource_id: associatedResourceId,
      });
    }
  }

  handleBlur() {
    if (this.policyId === "NO_ANALYTICS") return;
    const now = Date.now();
    this.blurStartTs = now;
    this.emitEvent("WINDOW_BLURRED", {
      started_at: new Date(now).toISOString(),
      visibility_state: "HIDDEN",
      destination_known: false,
    });
  }

  handleFocus() {
    if (this.policyId === "NO_ANALYTICS") return;
    const now = Date.now();
    const durationMs = this.blurStartTs ? Math.max(0, now - this.blurStartTs) : 0;
    this.blurStartTs = null;

    this.emitEvent("WINDOW_FOCUSED", {
      ended_at: new Date(now).toISOString(),
      duration_ms: durationMs,
      visibility_state: "VISIBLE",
      destination_known: false,
    });
  }

  handleFullscreenChange() {
    if (this.policyId === "NO_ANALYTICS") return;
    const isFullscreen = Boolean(document.fullscreenElement);
    const eventType = isFullscreen ? "FULLSCREEN_ENTERED" : "FULLSCREEN_EXITED";
    this.emitEvent(eventType, {
      occurred_at: new Date().toISOString(),
      destination_known: false,
    });
  }

  emitEvent(eventType, payload) {
    const envelope = {
      event_id: generateUUID(),
      event_type: eventType,
      schema_version: 1,
      tenant_id: this.tenantId,
      session_id: this.sessionId,
      participant_id: this.participantId,
      actor_id: this.participantId,
      actor_role: "participant",
      source: "browser",
      occurred_at: payload.occurred_at || payload.ended_at || payload.started_at || new Date().toISOString(),
      policy_id: this.policyId,
      payload,
    };

    if (typeof this.onEventProduced === "function") {
      this.onEventProduced(envelope);
    }
  }
}
