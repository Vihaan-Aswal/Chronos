/**
 * Chronos Canonical Domain Contracts, Enumerations & Event Schemas
 * Workstream W2: Domain Contracts and Event Persistence
 * Specification Version: 1.0 (Hackathon Baseline)
 */

// ===========================================================================
// 1. Canonical Domain Enumerations
// ===========================================================================

export type PolicyId =
  | 'CLASSROOM'
  | 'RESOURCE_SUPPORTED_ASSESSMENT'
  | 'SUPERVISED_ASSESSMENT'
  | 'NO_ANALYTICS';

export type EventType =
  // Session Lifecycle
  | 'SESSION_CREATED'
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'POLICY_CHANGED'
  | 'PARTICIPANT_JOINED'
  | 'PARTICIPANT_LEFT'
  // Observation & Windowing
  | 'OBSERVATION_SAMPLE'
  | 'WINDOW_FINALIZED'
  | 'NO_DATA_ENTERED'
  | 'NO_DATA_EXITED'
  // Technical Health
  | 'CAMERA_STATE_CHANGED'
  | 'NETWORK_STATE_CHANGED'
  // Identity Continuity
  | 'IDENTITY_RESULT'
  // Active Presence Protocol
  | 'ACTIVE_PRESENCE_REQUESTED'
  | 'ACTIVE_PRESENCE_STARTED'
  | 'ACTIVE_PRESENCE_PASSED'
  | 'ACTIVE_PRESENCE_RETRY_REQUIRED'
  | 'ACTIVE_PRESENCE_TIMED_OUT'
  | 'ACTIVE_PRESENCE_DECLINED'
  | 'ACTIVE_PRESENCE_UNAVAILABLE'
  // Browser Visibility & Focus
  | 'PAGE_HIDDEN'
  | 'PAGE_VISIBLE'
  | 'WINDOW_BLURRED'
  | 'WINDOW_FOCUSED'
  | 'FULLSCREEN_ENTERED'
  | 'FULLSCREEN_EXITED'
  // Resources
  | 'RESOURCE_PUBLISHED'
  | 'RESOURCE_OPENED'
  | 'RESOURCE_CLOSED'
  | 'EXTERNAL_RESOURCE_CLICKED'
  // Answer Submission
  | 'ANSWER_DRAFT_SAVED'
  | 'ANSWER_SUBMITTED'
  | 'ANSWER_REPLACED'
  | 'ANSWER_MARKED_LATE'
  // Nudges & Appeals
  | 'STUDENT_NUDGED'
  | 'STUDENT_CONTEXT_ADDED'
  // Case Management
  | 'CASE_CREATED'
  | 'CASE_UPDATED'
  | 'CASE_RESOLVED'
  | 'TEACHER_ACTION_RECORDED';

export type WindowObservationState = 'VALID' | 'NO_DATA';
export type ParticipantObservationState = 'OBSERVABLE' | 'NO_DATA' | 'LEFT';
export type WindowClassification = 'VALID_CLEAN' | 'VALID_WARNING' | 'CLEAN' | 'WARNING' | 'NOT_EVALUATED';
export type AttentionPattern = 'STABLE' | 'VARIABLE' | 'SUSTAINED_CONCERN' | 'UNKNOWN';

export type IdentityState =
  | 'NOT_REQUESTED'
  | 'UNENROLLED'
  | 'CHECKING'
  | 'VERIFIED'
  | 'LOW_CONFIDENCE'
  | 'QUALITY_FAIL'
  | 'MISMATCH'
  | 'UNAVAILABLE'
  | 'MANUAL_REVIEW';

export type ActivePresenceState =
  | 'NOT_REQUESTED'
  | 'REQUESTED'
  | 'IN_PROGRESS'
  | 'PASSED'
  | 'QUALITY_FAIL'
  | 'TIMED_OUT'
  | 'DECLINED'
  | 'UNAVAILABLE'
  | 'RETRY_REQUIRED'
  | 'MANUAL_REVIEW';

export type BrowserContextState =
  | 'NO_ACTIVE_EVENT'
  | 'PAGE_HIDDEN'
  | 'WINDOW_BLURRED'
  | 'FULLSCREEN_EXITED'
  | 'DESTINATION_UNKNOWN';

export type CaseState =
  | 'NONE'
  | 'SELF_RECOVERY'
  | 'MONITOR'
  | 'ACTION_REQUIRED'
  | 'CONTEXT_ADDED'
  | 'RESOLVED';

export type CaseStatus =
  | 'OPEN'
  | 'MONITOR'
  | 'ACTION_REQUIRED'
  | 'SNOOZED'
  | 'SELF_RECOVERED'
  | 'RESOLVED'
  | 'DISMISSED';

