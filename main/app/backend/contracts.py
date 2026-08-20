"""
Chronos Canonical Domain Models, Enumerations & Event Schemas
Workstream W2: Domain Contracts and Event Persistence
Specification Version: 1.0 (Hackathon Baseline)
"""
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union
import uuid
from pydantic import BaseModel, Field, field_validator


# ===========================================================================
# 1. Canonical Domain Enumerations
# ===========================================================================

class PolicyId(str, Enum):
    CLASSROOM = "CLASSROOM"
    RESOURCE_SUPPORTED_ASSESSMENT = "RESOURCE_SUPPORTED_ASSESSMENT"
    SUPERVISED_ASSESSMENT = "SUPERVISED_ASSESSMENT"
    NO_ANALYTICS = "NO_ANALYTICS"


class EventType(str, Enum):
    # Session Lifecycle
    SESSION_CREATED = "SESSION_CREATED"
    SESSION_STARTED = "SESSION_STARTED"
    SESSION_ENDED = "SESSION_ENDED"
    POLICY_CHANGED = "POLICY_CHANGED"
    PARTICIPANT_JOINED = "PARTICIPANT_JOINED"
    PARTICIPANT_LEFT = "PARTICIPANT_LEFT"
    # Observation & Windowing
    OBSERVATION_SAMPLE = "OBSERVATION_SAMPLE"
    WINDOW_FINALIZED = "WINDOW_FINALIZED"
    NO_DATA_ENTERED = "NO_DATA_ENTERED"
    NO_DATA_EXITED = "NO_DATA_EXITED"
    # Technical Health
    CAMERA_STATE_CHANGED = "CAMERA_STATE_CHANGED"
    NETWORK_STATE_CHANGED = "NETWORK_STATE_CHANGED"
    # Identity Continuity
    IDENTITY_RESULT = "IDENTITY_RESULT"
    # Active Presence Protocol
    ACTIVE_PRESENCE_REQUESTED = "ACTIVE_PRESENCE_REQUESTED"
    ACTIVE_PRESENCE_STARTED = "ACTIVE_PRESENCE_STARTED"
    ACTIVE_PRESENCE_PASSED = "ACTIVE_PRESENCE_PASSED"
    ACTIVE_PRESENCE_RETRY_REQUIRED = "ACTIVE_PRESENCE_RETRY_REQUIRED"
    ACTIVE_PRESENCE_TIMED_OUT = "ACTIVE_PRESENCE_TIMED_OUT"
    ACTIVE_PRESENCE_DECLINED = "ACTIVE_PRESENCE_DECLINED"
    ACTIVE_PRESENCE_UNAVAILABLE = "ACTIVE_PRESENCE_UNAVAILABLE"
    # Browser Visibility & Focus
    PAGE_HIDDEN = "PAGE_HIDDEN"
    PAGE_VISIBLE = "PAGE_VISIBLE"
    WINDOW_BLURRED = "WINDOW_BLURRED"
    WINDOW_FOCUSED = "WINDOW_FOCUSED"
    FULLSCREEN_ENTERED = "FULLSCREEN_ENTERED"
    FULLSCREEN_EXITED = "FULLSCREEN_EXITED"
    # Resources
    RESOURCE_PUBLISHED = "RESOURCE_PUBLISHED"
    RESOURCE_OPENED = "RESOURCE_OPENED"
    RESOURCE_CLOSED = "RESOURCE_CLOSED"
    EXTERNAL_RESOURCE_CLICKED = "EXTERNAL_RESOURCE_CLICKED"
    # Answer Submission
    ANSWER_DRAFT_SAVED = "ANSWER_DRAFT_SAVED"
    ANSWER_SUBMITTED = "ANSWER_SUBMITTED"
    ANSWER_REPLACED = "ANSWER_REPLACED"
    ANSWER_MARKED_LATE = "ANSWER_MARKED_LATE"
    # Nudges & Appeals
    STUDENT_NUDGED = "STUDENT_NUDGED"
    STUDENT_CONTEXT_ADDED = "STUDENT_CONTEXT_ADDED"
    # Case Management
    CASE_CREATED = "CASE_CREATED"
    CASE_UPDATED = "CASE_UPDATED"
    CASE_RESOLVED = "CASE_RESOLVED"
    TEACHER_ACTION_RECORDED = "TEACHER_ACTION_RECORDED"


