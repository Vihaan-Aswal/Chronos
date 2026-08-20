"""
Chronos W1 Domain Models, Enums & Lifecycle Validators
"""
from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class TenantRole(str, Enum):
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT = "student"


class SessionStatus(str, Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    EXPIRED = "EXPIRED"


class PolicyId(str, Enum):
    CLASSROOM = "CLASSROOM"
    RESOURCE_SUPPORTED_ASSESSMENT = "RESOURCE_SUPPORTED_ASSESSMENT"
    SUPERVISED_ASSESSMENT = "SUPERVISED_ASSESSMENT"
    NO_ANALYTICS = "NO_ANALYTICS"


class ParticipantRole(str, Enum):
    TEACHER = "teacher"
    STUDENT = "student"
    GUEST = "guest"


class ParticipantStatus(str, Enum):
    INVITED = "INVITED"
    ADMITTED = "ADMITTED"
    DECLINED = "DECLINED"
    REMOVED = "REMOVED"


# ---------------------------------------------------------------------------
# Policy Snapshot Specification
# ---------------------------------------------------------------------------

class PolicySnapshot(BaseModel):
    policy_id: PolicyId
    policy_version: str = "v1"
    camera_required: bool = False
    identity_verification_enabled: bool = False
    attention_signals_enabled: bool = True
    active_presence_enabled: bool = False
    browser_context_tracking: bool = True
    question_paper_required: bool = False
    answer_submission_enabled: bool = False
    cooldown_student_sec: int = 300
    cooldown_teacher_sec: int = 600

    @classmethod
    def create_snapshot_for_policy(
        cls, policy_id: PolicyId, is_demo: bool = False
    ) -> PolicySnapshot:
        """Resolves canonical preset matrix into a frozen snapshot."""
        cooldown_student = 20 if is_demo else 300
        cooldown_teacher = 30 if is_demo else 600

        if policy_id == PolicyId.CLASSROOM:
            return cls(
                policy_id=policy_id,
                camera_required=False,
                identity_verification_enabled=False,
                attention_signals_enabled=True,
                active_presence_enabled=False,
                browser_context_tracking=False,
                question_paper_required=False,
                answer_submission_enabled=False,
                cooldown_student_sec=cooldown_student,
                cooldown_teacher_sec=cooldown_teacher,
            )
        elif policy_id == PolicyId.RESOURCE_SUPPORTED_ASSESSMENT:
            return cls(
                policy_id=policy_id,
                camera_required=False,
                identity_verification_enabled=False,
                attention_signals_enabled=True,
                active_presence_enabled=True,
                browser_context_tracking=True,
                question_paper_required=True,
                answer_submission_enabled=True,
                cooldown_student_sec=cooldown_student,
                cooldown_teacher_sec=cooldown_teacher,
            )
        elif policy_id == PolicyId.SUPERVISED_ASSESSMENT:
            return cls(
                policy_id=policy_id,
                camera_required=True,
                identity_verification_enabled=True,
                attention_signals_enabled=True,
                active_presence_enabled=True,
                browser_context_tracking=True,
                question_paper_required=True,
                answer_submission_enabled=True,
                cooldown_student_sec=cooldown_student,
                cooldown_teacher_sec=cooldown_teacher,
            )
        elif policy_id == PolicyId.NO_ANALYTICS:
            return cls(
                policy_id=policy_id,
                camera_required=False,
                identity_verification_enabled=False,
                attention_signals_enabled=False,
                active_presence_enabled=False,
                browser_context_tracking=False,
                question_paper_required=False,
                answer_submission_enabled=True,
                cooldown_student_sec=cooldown_student,
                cooldown_teacher_sec=cooldown_teacher,
            )
        return cls(policy_id=policy_id)


# ---------------------------------------------------------------------------
# API Request / Response Schemas
# ---------------------------------------------------------------------------

class SessionCreateRequest(BaseModel):
    title: str
    tenant_id: Optional[str] = None
    policy_id: PolicyId = PolicyId.CLASSROOM
    is_demo: bool = False
    room_id: Optional[str] = None
    expires_in_minutes: int = 180


class SessionAdmissionRequest(BaseModel):
    consent_granted: bool = True


class WSTicketRequest(BaseModel):
    session_id: str
    channel: str = "engagement"  # "engagement" | "teacher"


class TokenRequest(BaseModel):
    user_name: Optional[str] = None
    role: Optional[str] = None
    session_id: Optional[str] = None


class EmbeddingPayload(BaseModel):
    user_id: Optional[str] = None
    embedding: List[float]


class NudgePayload(BaseModel):
    session_id: str
    user_id: str
    nudge_type: str


class SessionModePayload(BaseModel):
    session_id: str
    mode: str  # "strict" | "normal"


class ClassContextPayload(BaseModel):
    session_id: str
    context: str  # "class" | "exam"


class TeacherActionPayload(BaseModel):
    session_id: str
    user_id: str
    action: str  # "mark_engaged" | "ignore" | "remove" | "message"
    message_text: Optional[str] = None


class LivenessTriggerPayload(BaseModel):
    session_id: str
    user_id: Optional[str] = None


class ActivePresenceChallengeRequest(BaseModel):
    participant_id: Optional[str] = None
    trigger: str = "teacher_request"
    custom_actions: Optional[List[str]] = None


class ActivePresenceResponseRequest(BaseModel):
    challenge_id: str
    nonce: str
    submitted_actions: Optional[List[str]] = None
    quality_ok: bool = True
    elapsed_ms: Optional[int] = None
    is_neutral_baseline_held: bool = True
    is_return_to_neutral_held: bool = True
    alternative_verification: bool = False


class ActivePresenceDeclineRequest(BaseModel):
    challenge_id: str
    reason: Optional[str] = None


class ActivePresenceManualReviewRequest(BaseModel):
    challenge_id: str
    reason: Optional[str] = None


class SessionMetric(BaseModel):
    timestamp: str
    avg_score: float
    student_count: int


class ConfusionHotspot(BaseModel):
    time: str
    percentage: int
    student_count: int
    timestamp: str


class AtRiskStudent(BaseModel):
    userId: str
    avgScore: float
    strikes: int


class SessionAnalyticsPayload(BaseModel):
    session_id: str
    teacher_id: Optional[str] = None
    start_time: str
    end_time: str
    duration_minutes: float
    avg_engagement_score: float
    total_students: int
    metrics_timeline: List[Dict[str, Any]]
    confusion_hotspots: Optional[List[ConfusionHotspot]] = []
    at_risk_students: Optional[List[AtRiskStudent]] = []
    tpi: Optional[float] = None


class SafeErrorDetail(BaseModel):
    error_code: str
    message: str
    request_id: Optional[str] = None
    retry_after_seconds: Optional[int] = None


# ---------------------------------------------------------------------------
# Resource-Supported Assessment Models & Enums
# ---------------------------------------------------------------------------

class ResourceType(str, Enum):
    UPLOADED_PDF = "uploaded_pdf"
    UPLOADED_IMAGE = "uploaded_image"
    EXTERNAL_LINK = "external_link"


class ResourceCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    resource_type: ResourceType = ResourceType.UPLOADED_PDF
    required: bool = False
    allowed_from: Optional[str] = None
    allowed_until: Optional[str] = None


class ExternalLinkCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    declared_url: str
    allowed_domain: Optional[str] = None
    required: bool = False
    allowed_from: Optional[str] = None
    allowed_until: Optional[str] = None


class ResourceEventRequest(BaseModel):
    event_type: str
    duration_ms: Optional[int] = None


class ResourceResponse(BaseModel):
    resource_id: str
    session_id: str
    type: str
    title: str
    description: Optional[str] = None
    storage_path: Optional[str] = None
    declared_url: Optional[str] = None
    allowed_domain: Optional[str] = None
    allowed_from: Optional[str] = None
    allowed_until: Optional[str] = None
    required: bool = False
    is_primary: bool = False
    immutable_after_start: bool = True
    content_hash: Optional[str] = None
    size_bytes: Optional[int] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None


class ResourceAccessResponse(BaseModel):
    resource_id: str
    access_url: str
    expires_in_seconds: int = 900


class AnswerDraftRequest(BaseModel):
    typed_content: Optional[str] = None


class AnswerSubmitRequest(BaseModel):
    typed_content: Optional[str] = None
    is_final: bool = True
    client_submission_id: Optional[str] = None


class AnswerResponse(BaseModel):
    answer_id: str
    session_id: str
    participant_id: str
    version: int = 1
    status: str = "SUBMITTED"
    artifact_type: Optional[str] = "pdf_upload"
    content_hash: Optional[str] = None
    byte_size: Optional[int] = None
    storage_path: Optional[str] = None
    typed_content: Optional[str] = None
    submitted_at: Optional[str] = None
    is_late: bool = False


class SubmissionListResponse(BaseModel):
    submissions: List[AnswerResponse] = Field(default_factory=list)
    items: Optional[List[AnswerResponse]] = None

    def model_post_init(self, __context: Any) -> None:
        if self.items is None and self.submissions:
            self.items = self.submissions
        elif not self.submissions and self.items:
            self.submissions = self.items