export type CaseCategory =
  | 'TECHNICAL_CAMERA'
  | 'TECHNICAL_NETWORK'
  | 'ATTENTION_CONCERN'
  | 'IDENTITY_UNCERTAINTY'
  | 'BROWSER_VISIBILITY'
  | 'STUDENT_HELP_REQUEST'
  | 'SESSION_INCIDENT';

export type CasePriority =
  | 'STUDENT_ONLY'
  | 'CLASS_SUMMARY'
  | 'MONITOR'
  | 'ACTION_REQUIRED'
  | 'URGENT';

export type TechnicalReasonCode =
  | 'CAMERA_UNAVAILABLE'
  | 'CAMERA_PERMISSION_DENIED'
  | 'CAMERA_POOR_QUALITY'
  | 'NO_FACE_DETECTED'
  | 'MULTIPLE_FACES_DETECTED'
  | 'IMAGE_QUALITY_INSUFFICIENT'
  | 'LOW_CONFIDENCE'
  | 'NETWORK_DEGRADED'
  | 'NETWORK_DISCONNECTED'
  | 'CPU_OVERLOAD'
  | 'CONSENT_MISSING'
  | 'SYSTEM_BACKGROUND';

export type AttentionReasonCode =
  | 'ORIENTATION_AWAY'
  | 'HEAD_TURNED'
  | 'PROLONGED_ABSENCE'
  | 'SUSTAINED_LOW_SIGNAL'
  | 'PERSISTENT_NON_FORWARD';

export type ActivePresenceAction =
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'LOOK_UP'
  | 'LOOK_DOWN'
  | 'NOD'
  | 'RETURN_NEUTRAL';

export type ConsentCategory =
  | 'LIVE_SESSION_PARTICIPATION'
  | 'CAMERA_LOCAL_PROCESSING'
  | 'IDENTITY_ENROLLMENT'
  | 'IDENTITY_VERIFICATION'
  | 'ACTIVE_PRESENCE_CHECKS'
  | 'ATTENTION_TELEMETRY'
  | 'BROWSER_CONTEXT_TELEMETRY'
  | 'ANSWER_STORAGE';

export type AppealCategory =
  | 'CAMERA_LIGHTING_DEVICE'
  | 'NETWORK_CONNECTIVITY'
  | 'SIGNAL_MISMATCH'
  | 'DECLARED_RESOURCE_USE'
  | 'ACCESSIBILITY_ACCOMMODATION'
  | 'IDENTITY_VERIFICATION_ISSUE'
  | 'OTHER';

export type ActorRole = 'participant' | 'teacher' | 'system' | 'admin';
export type EventSource = 'browser' | 'camera' | 'server' | 'teacher' | 'meeting_provider';

// ===========================================================================
// 2. Specific Event Payload Interfaces
// ===========================================================================

export interface ObservationSamplePayload {
  sample_id?: string;
  sample_index?: number;
  timestamp?: string;
  usable: boolean;
  camera_active: boolean;
  face_count: number;
  quality_score: number;
  pose_confidence?: number;
  orientation_away: boolean;
  cue_away?: boolean;
  pitch_deg?: number;
  yaw_deg?: number;
  roll_deg?: number;
  technical_reasons: string[];
  attention_reasons: string[];
  local_processing_ms: number;
}

export interface WindowFinalizedPayload {
  window_id: string;
  window_start?: string;
  window_end?: string;
  expected_segments: number;
  usable_segments: number;
  coverage_ratio: number;
  observation_state: string;
  classification: string;
  cue_exposure_seconds: number;
  warning_streak: number;
  clean_streak: number;
  reason_codes: string[];
  technical_reasons: string[];
}

export interface NoDataEnteredPayload {
  started_at: string;
  primary_reason: string;
  technical_reasons: string[];
  last_valid_window_id?: string;
  warning_streak_frozen: number;
}

export interface NoDataExitedPayload {
  started_at: string;
  ended_at: string;
  duration_ms: number;
  exit_reason: string;
  streak_reset: boolean;
}

export interface CameraStateChangedPayload {
  previous_state: string;
  current_state: string;
  is_usable: boolean;
  reason?: string;
}

export interface NetworkStateChangedPayload {
  previous_state: string;
  current_state: string;
  rtt_ms?: number;
  packet_loss_pct?: number;
  is_usable: boolean;
}

export interface IdentityResultPayload {
  check_id: string;
  identity_state: string;
  confidence_score?: number;
  quality_score: number;
  comparison_target: 'session_baseline';
  failure_reason?: string;
  alternative_verification_used: boolean;
}