class WindowObservationState(str, Enum):
    VALID = "VALID"
    NO_DATA = "NO_DATA"


class ParticipantObservationState(str, Enum):
    OBSERVABLE = "OBSERVABLE"
    NO_DATA = "NO_DATA"
    LEFT = "LEFT"


class WindowClassification(str, Enum):
    VALID_CLEAN = "VALID_CLEAN"
    VALID_WARNING = "VALID_WARNING"
    CLEAN = "CLEAN"
    WARNING = "WARNING"
    NOT_EVALUATED = "NOT_EVALUATED"


class AttentionPattern(str, Enum):
    STABLE = "STABLE"
    VARIABLE = "VARIABLE"
    SUSTAINED_CONCERN = "SUSTAINED_CONCERN"
    UNKNOWN = "UNKNOWN"


class IdentityState(str, Enum):
    NOT_REQUESTED = "NOT_REQUESTED"
    UNENROLLED = "UNENROLLED"
    CHECKING = "CHECKING"
    VERIFIED = "VERIFIED"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    QUALITY_FAIL = "QUALITY_FAIL"
    MISMATCH = "MISMATCH"
    UNAVAILABLE = "UNAVAILABLE"
    MANUAL_REVIEW = "MANUAL_REVIEW"


class ActivePresenceState(str, Enum):
    NOT_REQUESTED = "NOT_REQUESTED"
    REQUESTED = "REQUESTED"
    IN_PROGRESS = "IN_PROGRESS"
    PASSED = "PASSED"
    QUALITY_FAIL = "QUALITY_FAIL"
    TIMED_OUT = "TIMED_OUT"
    DECLINED = "DECLINED"
    UNAVAILABLE = "UNAVAILABLE"
    RETRY_REQUIRED = "RETRY_REQUIRED"
    MANUAL_REVIEW = "MANUAL_REVIEW"


class BrowserContextState(str, Enum):
    NO_ACTIVE_EVENT = "NO_ACTIVE_EVENT"
    PAGE_HIDDEN = "PAGE_HIDDEN"
    WINDOW_BLURRED = "WINDOW_BLURRED"
    FULLSCREEN_EXITED = "FULLSCREEN_EXITED"
    DESTINATION_UNKNOWN = "DESTINATION_UNKNOWN"


class CaseState(str, Enum):
    NONE = "NONE"
    SELF_RECOVERY = "SELF_RECOVERY"
    MONITOR = "MONITOR"
    ACTION_REQUIRED = "ACTION_REQUIRED"
    CONTEXT_ADDED = "CONTEXT_ADDED"
    RESOLVED = "RESOLVED"


class CaseStatus(str, Enum):
    OPEN = "OPEN"
    MONITOR = "MONITOR"
    ACTION_REQUIRED = "ACTION_REQUIRED"
    SNOOZED = "SNOOZED"
    SELF_RECOVERED = "SELF_RECOVERED"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"


class CaseCategory(str, Enum):
    TECHNICAL_CAMERA = "TECHNICAL_CAMERA"
    TECHNICAL_NETWORK = "TECHNICAL_NETWORK"
    ATTENTION_CONCERN = "ATTENTION_CONCERN"
    IDENTITY_UNCERTAINTY = "IDENTITY_UNCERTAINTY"
    BROWSER_VISIBILITY = "BROWSER_VISIBILITY"
    STUDENT_HELP_REQUEST = "STUDENT_HELP_REQUEST"
    SESSION_INCIDENT = "SESSION_INCIDENT"


class CasePriority(str, Enum):
    STUDENT_ONLY = "STUDENT_ONLY"
    CLASS_SUMMARY = "CLASS_SUMMARY"
    MONITOR = "MONITOR"
    ACTION_REQUIRED = "ACTION_REQUIRED"
    URGENT = "URGENT"


