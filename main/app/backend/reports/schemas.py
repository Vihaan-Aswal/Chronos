"""
Chronos Authoritative Report Read-Model Schemas
Workstream W8: Timeline-Led Reports and Exports
Specification: HACKATHON_PRD.md, LOGIC_AND_EVENT_SPEC.md, PRIVACY_DATA_MODEL.md
"""
from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Canonical Review Prioritization Enums & Models
# ---------------------------------------------------------------------------

class ReviewPriorityLevel(str, Enum):
    ACTION_REQUIRED = "ACTION_REQUIRED"
    MONITOR = "MONITOR"
    TECHNICAL_REVIEW = "TECHNICAL_REVIEW"
    CONTEXT_REVIEW = "CONTEXT_REVIEW"
    RESOLVED = "RESOLVED"
    STABLE = "STABLE"


class ReviewPrioritizationItem(BaseModel):
    participant_id: str
    display_name: str
    priority_level: ReviewPriorityLevel = ReviewPriorityLevel.MONITOR
    primary_category: str
    evidence_reasons: List[str] = Field(
        default_factory=list,
        description="Factual, evidence-led justifications (no verdict language)",
    )
    warning_streak: int = 0
    clean_streak: int = 0
    coverage_ratio: float = 1.0
    no_data_duration_sec: float = 0.0
    identity_state: str = "NOT_REQUESTED"
    active_presence_state: str = "NOT_REQUESTED"
    student_context_count: int = 0
    teacher_action_count: int = 0
    has_active_case: bool = False
    active_case_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Section Summaries
# ---------------------------------------------------------------------------

class SessionOverview(BaseModel):
    session_id: str
    tenant_id: str
    teacher_id: str
    title: str
    policy_id: str
    policy_version: str = "v1"
    policy_snapshot: Dict[str, Any] = Field(default_factory=dict)
    model_versions: Dict[str, str] = Field(default_factory=dict)
    is_demo: bool = False
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_seconds: float = 0.0
    duration_minutes: float = 0.0
    total_participants: int = 0
    live_participants_count: int = 0
    simulated_participants_count: int = 0
    session_status: str = "ENDED"


class ObservationCoverageSummary(BaseModel):
    total_expected_windows: int = 0
    total_evaluated_windows: int = 0
    valid_clean_windows: int = 0
    valid_warning_windows: int = 0
    no_data_windows: int = 0
    overall_coverage_ratio: float = 1.0
    total_usable_segments: int = 0
    total_expected_segments: int = 0
    is_sufficient_for_interpretation: bool = True


class TechnicalUncertaintySummary(BaseModel):
    total_no_data_duration_sec: float = 0.0
    affected_participant_count: int = 0
    reason_counts: Dict[str, int] = Field(default_factory=dict)
    technical_episodes: List[Dict[str, Any]] = Field(default_factory=list)
    camera_unavailable_sec: float = 0.0
    network_degraded_sec: float = 0.0
    quality_insufficient_sec: float = 0.0


class AttentionPatternSummary(BaseModel):
    distribution: Dict[str, int] = Field(
        default_factory=lambda: {
            "STABLE": 0,
            "VARIABLE": 0,
            "SUSTAINED_CONCERN": 0,
            "UNKNOWN": 0,
        }
    )
    total_valid_windows: int = 0
    valid_clean_windows: int = 0
    valid_warning_windows: int = 0
    cue_exposure_seconds_total: float = 0.0
    attention_timeline: List[Dict[str, Any]] = Field(default_factory=list)


class IdentityOutcomesSummary(BaseModel):
    total_checks: int = 0
    outcomes_breakdown: Dict[str, int] = Field(
        default_factory=lambda: {
            "NOT_REQUESTED": 0,
            "UNENROLLED": 0,
            "CHECKING": 0,
            "VERIFIED": 0,
            "LOW_CONFIDENCE": 0,
            "QUALITY_FAIL": 0,
            "MISMATCH": 0,
            "UNAVAILABLE": 0,
            "MANUAL_REVIEW": 0,
        }
    )
    alternative_verifications_count: int = 0
    participants_requiring_review: List[str] = Field(default_factory=list)


class ActivePresenceSummary(BaseModel):
    total_challenges_issued: int = 0
    passed_count: int = 0
    quality_fail_count: int = 0
    timed_out_count: int = 0
    declined_count: int = 0
    unavailable_count: int = 0
    retry_required_count: int = 0
    manual_review_count: int = 0
    average_completion_ms: Optional[float] = None
    challenges: List[Dict[str, Any]] = Field(default_factory=list)