export interface ActivePresenceChallengePayload {
  challenge_id: string;
  sequence?: string[];
  actions?: string[];
  nonce?: string;
  expires_at?: string;
  expires_in_sec?: number;
  attempt_number: number;
  max_attempts: number;
  trigger?: string;
  status?: string;
  result_state?: string;
  elapsed_ms?: number;
  failure_reason?: string;
}

export interface BrowserVisibilityPayload {
  started_at?: string;
  ended_at?: string;
  duration_ms?: number;
  visibility_state?: string;
  destination_known: false;
  declared_resource_opened_recently: boolean;
  associated_declared_resource_id?: string;
  context_note?: string;
}

export interface ResourcePayload {
  resource_id: string;
  type?: string;
  resource_type?: string;
  title: string;
  description?: string;
  required?: boolean;
  is_required?: boolean;
  storage_path?: string;
  declared_url?: string;
  allowed_domain?: string;
  content_hash?: string;
  size_bytes?: number;
  byte_size?: number;
  immutable_after_start: boolean;
  opened_at?: string;
  closed_at?: string;
  duration_ms?: number;
}

export interface AnswerSubmissionPayload {
  submission_id: string;
  version: number;
  status: string;
  artifact_type?: string;
  content_hash: string;
  byte_size?: number;
  size_bytes?: number;
  storage_path?: string;
  is_late: boolean;
  submitted_at?: string;
}

export interface StudentNudgePayload {
  nudge_id: string;
  nudge_type: string;
  delivery_channel: string;
  auto_dismiss_seconds: number;
}

export interface StudentContextAddedPayload {
  context_id: string;
  appeal_category: string;
  explanation_text?: string;
  requested_help: boolean;
  attached_to_event_ids: string[];
  attached_at?: string;
}

export interface CasePayload {
  case_id: string;
  session_id?: string;
  participant_id?: string | null;
  category: string;
  status: string;
  priority: string;
  reason_summary?: string;
  started_at?: string;
  last_updated_at?: string;
  resolved_at?: string;
  duration_ms: number;
  event_ids: string[];
  self_recovery_attempted: boolean;
  student_context_count: number;
  teacher_action_count: number;
  affected_participant_count?: number;
  resolution_reason?: string;
}

export interface TeacherActionRecordedPayload {
  action_id: string;
  action_type: string;
  target_participant_ids: string[];
  target_case_ids: string[];
  is_batch: boolean;
  note?: string;
  snooze_duration_minutes?: number;
}

// ===========================================================================
// 3. Canonical Versioned Event Envelope (schema_version: 1)
// ===========================================================================

export interface EventEnvelope<T = Record<string, any>> {
  event_id: string;
  event_type: EventType | string;
  schema_version: 1;
  tenant_id: string;
  session_id: string;
  participant_id?: string;
  actor_id: string;
  actor_role: ActorRole | string;
  source: EventSource | string;
  occurred_at: string;
  received_at?: string;
  server_sequence?: number;
  correlation_id?: string;
  causation_id?: string;
  policy_id: PolicyId | string;
  policy_version: string;
  model_versions: Record<string, string>;
  is_demo: boolean;
  payload: T;
}

// ===========================================================================
// 4. Projections & View Models
// ===========================================================================

export interface ParticipantProjection {
  participant_id: string;
  observation_state: ParticipantObservationState | string;
  attention_pattern: AttentionPattern | string;
  identity_state: IdentityState | string;
  active_presence_state: ActivePresenceState | string;
  browser_context: BrowserContextState | string;
  case_state: CaseState | string;
  warning_streak: number;
  clean_streak: number;
  coverage_ratio: number;
  active_reason_codes: string[];
  technical_reasons: string[];
  student_context_count: number;
  teacher_action_count: number;
  last_event_sequence?: number;
  updated_at?: string;
}

export interface FinalizedWindow {
  window_id: string;
  session_id: string;
  participant_id: string;
  window_start: string;
  window_end: string;
  expected_segments: number;
  usable_segments: number;
  coverage_ratio: number;
  observation_state: string;
  classification: string;
  cue_exposure_seconds: number;
  warning_streak: number;
  clean_streak: number;
  reason_codes: string[];
  technical_reasons: string[];
  is_demo: boolean;
  created_at: string;
}

export interface SessionCase {
  case_id: string;
  session_id: string;
  participant_id?: string;
  category: string;
  started_at: string;
  last_updated_at: string;
  duration_ms: number;
  status: string;
  priority: string;
  event_ids: string[];
  self_recovery_attempted: boolean;
  student_context_count: number;
  teacher_action_count: number;
}