class TechnicalReasonCode(str, Enum):
    CAMERA_UNAVAILABLE = "CAMERA_UNAVAILABLE"
    CAMERA_PERMISSION_DENIED = "CAMERA_PERMISSION_DENIED"
    CAMERA_POOR_QUALITY = "CAMERA_POOR_QUALITY"
    NO_FACE_DETECTED = "NO_FACE_DETECTED"
    MULTIPLE_FACES_DETECTED = "MULTIPLE_FACES_DETECTED"
    IMAGE_QUALITY_INSUFFICIENT = "IMAGE_QUALITY_INSUFFICIENT"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    NETWORK_DEGRADED = "NETWORK_DEGRADED"
    NETWORK_DISCONNECTED = "NETWORK_DISCONNECTED"
    CPU_OVERLOAD = "CPU_OVERLOAD"
    CONSENT_MISSING = "CONSENT_MISSING"
    SYSTEM_BACKGROUND = "SYSTEM_BACKGROUND"


class AttentionReasonCode(str, Enum):
    ORIENTATION_AWAY = "ORIENTATION_AWAY"
    HEAD_TURNED = "HEAD_TURNED"
    PROLONGED_ABSENCE = "PROLONGED_ABSENCE"
    SUSTAINED_LOW_SIGNAL = "SUSTAINED_LOW_SIGNAL"
    PERSISTENT_NON_FORWARD = "PERSISTENT_NON_FORWARD"


class ActivePresenceAction(str, Enum):
    TURN_LEFT = "TURN_LEFT"
    TURN_RIGHT = "TURN_RIGHT"
    LOOK_UP = "LOOK_UP"
    LOOK_DOWN = "LOOK_DOWN"
    NOD = "NOD"
    RETURN_NEUTRAL = "RETURN_NEUTRAL"


class ConsentCategory(str, Enum):
    LIVE_SESSION_PARTICIPATION = "LIVE_SESSION_PARTICIPATION"
    CAMERA_LOCAL_PROCESSING = "CAMERA_LOCAL_PROCESSING"
    IDENTITY_ENROLLMENT = "IDENTITY_ENROLLMENT"
    IDENTITY_VERIFICATION = "IDENTITY_VERIFICATION"
    ACTIVE_PRESENCE_CHECKS = "ACTIVE_PRESENCE_CHECKS"
    ATTENTION_TELEMETRY = "ATTENTION_TELEMETRY"
    BROWSER_CONTEXT_TELEMETRY = "BROWSER_CONTEXT_TELEMETRY"
    ANSWER_STORAGE = "ANSWER_STORAGE"


class AppealCategory(str, Enum):
    CAMERA_LIGHTING_DEVICE = "CAMERA_LIGHTING_DEVICE"
    NETWORK_CONNECTIVITY = "NETWORK_CONNECTIVITY"
    SIGNAL_MISMATCH = "SIGNAL_MISMATCH"
    DECLARED_RESOURCE_USE = "DECLARED_RESOURCE_USE"
    ACCESSIBILITY_ACCOMMODATION = "ACCESSIBILITY_ACCOMMODATION"
    IDENTITY_VERIFICATION_ISSUE = "IDENTITY_VERIFICATION_ISSUE"
    OTHER = "OTHER"


class ActorRole(str, Enum):
    participant = "participant"
    teacher = "teacher"
    system = "system"
    admin = "admin"


class EventSource(str, Enum):
    browser = "browser"
    camera = "camera"
    server = "server"
    teacher = "teacher"
    meeting_provider = "meeting_provider"


# ===========================================================================
# 2. Specific Event Payload Schemas
# ===========================================================================

class ObservationSamplePayload(BaseModel):
    sample_id: Optional[str] = None
    sample_index: Optional[int] = None
    timestamp: Optional[str] = None
    usable: bool = True
    camera_active: bool = True
    face_count: int = 1
    quality_score: float = Field(default=1.0, ge=0.0, le=1.0)
    pose_confidence: Optional[float] = Field(default=1.0, ge=0.0, le=1.0)
    orientation_away: bool = False
    cue_away: Optional[bool] = None
    pitch_deg: Optional[float] = None
    yaw_deg: Optional[float] = None
    roll_deg: Optional[float] = None
    technical_reasons: List[str] = []
    attention_reasons: List[str] = []
    local_processing_ms: float = 0.0