class BrowserVisibilitySummary(BaseModel):
    total_intervals: int = 0
    total_duration_sec: float = 0.0
    destination_known: bool = False  # Strictly False per invariant
    destination_unverified_notice: str = (
        "Browser visibility measures page focus/blur transitions only. "
        "Chronos does not monitor URLs or track external browser activity."
    )
    declared_resource_associated_count: int = 0
    intervals: List[Dict[str, Any]] = Field(default_factory=list)


class ResourceUsageSummary(BaseModel):
    primary_question_paper: Optional[Dict[str, Any]] = None
    supplementary_resources: List[Dict[str, Any]] = Field(default_factory=list)
    declared_external_links: List[Dict[str, Any]] = Field(default_factory=list)
    total_access_events: int = 0
    access_timeline: List[Dict[str, Any]] = Field(default_factory=list)


class AnswerSubmissionsSummary(BaseModel):
    total_submissions: int = 0
    draft_count: int = 0
    final_submitted_count: int = 0
    replaced_count: int = 0
    late_count: int = 0
    submissions: List[Dict[str, Any]] = Field(default_factory=list)


class StudentContextSummary(BaseModel):
    total_appeals: int = 0
    category_counts: Dict[str, int] = Field(default_factory=dict)
    help_requests_count: int = 0
    context_entries: List[Dict[str, Any]] = Field(default_factory=list)


class TeacherActionsSummary(BaseModel):
    total_actions_recorded: int = 0
    action_type_counts: Dict[str, int] = Field(default_factory=dict)
    batch_action_count: int = 0
    actions_log: List[Dict[str, Any]] = Field(default_factory=list)


class RecoveryOutcomesSummary(BaseModel):
    total_cases_created: int = 0
    self_resolved_cases_count: int = 0
    teacher_resolved_cases_count: int = 0
    unresolved_cases_count: int = 0
    self_recovery_rate_pct: float = 0.0
    average_recovery_duration_sec: Optional[float] = None


# ---------------------------------------------------------------------------
# Participant Drilldown Model
# ---------------------------------------------------------------------------

class ParticipantDrilldown(BaseModel):
    participant_id: str
    display_name: str
    is_simulated: bool = False
    observation_state: str = "OBSERVABLE"
    attention_pattern: str = "UNKNOWN"
    coverage_ratio: float = 1.0
    no_data_duration_sec: float = 0.0
    warning_streak: int = 0
    clean_streak: int = 0
    identity_state: str = "NOT_REQUESTED"
    active_presence_state: str = "NOT_REQUESTED"
    browser_context_state: str = "NO_ACTIVE_EVENT"
    case_state: str = "NONE"
    active_reason_codes: List[str] = Field(default_factory=list)
    technical_reasons: List[str] = Field(default_factory=list)
    windows: List[Dict[str, Any]] = Field(default_factory=list)
    browser_intervals: List[Dict[str, Any]] = Field(default_factory=list)
    active_presence_history: List[Dict[str, Any]] = Field(default_factory=list)
    identity_history: List[Dict[str, Any]] = Field(default_factory=list)
    resource_accesses: List[Dict[str, Any]] = Field(default_factory=list)
    submissions: List[Dict[str, Any]] = Field(default_factory=list)
    context_entries: List[Dict[str, Any]] = Field(default_factory=list)
    teacher_actions: List[Dict[str, Any]] = Field(default_factory=list)
    cases: List[Dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Event Reconciliation
# ---------------------------------------------------------------------------

class EventReconciliation(BaseModel):
    total_events_processed: int = 0
    counts_by_event_type: Dict[str, int] = Field(default_factory=dict)
    reconciliation_verified: bool = True
    discrepancy_note: Optional[str] = None


# ---------------------------------------------------------------------------
# Master Canonical Report Read Model
# ---------------------------------------------------------------------------

class ReportReadModel(BaseModel):
    report_id: str
    session_id: str
    tenant_id: str
    generated_at: str
    schema_version: int = 1
    session_overview: SessionOverview
    observation_coverage: ObservationCoverageSummary
    technical_uncertainty: TechnicalUncertaintySummary
    attention_patterns: AttentionPatternSummary
    identity_outcomes: IdentityOutcomesSummary
    active_presence: ActivePresenceSummary
    browser_visibility: BrowserVisibilitySummary
    resource_usage: ResourceUsageSummary
    answer_submissions: AnswerSubmissionsSummary
    student_context: StudentContextSummary
    teacher_actions: TeacherActionsSummary
    recovery_outcomes: RecoveryOutcomesSummary
    review_prioritization: List[ReviewPrioritizationItem] = Field(default_factory=list)
    participant_drilldowns: Dict[str, ParticipantDrilldown] = Field(default_factory=dict)
    event_reconciliation: EventReconciliation
    is_suppressed_by_policy: bool = False
    suppression_reason: Optional[str] = None