class WindowFinalizedPayload(BaseModel):
    window_id: str
    window_start: Optional[str] = None
    window_end: Optional[str] = None
    expected_segments: int = 12
    usable_segments: int = 12
    coverage_ratio: float = Field(default=1.0, ge=0.0, le=1.0)
    observation_state: str = "VALID"
    classification: str = "VALID_CLEAN"
    cue_exposure_seconds: float = 0.0
    warning_streak: int = 0
    clean_streak: int = 0
    reason_codes: List[str] = []
    technical_reasons: List[str] = []


class NoDataEnteredPayload(BaseModel):
    started_at: str
    primary_reason: str = "CAMERA_UNAVAILABLE"
    technical_reasons: List[str] = []
    last_valid_window_id: Optional[str] = None
    warning_streak_frozen: int = 0


class NoDataExitedPayload(BaseModel):
    started_at: str
    ended_at: str
    duration_ms: int = 0
    exit_reason: str = "CAMERA_RESTORED"
    streak_reset: bool = False


class CameraStateChangedPayload(BaseModel):
    previous_state: str
    current_state: str
    is_usable: bool
    reason: Optional[str] = None


class NetworkStateChangedPayload(BaseModel):
    previous_state: str
    current_state: str
    rtt_ms: Optional[int] = None
    packet_loss_pct: Optional[float] = None
    is_usable: bool = True


class IdentityResultPayload(BaseModel):
    check_id: str
    identity_state: str = "VERIFIED"
    confidence_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    quality_score: float = Field(default=1.0, ge=0.0, le=1.0)
    comparison_target: str = "session_baseline"
    failure_reason: Optional[str] = None
    alternative_verification_used: bool = False


class ActivePresenceChallengePayload(BaseModel):
    challenge_id: str
    sequence: Optional[List[str]] = None
    actions: Optional[List[str]] = None
    nonce: Optional[str] = None
    expires_at: Optional[str] = None
    expires_in_sec: Optional[int] = 15
    attempt_number: int = 1
    max_attempts: int = 2
    trigger: Optional[str] = "join"
    status: Optional[str] = "REQUESTED"
    result_state: Optional[str] = None
    elapsed_ms: Optional[int] = None
    failure_reason: Optional[str] = None
    alternative_verification_used: bool = False


class BrowserVisibilityPayload(BaseModel):
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_ms: Optional[int] = None
    visibility_state: Optional[str] = "HIDDEN"
    destination_known: Literal[False] = False
    declared_resource_opened_recently: bool = False
    associated_declared_resource_id: Optional[str] = None
    context_note: Optional[str] = None


class ResourcePayload(BaseModel):
    resource_id: str
    type: Optional[str] = None
    resource_type: Optional[str] = None
    title: str
    description: Optional[str] = None
    required: Optional[bool] = None
    is_required: Optional[bool] = None
    storage_path: Optional[str] = None
    declared_url: Optional[str] = None
    allowed_domain: Optional[str] = None
    content_hash: Optional[str] = None
    size_bytes: Optional[int] = None
    byte_size: Optional[int] = None
    immutable_after_start: bool = True
    opened_at: Optional[str] = None
    closed_at: Optional[str] = None
    duration_ms: Optional[int] = None


class AnswerSubmissionPayload(BaseModel):
    submission_id: str
    version: int = 1
    status: str = "SUBMITTED"  # "DRAFT" | "SUBMITTED" | "REPLACED" | "LATE"
    artifact_type: Optional[str] = "pdf_upload"
    content_hash: str
    byte_size: Optional[int] = None
    size_bytes: Optional[int] = None
    storage_path: Optional[str] = None
    is_late: bool = False
    submitted_at: Optional[str] = None


class StudentNudgePayload(BaseModel):
    nudge_id: str
    nudge_type: str
    delivery_channel: str = "in_app_banner"
    auto_dismiss_seconds: int = 8


class StudentContextAddedPayload(BaseModel):
    context_id: str
    appeal_category: str
    explanation_text: Optional[str] = None
    requested_help: bool = False
    attached_to_event_ids: List[str] = []
    attached_at: Optional[str] = None


class CasePayload(BaseModel):
    case_id: str
    session_id: Optional[str] = None
    participant_id: Optional[str] = None
    category: str
    status: str = "OPEN"
    priority: str = "MONITOR"
    reason_summary: Optional[str] = None
    started_at: Optional[str] = None
    last_updated_at: Optional[str] = None
    resolved_at: Optional[str] = None
    duration_ms: int = 0
    event_ids: List[str] = []
    self_recovery_attempted: bool = False
    student_context_count: int = 0
    teacher_action_count: int = 0
    affected_participant_count: Optional[int] = None
    resolution_reason: Optional[str] = None


class TeacherActionRecordedPayload(BaseModel):
    action_id: str
    action_type: str
    target_participant_ids: List[str] = []
    target_case_ids: List[str] = []
    is_batch: bool = False
    note: Optional[str] = None
    snooze_duration_minutes: Optional[int] = None


# ===========================================================================
# 3. Canonical Versioned Event Envelope (schema_version: 1)
# ===========================================================================

PROHIBITED_PAYLOAD_KEYS = {
    "raw_frame", "frame_base64", "image_bytes", "video_chunk",
    "landmarks", "face_mesh", "continuous_landmarks", "face_crop",
    "embedding", "embeddings",
    "answer_text", "submission_body", "jwt", "jwt_token", "token", "secret", "password", "api_key",
    "medical_info", "diagnosis", "disability", "health_data", "medical_history"
}


class EventEnvelope(BaseModel):
    event_id: str
    event_type: Union[EventType, str]
    schema_version: Literal[1] = 1
    tenant_id: str
    session_id: str
    participant_id: Optional[str] = None
    actor_id: str
    actor_role: Union[ActorRole, str]
    source: Union[EventSource, str]
    occurred_at: str
    received_at: Optional[str] = None
    server_sequence: Optional[int] = None
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None
    policy_id: Union[PolicyId, str]
    policy_version: str = "v1"
    model_versions: Dict[str, str] = Field(default_factory=dict)
    is_demo: bool = False
    payload: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_id")
    @classmethod
    def validate_event_id_format(cls, v: str) -> str:
        try:
            uuid.UUID(str(v))
        except (ValueError, AttributeError):
            # Accept custom fixture IDs or standard UUIDs
            if not isinstance(v, str) or len(v.strip()) == 0:
                raise ValueError("event_id must be a non-empty string")
        return v

    @field_validator("payload")
    @classmethod
    def validate_prohibited_fields(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        """Enforce strict privacy boundaries against surveillance and credential data."""
        if not isinstance(v, dict):
            return v
        for key in v.keys():
            if str(key).lower() in PROHIBITED_PAYLOAD_KEYS:
                raise ValueError(f"Prohibited sensitive field '{key}' detected in event payload.")
        return v

    @classmethod
    def create(
        cls,
        event_id: str,
        event_type: Union[EventType, str],
        tenant_id: str,
        session_id: str,
        actor_id: str,
        actor_role: Union[ActorRole, str],
        source: Union[EventSource, str],
        occurred_at: str,
        policy_id: Union[PolicyId, str],
        participant_id: Optional[str] = None,
        received_at: Optional[str] = None,
        server_sequence: Optional[int] = None,
        correlation_id: Optional[str] = None,
        causation_id: Optional[str] = None,
        policy_version: str = "v1",
        model_versions: Optional[Dict[str, str]] = None,
        is_demo: bool = False,
        payload: Optional[Dict[str, Any]] = None,
    ) -> EventEnvelope:
        return cls(
            event_id=event_id,
            event_type=event_type,
            schema_version=1,
            tenant_id=tenant_id,
            session_id=session_id,
            participant_id=participant_id,
            actor_id=actor_id,
            actor_role=actor_role,
            source=source,
            occurred_at=occurred_at,
            received_at=received_at,
            server_sequence=server_sequence,
            correlation_id=correlation_id or str(uuid.uuid4()),
            causation_id=causation_id,
            policy_id=policy_id,
            policy_version=policy_version,
            model_versions=model_versions or {},
            is_demo=is_demo,
            payload=payload or {},
        )
